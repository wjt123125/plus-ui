<template>
  <div class="chainwb-page">
    <!--
      链路工作台（三栏推拉布局，无遮罩抽屉，与组件工作台同构）：
        AI 助手栏 / 工作面板（链路画布多 tab，主内容区常驻） / 链路树（目录 + 链路 + 精选模板）
      tab 身份 = 链路（canvas:{chainId}，同链单例），v-show 切换不销毁，切走草稿保留；
      关闭脏 tab 弹确认。分栏宽度与开合状态记 localStorage。
      高度由 wrapper 吃 calc(100vh - 123px)、header flex-shrink:0、.chainwb flex:1 三段式分配。

      原链路管理 list 页的五个链路操作（编辑/复制/发布·下线/执行/删除）已下沉到链路树右键菜单，
      菜单只负责派发 chain-action；本组件统一承接弹窗、API 调用、tab 联动与执行终端写入。
    -->
    <WorkbenchHeader
      v-model:ai-collapsed="aiCollapsed"
      v-model:nav-collapsed="drawerCollapsed"
      v-model:console-open="consoleOpen"
      ai-label="AI 助手"
      nav-label="右侧面板"
      console-label="执行记录"
      :console-count="consoleErrorCount"
    />

    <div class="chainwb">
      <!-- 栏 1：AI 助手（v1 空壳预留，点击建议无动作） -->
      <AiAssistantRail
        :collapsed="aiCollapsed"
        :width="aiWidth"
        title="AI 助手"
        welcome-title="链路助手"
        welcome-desc="用自然语言定位链路、解释编排意图，辅助排查链路执行问题。"
      />
      <Splitter v-if="!aiCollapsed" v-model="aiWidth" />

      <!-- 栏 2：工作面板（主内容区，常驻不可折叠） -->
      <ChainWorkPanel
        v-model:active-key="activeKey"
        :tabs="tabs"
        @close="wb.close"
        @dirty-change="wb.setDirty"
      />

      <!-- 栏 3：右侧抽屉（TRAE 式 header 四 tab：链路树/属性/EL预览/大纲）。
           折叠不收边销毁（宽度收 0 + overflow 裁剪），tab 停留位、树展开/搜索态全部保活；
           属性/EL/大纲的数据读当前激活画布上报的名片（activePort） -->
      <Splitter v-if="!drawerCollapsed" v-model="drawerWidth" target="next" />
      <div class="chainwb__drawer" :style="{ width: (drawerCollapsed ? 0 : drawerWidth) + 'px' }">
        <EditorDrawer
          :port="activePort"
          show-tree-tab
          default-tab="tree"
          :style="{ width: drawerWidth + 'px' }"
          @fold="setDrawerCollapsed(true)"
        >
          <template #tree>
            <ChainTree
              ref="treeRef"
              :active-chain-id="activeTab?.chainId ?? null"
              @open="wb.openCanvas"
              @chain-action="onChainAction"
              @add-chain="onAddChain"
            />
          </template>
        </EditorDrawer>
      </div>
    </div>

    <!-- 底部执行控制台：树右键「执行」结果汇入（Trae terminal 范式），跑完自动弹出；
         作为 .chainwb 的 flex 兄弟节点插入，展开时 .chainwb flex:1 自动让位，无需重算高度 -->
    <ExecuteConsole />

    <!-- 链路新增/编辑（树头部/目录右键新建与叶子编辑共用；成功后刷树，新建连画布 tab 一起开） -->
    <ChainForm ref="chainFormRef" @success="onChainFormSaved" />
    <!-- 复制链路/使用模板共用弹窗；created 后按模式决定只 reload 还是连副本画布 tab 一起开 -->
    <ChainCopyDialog ref="copyDialogRef" @created="onCopyCreated" />
    <!-- 手动执行（lockedChainId 预选树节点链路，选择框禁用）；结果写执行终端，不再弹跳转询问 -->
    <ManualExecuteDialog
      v-model:visible="executeDialogVisible"
      :locked-chain-id="executeCtx?.chainId"
      @executed="onExecuted"
    />
  </div>
</template>

<script setup name="DatabusChainWorkbench" lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import modal from '@/plugins/modal';
import { delChain, offlineChain, publishChain } from '@/api/databus/chain';
import type { DatabusExecutionResult } from '@/api/databus/execution/types';
import { usePersisted } from '../../workbench/composables/usePersisted';
import { usePanelCollapse } from '../../editor/composables/usePanelCollapse';
import { useActiveDrawerPort } from '../../editor/composables/useDrawerPort';
import EditorDrawer from '../../editor/components/drawer/EditorDrawer.vue';
import Splitter from '../../workbench/components/Splitter.vue';
import WorkbenchHeader from '../../workbench/components/WorkbenchHeader.vue';
import ExecuteConsole from '../../workbench/components/ExecuteConsole.vue';
import { useExecuteConsole } from '../../workbench/composables/useExecuteConsole';
import AiAssistantRail from '../../workbench/ai/AiAssistantRail.vue';
import ChainForm, { type ChainFormSuccessPayload } from '../ChainForm.vue';
import ChainCopyDialog from '../ChainCopyDialog.vue';
import ManualExecuteDialog from '@/views/databus/execution/ManualExecuteDialog.vue';
import ChainWorkPanel from './panel/ChainWorkPanel.vue';
import ChainTree from './tree/ChainTree.vue';
import { useChainTabs } from './composables/useChainTabs';
import type { ChainTreeActionCommand, ChainTreeNode } from './workbench.types';

const wb = useChainTabs();
const { tabs, activeKey, activeTab } = wb;

/** 当前激活画布上报的抽屉名片（无打开的画布时为 null，属性/EL/大纲显示空态） */
const activePort = useActiveDrawerPort();

/** 执行控制台（工作台级单例）：底部抽屉开合 + header 最近失败角标 + 日志写入 */
const { open: consoleOpen, errorCount: consoleErrorCount, append: appendExecuteLog } =
  useExecuteConsole();

/** 前端偏好：AI 栏开合与宽度；右侧抽屉开合（'1'/'0'，与全屏编辑器同一 key）、宽度（默认 300） */
const aiCollapsed = usePersisted('databus.chainwb.aiCollapsed', true);
const aiWidth = usePersisted('databus.chainwb.aiWidth', 300);
const { collapsed: drawerCollapsed, setCollapsed: setDrawerCollapsed } =
  usePanelCollapse('databus.drawer.collapsed');
const drawerWidth = usePersisted('databus.drawer.width', 300);

/* ---------------- 链路树动作承接（原 list 卡片五操作下沉） ---------------- */

const treeRef = ref<InstanceType<typeof ChainTree>>();
const chainFormRef = ref<InstanceType<typeof ChainForm>>();
const copyDialogRef = ref<InstanceType<typeof ChainCopyDialog>>();

function reloadTree() {
  return treeRef.value?.reload();
}

/**
 * 树头部/目录右键「新建链路」：开 ChainForm 并预设归属目录（null=未归组）。
 * 即命名即落库，成功后 onChainFormSaved 刷新树并直接打开画布 tab。
 */
function onAddChain(directoryId: string | number | null) {
  chainFormRef.value?.openDialog(undefined, { directoryId: directoryId ?? null });
}

/**
 * ChainForm 成功回调：
 * - 新建：刷树 + 直接开新链路画布 tab；
 * - 编辑：刷树 + 仅在 tab 已开时刷新标题（不替用户强开 tab）；
 * - 模板运营（payload 缺省）：只刷树。
 */
async function onChainFormSaved(payload?: ChainFormSuccessPayload) {
  await reloadTree();
  if (!payload || payload.id == null) {
    return;
  }
  if (payload.isEdit) {
    wb.refreshTitleIfOpen(payload.id, payload.chainName);
  } else {
    wb.openCanvas(payload.id, payload.chainName);
  }
}

/** 复制弹窗当前模式（created 回调据此分流：copy 只 reload；template 连副本画布一起开） */
const copyDialogMode = ref<'copy' | 'template'>('copy');

/** 手动执行弹窗状态 + 发起执行的链路上下文（结果写终端时需要 chainCode 展示） */
const executeDialogVisible = ref(false);
const executeCtx = ref<{ chainId: number | string; chainCode: string } | null>(null);

/**
 * 链路树业务动作统一入口：树内只派发不闭环（对标 ComponentTree 菜单上抛）。
 * node 来自 chain/template 叶子，chainId 必为真实主键。
 */
function onChainAction(command: ChainTreeActionCommand, node: ChainTreeNode) {
  const chainId = node.chainId;
  if (chainId === '' || chainId == null) {
    return;
  }
  switch (command) {
    case 'edit-chain':
      chainFormRef.value?.openDialog(chainId);
      break;
    case 'copy-chain':
      copyDialogMode.value = 'copy';
      copyDialogRef.value?.open({ id: chainId }, 'copy');
      break;
    case 'use-template':
      copyDialogMode.value = 'template';
      copyDialogRef.value?.open({ id: chainId }, 'template');
      break;
    case 'publish-chain':
      void handlePublish(node);
      break;
    case 'offline-chain':
      void handleOffline(node);
      break;
    case 'execute-chain':
      executeCtx.value = { chainId, chainCode: node.chainCode ?? String(chainId) };
      executeDialogVisible.value = true;
      break;
    case 'delete-chain':
      void handleDelete(node);
      break;
  }
}

/** 复制/使用模板成功：普通复制只刷新树（副本按其 directoryId 归位）；
 *  使用模板直接开副本画布 tab（在工作台内闭环，不再走路由跳全屏编辑器） */
function onCopyCreated(newId: number | string, newName: string) {
  if (copyDialogMode.value === 'template') {
    ElMessage.success(`已创建副本「${newName}」，开始编排吧`);
    wb.openCanvas(newId, newName);
  } else {
    modal.msgSuccess(`已复制为「${newName}」`);
  }
  void reloadTree();
}

async function handlePublish(node: ChainTreeNode) {
  await publishChain(node.chainId);
  modal.msgSuccess('发布成功');
  void reloadTree();
}

async function handleOffline(node: ChainTreeNode) {
  await offlineChain(node.chainId);
  modal.msgSuccess('已下线');
  void reloadTree();
}

/**
 * 删除链路 + tab 联动红线：
 *  - 该链画布 tab 有未保存改动 → 禁止删除，提示先保存或关闭 tab（防止删完 DB 行脏画布再保存报错）；
 *  - tab 已打开且干净 → 确认后连 tab 一起关，避免中栏残留指向已删链路的画布。
 */
async function handleDelete(node: ChainTreeNode) {
  const key = `canvas:${node.chainId}`;
  const opened = tabs.value.find((t) => t.key === key);
  if (opened?.dirty) {
    ElMessage.warning(`链路「${node.label}」画布有未保存改动，请先保存或关闭该画布 tab 后再删除`);
    return;
  }
  await modal.confirm(`是否确认删除链路"${node.label}"？删除后不可恢复。`);
  await delChain(node.chainId);
  modal.msgSuccess('删除成功');
  if (opened) {
    wb.close(key);
  }
  void reloadTree();
}

/** 执行完成：成败概要写入执行终端（自动弹出），不再弹"是否查看记录"询问——行尾自带跳转入口 */
function onExecuted(result: DatabusExecutionResult) {
  const ctx = executeCtx.value;
  appendExecuteLog({
    level: result.success ? 'success' : 'error',
    chainId: result.chainId ?? ctx?.chainId,
    chainCode: ctx?.chainCode ?? String(ctx?.chainId ?? ''),
    text: result.message ?? '',
    costTime: result.costTime,
    recordId: result.recordId ?? null
  });
  executeCtx.value = null;
}

/** Ctrl+U 开合 AI 栏；输入区/代码编辑器内不抢键 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable || !!target.closest('.cm-editor');
}

function onKeydown(event: KeyboardEvent) {
  if (!event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) {
    return;
  }
  if (isTypingTarget(event.target)) {
    return;
  }
  if (event.key.toLowerCase() === 'u') {
    event.preventDefault();
    aiCollapsed.value = !aiCollapsed.value;
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<style lang="scss" scoped>
/* 页面级 wrapper：吃掉视口高度，header 与三栏区各取所需（§2.0 高度公式） */
.chainwb-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 123px);
}

.chainwb {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
  overflow: hidden;
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 8px;
}

/* 右侧抽屉槽：折叠时宽度收 0（不 v-if，保活 tab 停留位与链路树状态）；
   inner 固定 drawerWidth 不随收窄动画回流，外层 overflow 裁剪 */
.chainwb__drawer {
  flex-shrink: 0;
  height: 100%;
  overflow: hidden;
  transition: width 0.2s ease;
}
</style>
