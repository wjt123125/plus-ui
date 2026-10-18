<template>
  <div class="wsp-page">
    <!--
      数据总线工作区（单壳，2026-10-17 融合，workbench-unification.md）：
        顶部 header（唯一开关入口）/ 会话历史栏 / AI 助手栏 / 中栏工作面板 + 底部终端 / 右抽屉统一资源树。
      原「链路工作台」与「组件工作台」两壳合流为一个路由（databus/workspace/index）：
      五 kind tab（canvas/grid/detail/form/changes）同容器混排，右抽屉树六 section
      （我的收藏 / 最近访问 / 目录树 / 未归组 / 系统组件 / 精选模板）统一组织链路与组件。
      高度由 wrapper 吃 calc(100vh - 123px)、header flex-shrink:0、.wsp flex:1 三段式分配。
    -->
    <WorkbenchHeader
      v-model:history-collapsed="historyCollapsed"
      v-model:ai-collapsed="aiCollapsed"
      v-model:nav-collapsed="drawerCollapsed"
      v-model:console-open="consoleOpen"
      ai-label="AI 助手"
      nav-label="资源"
      console-label="终端"
      :console-count="consoleErrorCount"
    />

    <div class="wsp">
      <!-- 栏 1：会话历史（AI 助手的兄弟栏，v1 无会话后端，列表走空态） -->
      <AiHistoryRail :collapsed="historyCollapsed" :width="historyWidth" />
      <Splitter v-if="!historyCollapsed" v-model="historyWidth" :min="180" />

      <!-- 栏 2：AI 助手（v1 空壳预留，点击建议即定位台账组件） -->
      <AiAssistantRail
        :collapsed="aiCollapsed"
        :width="aiWidth"
        title="AI 助手"
        welcome-title="数据总线助手"
        welcome-desc="用自然语言定位链路与组件、解释编排意图、排查脚本编译与执行问题。"
        @select="onAiSelect"
      />
      <Splitter v-if="!aiCollapsed" v-model="aiWidth" :min="AI_MIN_WIDTH" />

      <!-- 栏 3：中栏容器 = 工作面板（五 kind 主内容区）+ 底部终端。
           终端放进中栏而不是整页 flex 兄弟：宽度只吃中栏，右抽屉折叠时中栏变宽、终端跟着变宽 -->
      <div class="wsp__center">
        <WorkspaceWorkPanel
          v-model:active-key="activeKey"
          :tabs="tabs"
          :rows="rows"
          :tag-suggestions="tagPool"
          :refresh-tokens="refreshTokens"
          @close="wb.close"
          @tab-action="onTabAction"
          @dirty-change="wb.setDirty"
          @open-chain="wb.openCanvas"
          @saved="handleSaved"
          @rolled="handleRolled"
          @open-changes="handleOpenChanges"
          @edit="handleEdit"
          @delete="handleDelete"
          @changes="handleChanges"
          @market-open="onMarketOpen"
          @market-installed="onMarketInstalled"
          @market-toggle="onMarketToggle"
        >
          <!-- tab 全关时的空白工作台：注入空态导航（打开/新建/树定位三类入口） -->
          <template #empty>
            <WorkbenchLauncher @command="onLauncherCommand" />
          </template>
        </WorkspaceWorkPanel>

        <!-- 底部终端：执行 / 编译双小 tab 同卡片（Trae terminal 范式），任一流有日志自动弹出 -->
        <WorkbenchTerminal />
      </div>

      <!-- 栏 4：右抽屉统一资源树（六 section 组织链路/组件/目录/收藏/模板）。
           折叠不收边销毁（宽度收 0 + overflow 裁剪），tab 停留位、树展开/搜索态全部保活；
           属性/EL/大纲读当前激活画布上报的名片（activePort），kind 决定三 tab 是否露出 -->
      <Splitter v-if="!drawerCollapsed" v-model="drawerWidth" target="next" />
      <div class="wsp__drawer" :style="{ width: (drawerCollapsed ? 0 : drawerWidth) + 'px' }">
        <EditorDrawer
          :port="activePort"
          :kind="drawerKind"
          show-tree-tab
          default-tab="tree"
          :style="{ width: drawerWidth + 'px' }"
          @fold="setDrawerCollapsed(true)"
        >
          <template #tree>
            <ResourceTree
              ref="treeRef"
              :rows="rows"
              :recent="recentOrdered"
              :dirty-codes="dirtyCodes"
              :unhealthy="unhealthy"
              :active-chain-id="activeChainId"
              :active-code="activeCode"
              :loading="loading"
              @add-chain="onAddChain"
              @add-component="handleAdd"
              @command="onTreeCommand"
            />
          </template>
        </EditorDrawer>
      </div>
    </div>

    <!-- 链路新增/编辑（树头部/目录右键新建与叶子编辑共用；成功后刷树，新建连画布 tab 一起开） -->
    <ChainForm ref="chainFormRef" @success="onChainFormSaved" />
    <!-- 复制链路/使用模板共用弹窗；created 后按模式决定只 reload 还是连副本画布 tab 一起开 -->
    <ChainCopyDialog ref="copyDialogRef" @created="onCopyCreated" />
    <!-- 手动执行（lockedChainId 预选树节点链路，选择框禁用）；结果写终端，不再弹跳转询问 -->
    <ManualExecuteDialog
      v-model:visible="executeDialogVisible"
      :locked-chain-id="executeCtx?.chainId"
      @executed="onExecuted"
    />
  </div>
</template>

<script setup name="DatabusWorkspace" lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import {
  delComponent,
  listComponent,
  listComponentOptions,
  listScriptRuntime,
  updateComponent
} from '@/api/databus/component';
import type { ComponentOption, ScriptRuntime, ScriptSaveResult } from '@/api/databus/component/types';
import { delChain, offlineChain, publishChain } from '@/api/databus/chain';
import type { DatabusExecutionResult } from '@/api/databus/execution/types';
import { useLoading } from '@/hooks/async/useLoading';
import modal from '@/plugins/modal';
import { buildRegistry } from '@/views/databus/component/model/registry';
import type { ComponentRegistryRow, DefMeta } from '@/views/databus/component/model/registry';
import { useComponentTaxonomy } from '@/views/databus/editor/composables/useComponentTaxonomy';
import { usePhIcons } from '@/views/databus/editor/composables/usePhIcons';
import EditorDrawer, { type DrawerKind } from '@/views/databus/editor/components/drawer/EditorDrawer.vue';
import { useActiveDrawerPort } from '@/views/databus/editor/composables/useDrawerPort';
import { usePanelCollapse } from '@/views/databus/editor/composables/usePanelCollapse';
import ManualExecuteDialog from '@/views/databus/execution/ManualExecuteDialog.vue';
import { usePersisted } from '@/views/databus/workbench/composables/usePersisted';
import { useCompileConsole } from '@/views/databus/workbench/composables/useCompileConsole';
import Splitter from '@/views/databus/workbench/components/Splitter.vue';
import WorkbenchHeader from '@/views/databus/workbench/components/WorkbenchHeader.vue';
import AiAssistantRail from '@/views/databus/workbench/ai/AiAssistantRail.vue';
import AiHistoryRail from '@/views/databus/workbench/ai/AiHistoryRail.vue';
import { useAiSessionHistory } from '@/views/databus/workbench/ai/useAiSessionHistory';
import ChainForm, { type ChainFormSuccessPayload } from '../chain/ChainForm.vue';
import ChainCopyDialog from '../chain/ChainCopyDialog.vue';
import { useWorkspaceTabs } from './composables/useWorkspaceTabs';
import { useRecentResources } from './composables/useRecentResources';
import { useWorkspaceTerminal } from './composables/useWorkspaceTerminal';
import WorkspaceWorkPanel from './panel/WorkspaceWorkPanel.vue';
import WorkbenchLauncher from './panel/WorkbenchLauncher.vue';
import WorkbenchTerminal from './components/WorkbenchTerminal.vue';
import ResourceTree from './tree/ResourceTree.vue';
import type {
  ComponentSaved,
  FormPreset,
  LauncherCommand,
  ResourceMenuCommand,
  ResourceTreeNode,
  TabMenuCommand,
  WorkspaceTab
} from './workbench.types';

/* ---------------- 台账合流 ---------------- */

const rows = ref<ComponentRegistryRow[]>([]);
/** 库存脚本件运行时健康（启动期失败件用于列表顶部红条） */
const runtimeHealth = ref<ScriptRuntime[]>([]);
const { loading, withLoading } = useLoading(true);
const togglingCode = ref<string>();

const wb = useWorkspaceTabs();
const { tabs, activeKey } = wb;
const { recentOrdered, touch: touchRecent, remove: removeRecent, prune: pruneRecent } =
  useRecentResources();
/** 分组/业务域字典：资源树系统组件分组序要用，进页面即触发（模块级缓存，全会话一次） */
const { ensureTaxonomy } = useComponentTaxonomy();
/** ph 图标全集：台账 icon 契约是 `ph:*`，树叶子与卡片渲染前必须离线注入，否则运行时联网取图 */
const { loadPhIcons } = usePhIcons();

/** 空态导航命令 → 打开类揭右抽屉并树定位（展开+高亮+滚动），新建类触发弹窗 */
function onLauncherCommand(cmd: LauncherCommand) {
  switch (cmd) {
    case 'recent':
      focusTree('recent-root');
      break;
    case 'favorite':
      focusTree('fav-root');
      break;
    case 'system':
      focusTree('sys-root');
      break;
    case 'market':
      wb.openMarket();
      break;
    case 'new-chain':
      onAddChain(null);
      break;
    case 'new-component':
      handleAdd();
      break;
    case 'new-directory':
      setDrawerCollapsed(false);
      treeRef.value?.openDirectoryDialog('add');
      break;
  }
}

/** 揭右抽屉并定位目标树节点（section 虚拟根：展开 + 高亮 + 滚动入视） */
function focusTree(id: string) {
  setDrawerCollapsed(false);
  treeRef.value?.focusSection(id);
}

/** tab 右键菜单关闭族（'close' 由面板本地脏确认处理）：批量关闭语义归 useWorkspaceTabs */
function onTabAction(cmd: TabMenuCommand, key: string) {
  switch (cmd) {
    case 'close-others':
      void wb.closeOthers(key);
      break;
    case 'close-left':
      void wb.closeLeft(key);
      break;
    case 'close-right':
      void wb.closeRight(key);
      break;
    case 'close-all':
      void wb.closeAll();
      break;
    default:
      break;
  }
}

/* ---------------- 前端偏好（开合与宽度） ---------------- */

const aiCollapsed = usePersisted('databus.ws.aiCollapsed', true);
const aiWidth = usePersisted('databus.ws.aiWidth', 300);
/** AI 栏最小宽度：再窄对话区无可用宽度，同时作为「拖到最窄=收起历史栏」的阈值 */
const AI_MIN_WIDTH = 220;
/** 会话历史栏：与其它工作台共享同一单例，AI 收起/拖到最窄时单向连带收起 */
const { collapsed: historyCollapsed, width: historyWidth, bindHistoryToAi } = useAiSessionHistory();
bindHistoryToAi(aiCollapsed, aiWidth, AI_MIN_WIDTH);
const { collapsed: drawerCollapsed, setCollapsed: setDrawerCollapsed } =
  usePanelCollapse('databus.drawer.collapsed');
const drawerWidth = usePersisted('databus.drawer.width', 300);

/** 当前激活画布上报的抽屉名片（无画布时为 null，属性/EL/大纲显示空态） */
const activePort = useActiveDrawerPort();

/* ---------------- 终端（执行/编译双流同卡片） ---------------- */

/** 底部终端整体开合：header 开关与终端共用同一个单例 ref（v-model:console-open） */
const { open: consoleOpen, exec, comp } = useWorkspaceTerminal();
/** header 收起态角标：两条流错误数之和 */
const consoleErrorCount = computed(() => exec.errorCount.value + comp.errorCount.value);
/** 编译控制台诊断跳行目标（激活/切到对应组件编辑 tab，行内跳转由 ScriptTab 完成） */
const { revealTarget } = useCompileConsole();

/** tab key → 重载令牌：回滚后自增，让同组件的编辑面板重取脚本体 */
const refreshTokens = reactive<Record<string, number>>({});

/* ---------------- tab 派生态 ---------------- */

const activeTab = computed(() => tabs.value.find((t) => t.key === activeKey.value));
/** 当前激活 tab 的 kind：驱动右抽屉露出几个 tab（仅 canvas 露四 tab，其余含 market 只显资源树） */
const drawerKind = computed<DrawerKind>(() => {
  const kind = activeTab.value?.kind;
  return kind === 'market' ? 'none' : (kind ?? 'none');
});
/** 树高亮：激活画布的链路 id */
const activeChainId = computed(() =>
  activeTab.value?.kind === 'canvas' ? (activeTab.value.chainId ?? null) : null
);
/** 树高亮：激活组件编码（detail/form/changes） */
const activeCode = computed(() => {
  const t = activeTab.value;
  return t != null && (t.kind === 'detail' || t.kind === 'form' || t.kind === 'changes')
    ? t.code || null
    : null;
});
/** 本会话有未保存草稿的组件编码 → 树上标橙点 */
const dirtyCodes = computed(() => tabs.value.filter((t) => t.dirty && t.code).map((t) => t.code));

/** 启动期编译/注册失败的库存脚本件（资源树：叶子 E 码 + 树头警示条） */
const unhealthy = computed(() => runtimeHealth.value.filter((h) => !h.healthy));

/** 标签建议池：台账已有标签去重，供新增/编辑表单自由创建时联想 */
const tagPool = computed(() => {
  const set = new Set<string>();
  for (const r of rows.value) {
    for (const t of r.tags ?? []) {
      if (t) {
        set.add(t);
      }
    }
  }
  return [...set];
});

function rowByCode(code: string): ComponentRegistryRow | undefined {
  return rows.value.find((r) => r.code === code);
}

/** 拉取双源合流 + 脚本运行健康；任一源失败不阻断其他源渲染 */
const getList = async () => {
  await withLoading(async () => {
    const [optRes, listRes, runtimeRes] = await Promise.allSettled([
      listComponentOptions(),
      listComponent({ pageNum: 1, pageSize: 999 }),
      listScriptRuntime()
    ]);
    const options: ComponentOption[] =
      optRes.status === 'fulfilled' ? optRes.value.data?.components ?? [] : [];
    const dbRows = listRes.status === 'fulfilled' ? listRes.value.data?.rows ?? [] : [];
    runtimeHealth.value = runtimeRes.status === 'fulfilled' ? runtimeRes.value.data ?? [] : [];
    // 展示元数据从 /options 自身构建（同一次响应，无第二数据源）
    const optionMetaMap: ReadonlyMap<string, DefMeta> = new Map(
      options.map((o) => [
        o.code,
        {
          group: o.group ?? undefined,
          color: o.color ?? undefined,
          icon: o.icon ?? undefined,
          short: o.shortName ?? undefined
        }
      ])
    );
    rows.value = buildRegistry(options, dbRows, optionMetaMap);
  });
};

/* ---------------- 树 / 网格 → 工作面板 ---------------- */

function openDetail(row: ComponentRegistryRow) {
  wb.openDetail(row);
  touchRecent({ type: 'component', refId: row.code, title: row.name, icon: row.icon });
}

/** 新建组件：入口是资源树目录节点的右键菜单（§2.2），携带该目录的 group/domain/归属目录 */
function handleAdd(preset?: FormPreset) {
  wb.openForm(undefined, undefined, preset);
}

function handleEdit(row: ComponentRegistryRow) {
  if (row.db?.id == null) {
    return;
  }
  wb.openForm(row.db.id, row);
  touchRecent({ type: 'component', refId: row.code, title: row.name, icon: row.icon });
}

function handleChanges(row: ComponentRegistryRow) {
  if (wb.openChanges(row)) {
    touchRecent({ type: 'component', refId: row.code, title: row.name, icon: row.icon });
  }
}

/** 编辑面板内「代码变更」按钮：按 tab 上的组件定位台账行 */
function handleOpenChanges(tab: WorkspaceTab) {
  const row = rowByCode(tab.code);
  if (row) {
    handleChanges(row);
  }
}

async function handleSaved(tab: WorkspaceTab, payload: ComponentSaved) {
  await getList();
  if (payload.id == null) {
    return;
  }
  const saved = rowByCode(payload.code);
  if (tab.dbId == null) {
    // 新增成功：form:new 临时 tab 转正为 form:id，避免再点保存又建一条
    wb.adoptNewForm(payload.code, payload.id, payload.name);
  } else {
    wb.openForm(payload.id, { code: payload.code, name: payload.name });
  }
  touchRecent({
    type: 'component',
    refId: payload.code,
    title: payload.name,
    icon: saved?.icon
  });
}

/** 回滚生效：刷新台账 + 让同组件的编辑面板重取脚本体 */
async function handleRolled(tab: WorkspaceTab, result: ScriptSaveResult) {
  await getList();
  if (!result.success) {
    return;
  }
  for (const t of tabs.value) {
    if (t.code === tab.code && t.kind === 'form') {
      refreshTokens[t.key] = (refreshTokens[t.key] ?? 0) + 1;
    }
  }
}

async function handleDelete(row: ComponentRegistryRow) {
  if (row.db?.id == null) {
    return;
  }
  await modal.confirm(`是否确认删除自定义组件"${row.name}"（${row.code}）？删除后不可恢复。`);
  await delComponent(row.db.id);
  modal.msgSuccess('删除成功');
  const staleKeys = tabs.value.filter((t) => t.code === row.code).map((t) => t.key);
  wb.closeByCode(row.code);
  staleKeys.forEach((key) => delete refreshTokens[key]);
  removeRecent('component', row.code);
  await getList();
}

/**
 * 卡片开关：val=true 启用（status 0）/ false 停用（status 1）。
 * 停用不硬拦：仅提示面板不可见、已发布链路继续跑（库存脚本件重启后不再注册，重启用恢复）。
 */
async function toggleEnabled(row: ComponentRegistryRow, val: boolean) {
  if (!row.db || togglingCode.value) {
    return;
  }
  if (!val) {
    await modal.confirm(
      `确认停用「${row.name}」？停用后编辑器面板不再露出；已发布链路仍继续运行` +
        (row.scripted ? '，但服务重启后该脚本件不会重新注册（重启用即恢复）。' : '。')
    );
  }
  togglingCode.value = row.code;
  try {
    await updateComponent({ ...row.db, status: val ? '0' : '1' });
    modal.msgSuccess(val ? '已启用' : '已停用');
    await getList();
  } finally {
    togglingCode.value = undefined;
  }
}

/* ---------------- 物料市场（中栏 market tab 上抛，市场面板无 DB 行，动作归宿主） ---------------- */

/** 台账行按组件主键反查：市场「使用/启停」只带本地副本 id */
function rowById(id: string | number): ComponentRegistryRow | undefined {
  return rows.value.find((r) => r.db?.id != null && String(r.db.id) === String(id));
}

/** 使用本地副本：链路开画布 tab，组件开详情 tab（与树叶子开件同口径） */
function onMarketOpen(
  localResourceId: string | number,
  resourceType: 'COMPONENT' | 'CHAIN',
  title: string
) {
  if (resourceType === 'CHAIN') {
    wb.openCanvas(localResourceId, title);
    return;
  }
  const row = rowById(localResourceId);
  if (row) {
    openDetail(row);
  } else {
    ElMessage.warning('本地副本已不在台账中，请刷新后重试');
  }
}

/** 安装/卸载成功：副本落在「我的目录」，台账与资源树都要重取 */
async function onMarketInstalled() {
  await Promise.all([getList(), reloadTree()]);
}

/** 启停本地组件副本：复用卡片开关同一路径（停用有二次确认与重启语义） */
function onMarketToggle(localResourceId: string | number, enabled: boolean) {
  const row = rowById(localResourceId);
  if (row) {
    void toggleEnabled(row, enabled);
  }
}

/** AI 助手选中某组件（v1 空壳预留）：等价于在树上点该叶子 */
function onAiSelect(payload: string) {
  const row = rowByCode(payload);
  if (row) {
    openDetail(row);
  }
}

// 台账刷新后剔除已不存在的「最近访问」自建组件项（链路项由资源树按链路表过滤）
watch(rows, (list) => {
  if (!list.length) {
    return;
  }
  const alive = new Set(list.map((r) => r.code));
  pruneRecent((item) => !(item.type === 'component' && !alive.has(String(item.refId))));
});

/* ---------------- 统一资源树命令承接 ---------------- */

const treeRef = ref<InstanceType<typeof ResourceTree>>();
const chainFormRef = ref<InstanceType<typeof ChainForm>>();
const copyDialogRef = ref<InstanceType<typeof ChainCopyDialog>>();

function reloadTree() {
  return treeRef.value?.reload();
}

/** 树节点链路主键（空串/null 视为无） */
function nodeChainId(node: ResourceTreeNode): string | number | null {
  const id = node.chainId;
  return id === '' || id == null ? null : id;
}

/** 树节点对应台账行（叶子自带 row，收藏/最近条目按 code 反查） */
function rowOfNode(node: ResourceTreeNode): ComponentRegistryRow | undefined {
  if (node.row) {
    return node.row;
  }
  return node.componentCode ? rowByCode(node.componentCode) : undefined;
}

/** 打开树叶子：链路/模板→画布 tab；组件/系统件→详情 tab；均记入最近访问 */
function openResourceNode(node: ResourceTreeNode) {
  const chainId = nodeChainId(node);
  if (chainId != null) {
    wb.openCanvas(chainId, node.label);
    touchRecent({ type: 'chain', refId: chainId, title: node.label });
    return;
  }
  const row = rowOfNode(node);
  if (row) {
    openDetail(row);
  }
}

/** 资源树业务动作统一入口：树内只派发不闭环（对标旧两菜单上抛） */
function onTreeCommand(command: ResourceMenuCommand, node: ResourceTreeNode) {
  switch (command) {
    case 'open':
      openResourceNode(node);
      break;

    /* —— 链路 —— */
    case 'edit-chain': {
      const chainId = nodeChainId(node);
      if (chainId != null) {
        chainFormRef.value?.openDialog(chainId);
      }
      break;
    }
    case 'copy-chain': {
      const chainId = nodeChainId(node);
      if (chainId != null) {
        copyDialogRef.value?.open({ id: chainId }, 'copy');
      }
      break;
    }
    case 'publish-chain':
      void handlePublish(node);
      break;
    case 'offline-chain':
      void handleOffline(node);
      break;
    case 'execute-chain': {
      const chainId = nodeChainId(node);
      if (chainId != null) {
        executeCtx.value = { chainId, chainCode: node.chainCode ?? String(chainId) };
        executeDialogVisible.value = true;
      }
      break;
    }
    case 'delete-chain':
      void handleDeleteChain(node);
      break;

    /* —— 组件 —— */
    case 'view-component':
    case 'edit-component':
    case 'changes-component':
    case 'toggle-component':
    case 'delete-component': {
      const row = rowOfNode(node);
      if (!row) {
        break;
      }
      if (command === 'view-component') {
        openDetail(row);
      } else if (command === 'edit-component') {
        handleEdit(row);
      } else if (command === 'changes-component') {
        handleChanges(row);
      } else if (command === 'toggle-component') {
        void toggleEnabled(row, row.disabled);
      } else {
        void handleDelete(row);
      }
      break;
    }

    default:
      // 目录/收藏/移动等动作在树内闭环（见 ResourceTree），不上抛
      break;
  }
}

/** 树头部/目录右键「新建链路」：开 ChainForm 并预设归属目录（null=未归组） */
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

/** 手动执行弹窗状态 + 发起执行的链路上下文（结果写终端时需要 chainCode 展示） */
const executeDialogVisible = ref(false);
const executeCtx = ref<{ chainId: number | string; chainCode: string } | null>(null);

/** 复制链路成功：副本按其 directoryId 归位，刷新树即可（不替用户强开画布） */
function onCopyCreated(_newId: number | string, newName: string) {
  modal.msgSuccess(`已复制为「${newName}」`);
  void reloadTree();
}

async function handlePublish(node: ResourceTreeNode) {
  const chainId = nodeChainId(node);
  if (chainId == null) {
    return;
  }
  await publishChain(chainId);
  modal.msgSuccess('发布成功');
  void reloadTree();
}

async function handleOffline(node: ResourceTreeNode) {
  const chainId = nodeChainId(node);
  if (chainId == null) {
    return;
  }
  await offlineChain(chainId);
  modal.msgSuccess('已下线');
  void reloadTree();
}

/**
 * 删除链路 + tab 联动红线：
 *  - 该链画布 tab 有未保存改动 → 禁止删除，提示先保存或关闭 tab；
 *  - tab 已打开且干净 → 确认后连 tab 一起关，避免中栏残留指向已删链路的画布。
 */
async function handleDeleteChain(node: ResourceTreeNode) {
  const chainId = nodeChainId(node);
  if (chainId == null) {
    return;
  }
  const key = `canvas:${chainId}`;
  const opened = tabs.value.find((t) => t.key === key);
  if (opened?.dirty) {
    ElMessage.warning(`链路「${node.label}」画布有未保存改动，请先保存或关闭该画布 tab 后再删除`);
    return;
  }
  await modal.confirm(`是否确认删除链路"${node.label}"？删除后不可恢复。`);
  await delChain(chainId);
  modal.msgSuccess('删除成功');
  if (opened) {
    wb.close(key);
  }
  removeRecent('chain', chainId);
  void reloadTree();
}

/** 执行完成：成败概要写入执行终端（自动弹出），行尾自带「查看记录」跳转入口 */
function onExecuted(result: DatabusExecutionResult) {
  const ctx = executeCtx.value;
  exec.append({
    level: result.success ? 'success' : 'error',
    chainId: result.chainId ?? ctx?.chainId,
    chainCode: ctx?.chainCode ?? String(ctx?.chainId ?? ''),
    text: result.message ?? '',
    costTime: result.costTime,
    recordId: result.recordId ?? null
  });
  executeCtx.value = null;
}

/**
 * 控制台诊断行跳行第一棒：激活目标组件的编辑 tab。本 watch 在页面 setup 注册、
 * 全场最早执行（pre-flush 按注册顺序），FormPane 切执行体 tab、ScriptTab 跳行随后接力。
 * openForm 对已开 tab 只聚焦不重载（v-show 常驻），草稿不丢。
 */
watch(revealTarget, (target) => {
  if (!target) {
    return;
  }
  const row = rows.value.find((r) => r.db?.id === target.componentId);
  if (row?.db?.id != null) {
    wb.openForm(row.db.id, row);
  }
});

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

onMounted(() => {
  // 字典与 ph 图标全集都在树首次渲染前触发；getList 拉台账双源合流
  void ensureTaxonomy();
  void loadPhIcons();
  getList();
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<style lang="scss" scoped>
/* 页面级 wrapper：吃掉视口高度，header 与三栏区各取所需（§2.0 高度公式） */
.wsp-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 123px);
}

.wsp {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
  overflow: hidden;
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 8px;
}

/* 中栏：工作面板（flex:1）+ 终端纵向排布，宽度 = 三栏分配后的余量 */
.wsp__center {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* 右抽屉槽：折叠时宽度收 0（不 v-if，保活 tab 停留位与资源树状态）；
   inner 固定 drawerWidth 不随收窄动画回流，外层 overflow 裁剪 */
.wsp__drawer {
  flex-shrink: 0;
  height: 100%;
  overflow: hidden;
  transition: width 0.2s ease;
}
</style>
