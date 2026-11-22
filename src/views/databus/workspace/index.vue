<template>
  <div class="wsp-page db-app">
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
      <!-- 栏 1：会话历史（AI 助手的兄弟栏）；点条目切会话，表头「＋新建」开新会话 -->
      <AiHistoryRail
        :collapsed="historyCollapsed"
        :width="historyWidth"
        :sessions="sessionList"
        :groups="sessionGroups"
        :active-id="conversationId"
        @open="onHistoryOpen"
        @new="onAiNewSession"
        @rename="onHistoryRename"
        @pin="onHistoryPin"
        @delete="onHistoryDelete"
        @search="onHistorySearch"
      >
        <!-- 用户区（n8n 式，§7 改造点3）：头像+昵称+角色整行下拉，替代原 header 右上角用户胶囊 -->
        <template #footer>
          <WorkbenchUserBar settings-entry @settings="goSettings" @logout="onLogout" />
        </template>
      </AiHistoryRail>
      <Splitter
        v-if="!historyCollapsed"
        v-model="historyWidth"
        :min="HISTORY_MIN_WIDTH"
        :max="HISTORY_MAX_WIDTH"
        :reset-width="HISTORY_MIN_WIDTH"
      />

      <!-- 栏 2：AI 助手（对话面板薄壳，状态在 useAgentChat 模块级单例） -->
      <AiAssistantRail
        :collapsed="aiCollapsed"
        :width="aiWidth"
        :running="agentRunning"
        title="AI 助手"
        welcome-title="DB Copilot"
        welcome-desc="用自然语言定位链路与组件、解释编排意图、排查脚本编译与执行问题。"
        @select="onAiSelect"
        @new-session="onAiNewSession"
      >
        <!-- 对话面板接管 body + input 区；会话身份只认 conversationId -->
        <AgentChatPanel
          :draft-codes="draftComponentCodes"
          @agent-rolled-back="onAgentRolledBack"
          @ref-open="onAgentRefOpen"
          @ref-preview="onAgentRefPreview"
        />
      </AiAssistantRail>
      <Splitter
        v-if="!aiCollapsed || !historyCollapsed"
        v-model="aiWidth"
        :min="AI_MIN_WIDTH"
        :max="AI_MAX_WIDTH"
        :reset-width="AI_MIN_WIDTH"
        :disabled="aiCollapsed"
      />

      <!-- 栏 3：中栏容器 = 工作面板（五 kind 主内容区）+ 底部终端。
           终端放进中栏而不是整页 flex 兄弟：宽度只吃中栏，右抽屉折叠时中栏变宽、终端跟着变宽 -->
      <div class="wsp__center">
        <WorkspaceWorkPanel
          ref="workPanelRef"
          v-model:active-key="activeKey"
          :tabs="tabs"
          :rows="rows"
          :tag-suggestions="tagPool"
          :refresh-tokens="refreshTokens"
          @close="wb.close"
          @tab-action="onTabAction"
          @open-tool="onLauncherCommand"
          @dirty-change="wb.setDirty"
          @open-chain="openChainCanvas"
          @open-component="handleOpenComponentRef"
          @saved="handleSaved"
          @rolled="handleRolled"
          @open-changes="handleOpenChanges"
          @edit="handleEdit"
          @delete="handleDelete"
          @changes="handleChanges"
          @review-adopted="handleReviewAdopted"
          @review-rejected="handleReviewRejected"
          @market-open="onMarketOpen"
          @market-installed="onMarketInstalled"
          @market-toggle="onMarketToggle"
          @market-open-detail="onMarketOpenDetail"
          @market-open-review="onMarketOpenReview"
          @connector-package-open="onConnectorPackageOpen"
          @market-reviewed="onMarketReviewed"
          @market-dep-reviewed="onMarketDepReviewed"
          @market-open-source="onMarketOpenSource"
          @market-open-market="onMarketOpenMarket"
          @market-open-manage="onMarketOpenManage"
          @market-manage-scope="onMarketManageScope"
          @market-open-publish="onMarketOpenPublish"
          @market-publish-back="onMarketPublishBack"
          @market-published="onMarketPublished"
          @market-open-source-canvas="onMarketOpenSourceCanvas"
          @open-connection="onOpenConnection"
          @connection-saved="onConnectionSaved"
          @create-saved="onCreateSaved"
          @create-filetype="onCreateFiletype"
          @open-execution="onOpenExecutionRecord"
          @execution-refresh="onExecutionRefresh"
          @open-alert="wb.openAlertRecord"
        >
          <!-- tab 全关时的空白工作台：注入空态导航（打开/新建/树定位三类入口） -->
          <template #empty>
            <WorkbenchLauncher @command="onLauncherCommand" />
          </template>
        </WorkspaceWorkPanel>

        <!-- 底部终端：执行 / 编译双小 tab 同卡片（Trae terminal 范式），任一流有日志自动弹出 -->
        <WorkbenchTerminal @view-record="onOpenExecutionRecord" @view-preview="onViewPreview" />
      </div>

      <!-- 栏 4：右抽屉统一资源树（六 section 组织链路/组件/目录/收藏/模板）。
           折叠不收边销毁（宽度收 0 + overflow 裁剪），tab 停留位、树展开/搜索态全部保活；
           属性/EL/大纲读当前激活画布上报的名片（activePort），kind 决定三 tab 是否露出 -->
      <Splitter v-if="!drawerCollapsed" v-model="drawerWidth" target="next" :reset-width="300" />
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
              @add-directory="onAddDirectory"
              @command="onTreeCommand"
            />
          </template>
        </EditorDrawer>
      </div>
    </div>

    <!-- 命令面板（Ctrl/Cmd+K）：统一打开/新建/切会话入口，减轻三栏头部按钮密度 -->
    <WorkspaceCommandPalette
      v-model:open="paletteOpen"
      :sessions="sessionList"
      @command="onLauncherCommand"
      @open-session="onHistoryOpen"
    />

    <!-- 链路编辑抽屉（薄壳）：树上叶子编辑/重命名用；新建路径已收敛到向导 create tab（2026-10-21），保存后刷树与改标题 -->
    <ChainForm ref="chainFormRef" @success="onChainFormSaved" />
    <!-- 复制链路/使用模板共用弹窗；created 后按模式决定只 reload 还是连副本画布 tab 一起开 -->
    <ChainCopyDialog ref="copyDialogRef" @created="onCopyCreated" />
    <!-- 手动执行（lockedChainId 预选树节点链路，选择框禁用）；结果写终端，不再弹跳转询问 -->
    <ManualExecuteDialog
      v-model:visible="executeDialogVisible"
      :locked-chain-id="executeCtx?.chainId"
      @executed="onExecuted"
    />
    <!-- 划字冒泡 + 角标：挂在页面根，AI 栏收起时也能用（§22.2） -->
    <ContextSelectionBubble />
  </div>
</template>

<script setup name="DatabusWorkspace" lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/store/modules/user';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  delComponent,
  listComponent,
  listComponentOptions,
  listScriptRuntime,
  rejectScriptDraft,
  toggleComponent
} from '@/api/databus/component';
import type { ComponentOption, ScriptRuntime, ScriptSaveResult } from '@/api/databus/component/types';
import { reportAgentCanvasSkip } from '@/api/databus/agent';
import { delChain, offlineChain, publishChain } from '@/api/databus/chain';
import type { ChainPublishResultVo } from '@/api/databus/chain/types';
import { publishMarketBatch, uninstallMarketItem } from '@/api/databus/market';
import type { DatabusExecutionResult } from '@/api/databus/execution/types';
import { useLoading } from '@/hooks/async/useLoading';
import { initPush } from '@/utils/push';
import modal from '@/plugins/modal';
import { buildRegistry } from '@/views/databus/component/model/registry';
import type { ComponentRegistryRow, DefMeta } from '@/views/databus/component/model/registry';
import { useComponentTaxonomy } from '@/views/databus/editor/composables/useComponentTaxonomy';
import { usePhIcons } from '@/views/databus/editor/composables/usePhIcons';
import { loadBrandIcons } from '@/views/databus/workbench/composables/useBrandIcons';
import EditorDrawer, { type DrawerKind } from '@/views/databus/editor/components/drawer/EditorDrawer.vue';
import { useActiveDrawerPort } from '@/views/databus/editor/composables/useDrawerPort';
import { usePanelCollapse } from '@/views/databus/editor/composables/usePanelCollapse';
import ManualExecuteDialog from '@/views/databus/execution/ManualExecuteDialog.vue';
import { usePersisted } from '@/views/databus/workbench/composables/usePersisted';
import { useCompileConsole } from '@/views/databus/workbench/composables/useCompileConsole';
import Splitter from '@/views/databus/workbench/components/Splitter.vue';
import WorkbenchHeader from '@/views/databus/workbench/components/WorkbenchHeader.vue';
import WorkbenchUserBar from '@/views/databus/workbench/components/WorkbenchUserBar.vue';
import AiAssistantRail from '@/views/databus/workbench/ai/AiAssistantRail.vue';
import AgentChatPanel from '@/views/databus/workbench/ai/AgentChatPanel.vue';
import ContextSelectionBubble from '@/views/databus/workbench/ai/ContextSelectionBubble.vue';
import AiHistoryRail from '@/views/databus/workbench/ai/AiHistoryRail.vue';
import { HISTORY_MAX_WIDTH, HISTORY_MIN_WIDTH, useAiSessionHistory } from '@/views/databus/workbench/ai/useAiSessionHistory';
import { type AgentRefItem } from '@/views/databus/workbench/ai/useAgentRefs';
import { useAgentContext } from '@/views/databus/workbench/ai/useAgentContext';
import { useAgentChat } from '@/views/databus/workbench/ai/useAgentChat';
import type { AiSession } from '@/views/databus/workbench/ai/ai.types';
import { useAgentPush } from '@/views/databus/workbench/ai/useAgentPush';
import { AGENT_EVENT, COMPONENT_STATUS, MARKET_RESOURCE_TYPE } from '@/constants/databus';
import {
  DATABUS_RESOURCE_TYPE_CHAIN,
  DATABUS_RESOURCE_TYPE_COMPONENT,
  DATABUS_RESOURCE_TYPE_CONNECTION,
  DATABUS_RESOURCE_TYPE_DIRECTORY,
  DATABUS_RESOURCE_TYPE_MARKET_REF,
  DATABUS_RESOURCE_TYPE_SYSTEM_LEAF
} from '@/constants/databus-common';
import type { CmpProperty } from '@/api/databus/el/types';
import ChainForm from '../chain/ChainForm.vue';
import type { ChainFormSuccessPayload } from '../chain/ChainFormBody.vue';
import ChainCopyDialog from '../chain/ChainCopyDialog.vue';
import { useWorkspaceTabs, canvasKey, EXECUTION_LIST_KEY } from './composables/useWorkspaceTabs';
import { useRecentResources } from './composables/useRecentResources';
import { useWorkspaceTerminal } from './composables/useWorkspaceTerminal';
import WorkspaceWorkPanel from './panel/WorkspaceWorkPanel.vue';
import WorkbenchLauncher from './panel/WorkbenchLauncher.vue';
import WorkspaceCommandPalette from './components/WorkspaceCommandPalette.vue';
import WorkbenchTerminal from './components/WorkbenchTerminal.vue';
import ResourceTree from './tree/ResourceTree.vue';
import type {
  ComponentSaved,
  ConnectionSaved,
  CreateFileType,
  CreateSavedPayload,
  FormPreset,
  LauncherCommand,
  MarketScope,
  ResourceMenuCommand,
  ResourceTreeNode,
  TabMenuCommand,
  WorkspaceTab
} from './workbench.types';
import { marketHighlightId } from './market/marketDisplay';
import type { MarketPublishedInfo } from './market/marketDisplay';

/* ---------------- 台账合流 ---------------- */

const rows = ref<ComponentRegistryRow[]>([]);
/** 库存脚本件运行时健康（启动期失败件用于列表顶部红条） */
const runtimeHealth = ref<ScriptRuntime[]>([]);
const { loading, withLoading } = useLoading(true);
const togglingCode = ref<string>();

const wb = useWorkspaceTabs();
const { tabs, activeKey, refreshTokens, refresh, refreshByKind } = wb;

/** 设置入口（§7 改造点3）：壳内开设置 tab（全局单例），不再跳 RuoYi 后台 */
const router = useRouter();
const userStore = useUserStore();
function goSettings() {
  wb.openSettings();
}
/** 退出登录（§7 改造点3）：确认后复用 RuoYi 登出链路（/auth/logout + 清 token + 回登录页） */
function onLogout() {
  ElMessageBox.confirm('确定退出当前账号吗？', '退出登录', {
    confirmButtonText: '退出',
    cancelButtonText: '取消',
    type: 'warning'
  })
    .then(async () => {
      await userStore.logout();
      router.replace('/login');
    })
    .catch(() => {});
}
const { recentOrdered, touch: touchRecent, remove: removeRecent, prune: pruneRecent } =
  useRecentResources();
/** 分组/业务域字典：资源树系统组件分组序要用，进页面即触发（模块级缓存，全会话一次） */
const { ensureTaxonomy } = useComponentTaxonomy();
/** ph 图标全集：台账 icon 契约是 `ph:*`，树叶子与卡片渲染前必须离线注入，否则运行时联网取图 */
const { loadPhIcons } = usePhIcons();

/**
 * 入口命令分发（两处消费：tab 条「+」下拉 + 零 tab 空态卡）。
 * 清单在 workspace/panel/launcherEntries.ts，只收「会真正开 tab」的入口——
 * 最近访问/收藏/系统组件是资源树常驻节，已在右抽屉可见，不再重复投放（2026-10-31）。
 */
function onLauncherCommand(cmd: LauncherCommand) {
  switch (cmd) {
    case 'market':
      wb.openMarket();
      break;
    // 物料管理（2026-11-01 补入口）：全局单例 tab，沿用 tab 上已落盘的视角
    case 'market-manage':
      wb.openMarketManage();
      break;
    // 新建四合一（2026-10-21 入口收敛）：开向导 create tab，filetype 段内向导里选
    case 'new':
      wb.openCreate();
      break;
    // 空态管理页入口卡（§8 步骤8）：开对应功能 tab（先立后破，菜单收敛后入口不丢）
    case 'admin-connection':
      wb.openConnectionList();
      break;
    case 'admin-execution':
      wb.openExecutionList();
      break;
    case 'admin-monitor':
      wb.openMonitorOverview();
      break;
    case 'admin-alert':
      wb.openAlertRecord();
      break;
    case 'admin-settings':
      wb.openSettings();
      break;
  }
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
    // 窗口族（§6.4）：新窗体 / 浏览器全屏 / 壳内专注收栏
    case 'open-new': {
      const tab = tabs.value.find((t) => t.key === key);
      if (tab) openStandalone(tab);
      break;
    }
    case 'toggle-full':
      toggleFullscreen();
      break;
    case 'toggle-max':
      toggleFocus();
      break;
    default:
      break;
  }
}

/* ---------- 窗口族（§6.4 standalone 逃生 / 全屏 / 专注） ---------- */

/** 锚点 tab ✗kind → standalone 逃生 URL（七管理 kind 全带；编辑态 kind 返回 null 置灰菜单） */
function buildStandaloneUrl(tab: WorkspaceTab): string | null {
  switch (tab.kind) {
    case 'connection-list':
      return '/databus/standalone/connection';
    case 'connection-form':
      return `/databus/standalone/connection/${tab.formId ?? 'new'}`;
    case 'execution-list':
      return '/databus/standalone/execution';
    case 'execution-record':
      return tab.recordId != null
        ? `/databus/standalone/execution/${tab.recordId}`
        : '/databus/standalone/execution';
    case 'monitor-overview':
      return '/databus/standalone/monitor';
    case 'alert-record':
      return '/databus/standalone/alert';
    case 'settings':
      return '/databus/standalone/settings';
    default:
      return null;
  }
}

function openStandalone(tab: WorkspaceTab) {
  const url = buildStandaloneUrl(tab);
  if (url) window.open(url, '_blank');
}

/** 浏览器级全屏（toggle 切换），宿主根上即可 */
function toggleFullscreen() {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
  } else {
    void document.documentElement.requestFullscreen();
  }
}

/** 壳内专注：收起 AI 栏/会话历史/右抽屉/底部终端，内容最大化 */
function toggleFocus() {
  aiCollapsed.value = true;
  historyCollapsed.value = true;
  setDrawerCollapsed(true);
  // 走终端统一的 close：连带复位两条流的 open，避免只关容器导致下次 append 不自动弹出
  closeTerminal();
}

/* ---------------- 前端偏好（开合与宽度） ---------------- */

const aiCollapsed = usePersisted('databus.ws.aiCollapsed', true);
const aiWidth = usePersisted('databus.ws.aiWidth', 400);
/** AI 栏最小宽度：再窄对话区无可用宽度，同时作为「拖到最窄=收起历史栏」的阈值 */
const AI_MIN_WIDTH = 400;
/** AI 栏最大宽度：正文与卡片再宽只是拉长行宽，阅读要来回扫 */
const AI_MAX_WIDTH = 640;
// 旧偏好可能越界，进来先夹到 [min, max]
if (aiWidth.value < AI_MIN_WIDTH) {
  aiWidth.value = AI_MIN_WIDTH;
} else if (aiWidth.value > AI_MAX_WIDTH) {
  aiWidth.value = AI_MAX_WIDTH;
}

/** 结果页「加入会话」的跨组件信号：附件加进暂存区后把 AI 栏展开，让新卡片当场可见 */
const REVEAL_AI_EVENT = 'databus:reveal-ai';

function onRevealAiRail(): void {
  aiCollapsed.value = false;
}
/** 会话历史栏：与其它工作台共享同一单例，AI 收起/拖到最窄时单向连带收起 */
const { collapsed: historyCollapsed, width: historyWidth, bindHistoryToAi } = useAiSessionHistory();
bindHistoryToAi(aiCollapsed, aiWidth, AI_MIN_WIDTH);
const { collapsed: drawerCollapsed, setCollapsed: setDrawerCollapsed } =
  usePanelCollapse('databus.drawer.collapsed');
const drawerWidth = usePersisted('databus.drawer.width', 300);

/** 当前激活画布上报的抽屉名片（无画布时为 null，属性/EL/大纲显示空态） */
const activePort = useActiveDrawerPort();

/* ---------------- 终端（运行/构建双流同卡片） ---------------- */

/** 底部终端整体开合：header 开关与终端共用同一个单例 ref（v-model:console-open） */
const {
  open: consoleOpen,
  run,
  comp,
  switchTab: switchTerminalTab,
  close: closeTerminal
} = useWorkspaceTerminal();
/** header 收起态角标：两条流错误数之和 */
const consoleErrorCount = computed(() => run.errorCount.value + comp.errorCount.value);
/** 编译控制台诊断跳行目标（激活/切到对应组件编辑 tab，行内跳转由 ScriptTab 完成） */
const { revealTarget } = useCompileConsole();

/* tab 重载令牌由 useWorkspaceTabs 持有（wb.refresh 自增、close 时清理），此处只消费 */

/* ---------------- tab 派生态 ---------------- */

const activeTab = computed(() => tabs.value.find((t) => t.key === activeKey.value));
/** 当前激活 tab 的 kind：驱动右抽屉露出几个 tab（仅 canvas/detail/form/changes 露多 tab，其余只显资源树） */
const drawerKind = computed<DrawerKind>(() => {
  const kind = activeTab.value?.kind;
  return kind === 'canvas' || kind === 'detail' || kind === 'form' || kind === 'changes'
    ? kind
    : 'none';
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

/**
 * 当前仍是 DRAFT 的组件编码：AI 资源卡的播放钮据此露出。
 * 用台账现算而不是只认卡片上的 draft 字段——老消息落库时还没有该字段。
 */
const draftComponentCodes = computed(() =>
  rows.value.filter((r) => r.db?.status === COMPONENT_STATUS.DRAFT).map((r) => r.code)
);

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
    const [optRes, listRes, draftRes, runtimeRes] = await Promise.allSettled([
      listComponentOptions(),
      listComponent({ pageNum: 1, pageSize: 999 }),
      // 草稿单独拉一次：列表接口默认排除 DRAFT，但发起人得能找回自己的草稿
      listComponent({ pageNum: 1, pageSize: 999, status: COMPONENT_STATUS.DRAFT }),
      listScriptRuntime()
    ]);
    const options: ComponentOption[] =
      optRes.status === 'fulfilled' ? optRes.value.data?.components ?? [] : [];
    const dbRows = [
      ...(listRes.status === 'fulfilled' ? listRes.value.data?.rows ?? [] : []),
      ...(draftRes.status === 'fulfilled' ? draftRes.value.data?.rows ?? [] : [])
    ];
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
  // 草稿（AI 落下的 DRAFT 行）不进详情：一律进审阅 tab，由人点采纳或拒绝
  if (row.db?.id != null && row.db.status === COMPONENT_STATUS.DRAFT) {
    wb.openComponentReview(row.db.id, row.name);
    touchRecent({ type: DATABUS_RESOURCE_TYPE_COMPONENT, refId: row.code, title: row.name, icon: row.icon });
    return;
  }
  wb.openDetail(row);
  touchRecent({ type: DATABUS_RESOURCE_TYPE_COMPONENT, refId: row.code, title: row.name, icon: row.icon });
}

/** 面板内组件引用（画布节点 / AI 回执）：按 code 解析台账行后统一走 openDetail（草稿分流到审阅） */
function handleOpenComponentRef(code: string, name: string) {
  const row = rowByCode(code);
  if (row) {
    openDetail(row);
    return;
  }
  wb.openDetail({ code, name });
}

/** 新建组件：收敛到向导 tab component 段（树目录右键携带 group/domain/归属目录 preset 预填） */
function handleAdd(preset?: FormPreset) {
  wb.openCreate(DATABUS_RESOURCE_TYPE_COMPONENT, preset);
}

function handleEdit(row: ComponentRegistryRow) {
  if (row.db?.id == null) {
    return;
  }
  // 草稿没有可编辑的正式配置：编辑入口同「查看」收敛到审阅 tab（源码可改由人改完采纳）
  if (row.db.status === COMPONENT_STATUS.DRAFT) {
    wb.openComponentReview(row.db.id, row.name);
    touchRecent({ type: DATABUS_RESOURCE_TYPE_COMPONENT, refId: row.code, title: row.name, icon: row.icon });
    return;
  }
  wb.openForm(row.db.id, row);
  touchRecent({ type: DATABUS_RESOURCE_TYPE_COMPONENT, refId: row.code, title: row.name, icon: row.icon });
}

function handleChanges(row: ComponentRegistryRow) {
  if (wb.openChanges(row)) {
    touchRecent({ type: DATABUS_RESOURCE_TYPE_COMPONENT, refId: row.code, title: row.name, icon: row.icon });
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
    type: DATABUS_RESOURCE_TYPE_COMPONENT,
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
      refresh(t.key);
    }
  }
}

/**
 * 草稿归属会话：component:draft:saved 事件带出 conversationId，采纳成功后据此续跑。
 * 内存即可——刷新后丢失只意味着不自动续跑，不影响任何数据。
 */
const agentDraftConversations = new Map<string, string>();

/**
 * 采纳成功后自动续跑（施工单 §3.3）：
 * 把「已采纳」告诉落草稿的那个会话，助手下一轮就能直接引用组件写链路。
 * 历史草稿（无归属）不触发；会话不活跃或正忙时只留提示，绝不抢跑/擅自切会话。
 */
function continueAfterDraftAdopted(payload: {
  id: number | string;
  componentCode: string;
  componentName: string;
  version?: number;
}) {
  const draftId = String(payload.id);
  const ownerConversationId = agentDraftConversations.get(draftId);
  if (!ownerConversationId) {
    return;
  }
  agentDraftConversations.delete(draftId);
  // 只上报事实：展示文案与给模型的指令都由后端事件目录生成，前端不再拼中文提示词
  const systemEvent = {
    code: 'component.draft.adopted',
    payload: {
      componentCode: payload.componentCode,
      componentName: payload.componentName,
      ...(payload.version != null ? { version: payload.version } : {})
    }
  };
  const awayText = `组件「${payload.componentName}」已采纳；回到该会话后助手会继续。`;
  if (ownerConversationId !== conversationId.value) {
    appendSystem(awayText, undefined, ownerConversationId);
    return;
  }
  if (agentRunning.value) {
    appendSystem(awayText, undefined, ownerConversationId);
    return;
  }
  void send('', undefined, undefined, systemEvent);
}

/** 草稿采纳成功：关审阅 tab、刷台账/树，再开该组件详情 tab 看生效结果（Pane 已提示成功） */
async function handleReviewAdopted(
  tab: WorkspaceTab,
  payload: { id: number | string; componentCode: string; componentName: string; version?: number }
) {
  wb.close(tab.key);
  // 草稿转正后预览链路已无意义（编码进 FlowBus，后端会拒绝再次临时注册）
  wb.closePreviewCanvas(payload.id);
  await getList();
  const row = rowByCode(payload.componentCode);
  if (row) {
    openDetail(row);
  } else {
    wb.openDetail({ code: payload.componentCode, name: payload.componentName });
    touchRecent({ type: DATABUS_RESOURCE_TYPE_COMPONENT, refId: payload.componentCode, title: payload.componentName });
  }
  // 生效结果落定后再续跑：助手拿到的是「已启用」事实，不会引用到草稿
  continueAfterDraftAdopted(payload);
}

/**
 * 草稿被拒后回灌：告知落草稿的会话「草稿已销毁」，避免助手继续等采纳或引用不存在的组件。
 * 与采纳续跑对称：历史草稿（无归属）不回灌；会话不活跃或正忙时只留提示。
 */
function continueAfterDraftRejected(payload: { id: number | string; componentCode: string }) {
  const draftId = String(payload.id);
  const ownerConversationId = agentDraftConversations.get(draftId);
  if (!ownerConversationId) {
    return;
  }
  agentDraftConversations.delete(draftId);
  const systemEvent = {
    code: 'component.draft.rejected',
    payload: { componentCode: payload.componentCode }
  };
  if (ownerConversationId !== conversationId.value || agentRunning.value) {
    appendSystem(`组件草稿「${payload.componentCode}」已被拒绝；回到该会话后助手会继续。`, undefined, ownerConversationId);
    return;
  }
  void send('', undefined, undefined, systemEvent);
}

/** 草稿拒绝成功：草稿行已物理删除，关 tab、清最近访问并刷台账/树（Pane 已提示成功） */
async function handleReviewRejected(tab: WorkspaceTab, payload: { id: number | string; componentCode: string }) {
  wb.close(tab.key);
  // 拒绝即草稿销毁：归属映射由回灌函数消费，避免 Map 随会话增长
  continueAfterDraftRejected(payload);
  wb.closePreviewCanvas(payload.id);
  removeRecent(DATABUS_RESOURCE_TYPE_COMPONENT, payload.componentCode);
  await getList();
}

async function handleDelete(row: ComponentRegistryRow) {
  if (row.db?.id == null) {
    return;
  }
  // 草稿走拒绝端点（物理删行 + 清宿主残留），语义与通用删除不同：草稿从未生效、无链路引用
  const isDraft = row.db.status === COMPONENT_STATUS.DRAFT;
  await modal.confirm(
    isDraft
      ? `是否确认删除草稿"${row.name}"（${row.code}）？草稿从未生效，删除后不可恢复。`
      : `是否确认删除自定义组件"${row.name}"（${row.code}）？删除后不可恢复。`
  );
  if (isDraft) {
    await rejectScriptDraft(row.db.id);
  } else {
    await delComponent(row.db.id);
  }
  modal.msgSuccess('删除成功');
  wb.closeByCode(row.code);
  removeRecent(DATABUS_RESOURCE_TYPE_COMPONENT, row.code);
  await getList();
}

/**
 * 卡片开关：val=true 启用（status ENABLED）/ false 停用（status DISABLED）。
 * 停用不硬拦：仅提示面板不可见、已发布链路继续跑（库存脚本件重启后不再注册，重启用恢复）。
 * 走独立启停端点（databus:component:toggle，治理专属）：不再借「修改组件」整包提交改 status，
 * 否则操作员凭 edit 权限也能停物料投放。入口显隐由 v-hasRoles(['databus_gov']) / v-hasPermi 同源门控。
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
    await toggleComponent(row.db.id, val ? COMPONENT_STATUS.ENABLED : COMPONENT_STATUS.DISABLED);
    modal.msgSuccess(val ? '已启用' : '已停用');
    await getList();
  } finally {
    togglingCode.value = undefined;
  }
}

/* ---------------- 物料市场（中栏 market tab 上抛，市场面板无 DB 行，动作归宿主） ---------------- */

/** 台账行按组件主键反查：市场「打开/启停」只带本地资源 id（链路副本/共享组件源 id） */
function rowById(id: string | number): ComponentRegistryRow | undefined {
  return rows.value.find((r) => r.db?.id != null && String(r.db.id) === String(id));
}

/** 打开本地资源：链路开画布 tab，组件开详情 tab（与树叶子开件同口径） */
function onMarketOpen(
  localResourceId: string | number,
  resourceType: 'COMPONENT' | 'CHAIN',
  title: string
) {
  if (resourceType === MARKET_RESOURCE_TYPE.CHAIN) {
    openChainCanvas(localResourceId, title);
    return;
  }
  const row = rowById(localResourceId);
  if (row) {
    openDetail(row);
  } else {
    ElMessage.warning('组件不在台账中，请刷新后重试');
  }
}

/** 安装/卸载成功：副本落在「我的目录」，台账与资源树都要重取；市场与管理两 pane 的数据也要跟上 */
async function onMarketInstalled() {
  await Promise.all([getList(), reloadTree()]);
  bumpMarketTokens();
}

/** 启停本地组件副本：复用卡片开关同一路径（停用有二次确认与重启语义） */
function onMarketToggle(localResourceId: string | number, enabled: boolean) {
  const row = rowById(localResourceId);
  if (row) {
    void toggleEnabled(row, enabled);
  }
}

/** 市场浏览卡片点主体：打开物料详情 tab（kind market-detail，同 id 单例，pane 自取数） */
function onMarketOpenDetail(itemId: string | number, title: string) {
  wb.openMarketDetail(itemId, title);
}

/** 待审核「详情」：打开物料审核 tab（kind market-review，同 id 单例，2026-10-24 弹窗 tab 化） */
function onMarketOpenReview(itemId: string | number, title: string) {
  wb.openMarketReview(itemId, `审核 · ${title}`);
}

/** 「查看」连接器包：打开包查看 tab（kind connector-package，同 type+version 单例，2026-10-29 弹窗 tab 化）；
 *  source 透传给 pane：DEV＝开发目录装载，没有 zip，pane 改渲染目录装载信息 */
function onConnectorPackageOpen(type: string, version: string, source?: string) {
  wb.openConnectorPackage(type, version, source);
}

/**
 * 给所有市场类 tab（market + market-manage）自增刷新令牌。
 * 拆成两个 tab 后各自持有独立的 useMarketData 实例，一方动了台账另一方看不见——
 * 审核减号、连接器启停、安装态都靠这个令牌广播（workbench-unification.md §2.1 连带红线）。
 */
function bumpMarketTokens() {
  refreshByKind('market');
  refreshByKind('market-manage');
}

/**
 * 上架成功：广播刷新令牌；连接器包提交还会带新物料 id——切到「我的上架」并写入高亮信号，
 * 让用户当场看到刚提交的那一条（toast 消失后仍留线索）。
 */
function onMarketPublished(info?: MarketPublishedInfo) {
  bumpMarketTokens();
  if (info?.highlightId != null) {
    wb.openMarketManage(info.scope);
    marketHighlightId.value = String(info.highlightId);
  }
}

/**
 * 物料审核完成（通过/驳回成功）：关审核 tab；广播市场令牌——
 * 待审核冒泡在市场 pane、待审核列表在管理 pane，两边都要重取。
 */
function onMarketReviewed(tab: WorkspaceTab) {
  wb.close(tab.key);
  bumpMarketTokens();
}

/** 依赖单据就地审完（闭包联审）：审核 tab 保持开着，只广播市场令牌 */
function onMarketDepReviewed() {
  bumpMarketTokens();
}

/** P1 看得见（decisions §十四-7 扩展）：审核详情「查看」开工作台 tab 看物料真身——
 *  链路按源 id 开画布 tab；组件按源 code 开详情 tab（正本身份是 code，pane 自取数）。
 *  源资源非当前用户所有：链路保存被后端 updateByBo owner 校验拦截（前端只读态另做） */
function onMarketOpenSource(
  resourceType: 'COMPONENT' | 'CHAIN',
  sourceId: string | number,
  code: string | null,
  title: string
) {
  if (resourceType === MARKET_RESOURCE_TYPE.CHAIN) {
    openChainCanvas(sourceId, title);
    return;
  }
  if (code) {
    wb.openDetail({ code, name: title });
  }
}

/** 物料详情页「@作者」：回市场 tab 并筛该作者作品（意图经 marketNavIntent 传给市场 pane 消费） */
function onMarketOpenMarket() {
  wb.openMarket();
}

/** 去物料管理 tab（全局单例，kind market-manage）；带 scope＝顺便切到那个视角。
 *  已开时只聚焦+切视角，管理 tab 自身不关（与市场 tab 并存） */
function onMarketOpenManage(scope?: MarketScope) {
  wb.openMarketManage(scope);
}

/** 管理 pane 内切视角：回写 tab.marketScope，随会话落盘（刷新后原地恢复） */
function onMarketManageScope(scope: MarketScope) {
  wb.setMarketScope(scope);
}

/** 上架入口（管理页头/我的上架空态/市场空态，2026-11-01 上架 tab 化）：
 *  开物料上架 tab（kind market-publish，全局单例）；from＝来路，返回钮据此回跳 */
function onMarketOpenPublish(from: 'market' | 'manage') {
  wb.openMarketPublish(from);
}

/** 上架 tab 返回钮：按来路聚焦市场/管理 tab（上架 tab 不关、表单内容保留——定案 2026-11-01） */
function onMarketPublishBack(tab: WorkspaceTab) {
  if (tab.publishFrom === 'market') {
    wb.openMarket();
  } else {
    wb.openMarketManage();
  }
}

/**
 * 物料详情「实现」页打开源链路画布（2026-10-24 装前可看）：按源链 id 开画布 tab，
 * 只读态由 ChainCanvasPane 按「chainOwner ≠ 当前用户」自动判定——未安装者看编排不能改。
 */
function onMarketOpenSourceCanvas(chainId: string | number, title: string) {
  openChainCanvas(chainId, title);
}

/* ---------------- 连接管理（中栏 connection tab 上抛，pane 无路由依赖） ---------------- */

/** 连接列表点卡片：聚焦连接对象 tab；点「新建」收敛到向导 connection 段（2026-10-21 入口收敛） */
function onOpenConnection(id: number | 'new', title: string) {
  if (id === 'new') {
    wb.openCreate(DATABUS_RESOURCE_TYPE_CONNECTION);
    return;
  }
  wb.openConnectionForm(id, title);
}

/**
 * 连接保存成功：刷新连接列表 tab；新建时后端不回填主键，关掉对象 tab（避免重复保存），
 * 编辑时把标题改成最新连接名。
 */
function onConnectionSaved(tab: WorkspaceTab, payload: ConnectionSaved) {
  refreshByKind('connection-list');
  if (payload.isNew) {
    wb.close(tab.key);
  } else {
    tab.title = payload.connectionName;
  }
}

/* ---------------- 新建向导承接（中栏 create tab 上抛，2026-10-21 入口收敛） ---------------- */

/**
 * 向导保存回报（向导 tab 保留、表单已由 CreatePane 复位，可连续新建）：按 filetype 分槽派发——
 * chain 刷树后直接开新链路画布 tab（对齐 ChainForm 新建语义）；component 刷台账与树；
 * directory 刷树；connection 刷连接列表 tab（未打开时下次打开自会取数）。
 */
async function onCreateSaved(payload: CreateSavedPayload) {
  switch (payload.filetype) {
    case DATABUS_RESOURCE_TYPE_CHAIN: {
      await reloadTree();
      if (payload.chain && payload.chain.id != null) {
        openChainCanvas(payload.chain.id, payload.chain.chainName);
      }
      break;
    }
    case DATABUS_RESOURCE_TYPE_COMPONENT:
      await Promise.all([getList(), reloadTree()]);
      break;
    case DATABUS_RESOURCE_TYPE_DIRECTORY:
      await reloadTree();
      break;
    case DATABUS_RESOURCE_TYPE_CONNECTION: {
      refreshByKind('connection-list');
      break;
    }
  }
}

/** 向导切段确认后回报：同步 tab.filetype（随 tab 持久化，会话恢复回到原分段） */
function onCreateFiletype(tab: WorkspaceTab, filetype: CreateFileType) {
  tab.filetype = filetype;
}

/* ---------------- 执行记录（中栏 execution tab / 底部终端上抛，pane 无路由依赖） ---------------- */

/**
 * 打开单条执行记录 tab：列表里点「查看记录」、终端日志行点「查看记录」共用。
 * 同时给执行列表 tab 自增刷新令牌——重跑后列表数据已变，回到列表须看到最新态。
 */
function onOpenExecutionRecord(recordId: number | string, title?: string) {
  wb.openExecutionRecord(recordId, title);
  refresh(EXECUTION_LIST_KEY);
}

/** 记录 tab 内重跑完成：列表 tab 若已打开则刷新（未打开时下次打开自会取数） */
function onExecutionRefresh() {
  refresh(EXECUTION_LIST_KEY);
}

/** AI 助手选中某组件（v1 空壳预留）：等价于在树上点该叶子 */
function onAiSelect(payload: string) {
  const row = rowByCode(payload);
  if (row) {
    openDetail(row);
  }
}

/**
 * 新建会话（AI 栏头 / 历史栏表头共用）：换一个空会话桶并切过去。
 * 不打断其它会话正在跑的 run —— 会话是并行单位。
 */
function onAiNewSession() {
  createSession();
}

/** 历史栏点某条会话：切过去，已加载过的不再重复拉历史 */
function onHistoryOpen(session: AiSession) {
  switchSession(session.id);
}

/** 历史栏重命名：只改显示标题，成功后状态层按当前搜索/列表模式刷新 */
async function onHistoryRename(session: AiSession, title: string) {
  try {
    await renameSession(session.id, title);
  } catch {
    /* 拦截器已提示 */
  }
}

/** 历史栏置顶 / 取消置顶：排序由后端统一给出，刷新即可 */
async function onHistoryPin(session: AiSession, pinned: boolean) {
  try {
    await pinSession(session.id, pinned);
  } catch {
    /* 拦截器已提示 */
  }
}

/** 历史栏删除：软删覆盖信息，删的若是当前会话由状态层回到空态 */
async function onHistoryDelete(session: AiSession) {
  try {
    await removeSession(session.id);
  } catch {
    /* 拦截器已提示 */
  }
}

/** 历史栏搜索：空串即退出搜索，回到完整列表 */
function onHistorySearch(keyword: string) {
  void searchSessions(keyword);
}

/**
 * AI 对话里点引用卡：链路开画布 tab、组件开详情 tab、连接器开包详情 tab。
 * 组件只带 code 时按台账反查，查不到（如未登记的内置件）只提示、不跳转。
 */
function onAgentRefOpen(item: AgentRefItem) {
  if (item.type === DATABUS_RESOURCE_TYPE_CHAIN) {
    if (item.id == null) {
      ElMessage.warning(`链路「${item.name}」缺少 id，暂无法打开`);
      return;
    }
    openChainCanvas(item.id, item.name);
    return;
  }
  if (item.type === 'connector') {
    if (!item.connectorType || !item.connectorVersion) {
      ElMessage.info(`连接器「${item.name}」缺少版本信息，暂无法打开包详情`);
      return;
    }
    wb.openConnectorPackage(item.connectorType, item.connectorVersion);
    return;
  }
  void openComponentRef(item);
}

/**
 * 组件引用卡：草稿行可能刚由 AI 落库、树还没刷到，先补拉一次再反查；
 * 草稿行走 openDetail 的 DRAFT 分支，直接落到审阅 tab。
 */
async function openComponentRef(item: AgentRefItem) {
  let row = item.code ? rowByCode(item.code) : undefined;
  if (!row && item.code) {
    await getList().catch(() => undefined);
    row = rowByCode(item.code);
  }
  if (!row) {
    ElMessage.warning(`未找到组件「${item.name}」，暂无法打开`);
    return;
  }
  openDetail(row);
}

/**
 * 草稿卡「▶ 试运行」：开一条纯内存单节点预览链路（不落库、不持久化）。
 * 只有草稿行有该入口；这里再兜一层状态校验，避免旧消息/竞态把已生效组件当草稿跑。
 */
async function onAgentRefPreview(item: AgentRefItem) {
  let row = item.code ? rowByCode(item.code) : undefined;
  if (!row && item.code) {
    await getList().catch(() => undefined);
    row = rowByCode(item.code);
  }
  if (row?.db?.id == null) {
    ElMessage.warning(`未找到组件「${item.name}」，暂无法试运行`);
    return;
  }
  if (row.db.status !== COMPONENT_STATUS.DRAFT) {
    ElMessage.warning('只有草稿组件支持预览链路');
    return;
  }
  wb.openPreviewCanvas(row.db.id, row.name);
}

/** 终端试运行行「详情」：结果本体在内存运行流里，按 runId 开结果 tab（不弹窗） */
function onViewPreview(runId: number, title?: string) {
  wb.openPreviewResult(runId, title || '试运行结果');
}

// 台账刷新后剔除已不存在的「最近访问」自建组件项（链路项由资源树按链路表过滤）
watch(rows, (list) => {
  if (!list.length) {
    return;
  }
  const alive = new Set(list.map((r) => r.code));
  pruneRecent((item) => !(item.type === DATABUS_RESOURCE_TYPE_COMPONENT && !alive.has(String(item.refId))));
});

/* ---------------- 统一资源树命令承接 ---------------- */

const treeRef = ref<InstanceType<typeof ResourceTree>>();
const workPanelRef = ref<InstanceType<typeof WorkspaceWorkPanel>>();
const chainFormRef = ref<InstanceType<typeof ChainForm>>();
const copyDialogRef = ref<InstanceType<typeof ChainCopyDialog>>();

function reloadTree() {
  return treeRef.value?.reload();
}

/**
 * 打开链路画布并记入最近访问。
 * <p>「最近访问」是 localStorage 台账（useRecentResources），不由树接口返回；
 * AI 推送、向导、市场、审核看源这些入口都不经过资源树，若各自调 wb.openCanvas
 * 就会漏记，因此收口到本方法。
 */
function openChainCanvas(chainId: string | number, title: string) {
  wb.openCanvas(chainId, title);
  touchRecent({ type: DATABUS_RESOURCE_TYPE_CHAIN, refId: chainId, title });
}

/* ---------------- AI 画布事件接线（§12.4 四分支） ---------------- */

/** AI canvas 推送的 data 载荷（§12.2；message 留给人类可读文案） */
interface AgentCanvasEvent {
  eventCode?: string;
  runId?: string;
  /** 该事件属于哪个会话（阶段三起由后端带出，用于跨会话提示文案） */
  conversationId?: string;
  seq?: number;
  chainId?: number | string;
  chainName?: string;
  /** 本次是新建还是修改链路：新建时即使画布没开着也自动开 tab */
  operation?: 'CREATE' | 'UPDATE';
  cmpProperty?: CmpProperty | null;
  /** 落库后的链路更新时间：画布存为基线，用来发现漏掉的后续推送 */
  updateTime?: string | null;
  revealNodeId?: string | null;
  /** component:draft:saved 事件：刚落库的组件草稿 */
  componentId?: number | string;
  componentCode?: string;
  componentName?: string;
}

const {
  conversationId,
  running: agentRunning,
  sessionList,
  sessionGroups,
  createSession,
  switchSession,
  appendSystem,
  send,
  refreshSessions,
  searchSessions,
  renameSession,
  pinSession,
  removeSession
} = useAgentChat();
/** 资源「加入会话」：只暂存为上下文附件，发消息时由对话面板整批带出 */
const { addContext, resourceContext } = useAgentContext();

// 历史栏首屏数据：进工作台先拉一次会话列表（失败就走空态，不阻塞工作台）
void refreshSessions();

/** 丢弃 canvas 事件后回推一条提示：让面板与用户都知道 AI 的改动没被采纳，并记入审计供下一轮告知 AI */
function notifyCanvasSkipped(chainName?: string, runId?: string, sourceConversationId?: string) {
  // 画布是客观事实，不按会话过滤；来自别的会话的事件加前缀，避免用户误以为是当前会话做的
  const fromOther = !!sourceConversationId && sourceConversationId !== conversationId.value;
  appendSystem(
    `${fromOther ? '（来自另一个会话）' : ''}已丢弃 AI 对「${chainName ?? '当前链路'}」的画布更新：画布上有未保存的改动。请先保存或放弃本地修改，再让 AI 重试。`,
    AGENT_EVENT.CHAIN_CANVAS_SKIPPED
  );
  if (runId) {
    reportAgentCanvasSkip(runId, chainName).catch(() => {
      /* 审计写入失败不影响本地提示 */
    });
  }
}

/** 按 §3.8 重画指定链路画布；pane 不在（tab 刚关）时只刷链树兜底 */
function redrawAgentCanvas(evt: AgentCanvasEvent) {
  if (evt.chainId == null) {
    return;
  }
  const done = workPanelRef.value?.applyAgentCanvas(evt.chainId, {
    cmpProperty: evt.cmpProperty ?? null,
    updateTime: evt.updateTime ?? null,
    revealNodeId: evt.revealNodeId ?? null
  });
  if (!done) {
    void reloadTree();
    return;
  }
  ElMessage.info(`画布已同步「${evt.chainName || '链路'}」的最新草稿`);
}

useAgentPush((payload) => {
  const evt = payload.data as AgentCanvasEvent | undefined;
  const code = evt?.eventCode;
  // chain:draft:saved：刷新链树（新链路/改名/草稿态）
  if (code === AGENT_EVENT.CHAIN_DRAFT_SAVED) {
    void reloadTree();
    // 兜底重拉画布：canvas:updated 那份整棵快照可能没生效（SSE 断连/多窗口未订阅/脏画布被跳过），
    // 只刷链树会让已打开的画布停在旧结构；试运行是拿本地画布生成 EL 的，就会一直复现旧错误，
    // 直到用户刷新页面才从库里重拉。这里按库里内容重拉一次，有未保存改动时不覆盖。
    if (evt?.chainId != null) {
      const target = tabs.value.find((t) => t.key === canvasKey(evt.chainId!));
      if (target && !target.dirty) {
        void workPanelRef.value?.reloadCanvas(evt.chainId);
      }
    }
    return;
  }
  // component:draft:saved：AI 落了组件草稿 → 草稿要能进树，同时把审阅 tab 顶出来，
  // 「采纳前不生效」这件事必须让人当场看见，而不是只写在回复里
  if (code === AGENT_EVENT.COMPONENT_DRAFT_SAVED) {
    void getList();
    if (evt?.componentId != null) {
      // 记下是哪个会话落下的草稿：采纳成功后只对它的主人自动续跑，历史草稿不触发
      if (evt.conversationId) {
        agentDraftConversations.set(String(evt.componentId), evt.conversationId);
      }
      const key = wb.openComponentReview(
        evt.componentId,
        evt.componentName || evt.componentCode || '脚本草稿'
      );
      // 同 id 草稿被重写时审阅 tab 是「已开只是聚焦」，必须显式刷新才能看到新源码/编译产物
      wb.refresh(key);
    }
    return;
  }
  if (code !== AGENT_EVENT.CHAIN_CANVAS_UPDATED || evt?.chainId == null) {
    return;
  }

  // 结构变了，链树先跟上（新建链路/改名/未归组都要重新分组）
  void reloadTree();

  const target = tabs.value.find((t) => t.key === canvasKey(evt.chainId!));
  const current = tabs.value.find((t) => t.key === activeKey.value);
  const currentCanvas = current?.kind === 'canvas' ? current : undefined;

  // 分支 4：目标链画布没开着 → 新建的链必须开 tab（用户要看新链）；只是改一条没开的链则只刷链树
  if (!target) {
    // 分支 3 的延伸：当前正看着另一条脏画布 → 在新 tab 打开目标链，绝不覆盖当前
    if (evt.operation === 'CREATE' || currentCanvas?.dirty) {
      openChainCanvas(evt.chainId!, evt.chainName || String(evt.chainId));
    }
    return;
  }

  // 分支 1：同一条链且画布干净 → 直接重画
  if (!target.dirty) {
    redrawAgentCanvas(evt);
    return;
  }

  // 分支 2：脏且是同一 chainId → 人工确认；拒绝则丢弃事件并回推提示（绝不静默覆盖）
  ElMessageBox.confirm('AI 要更新这张画布，你未保存的改动会被覆盖，是否继续？', '画布有未保存改动', {
    confirmButtonText: '覆盖并重画',
    cancelButtonText: '丢弃本次更新',
    type: 'warning'
  })
    .then(() => redrawAgentCanvas(evt))
    .catch(() => notifyCanvasSkipped(evt.chainName, evt.runId, evt.conversationId));
});

/** 「回到这次对话前」完成：刷链树 + 逐个重建 / 关闭画布 */
async function onAgentRolledBack(chains: { chainId: number | string; deleted: boolean }[]) {
  void reloadTree();
  let reloaded = false;
  for (const chain of chains) {
    if (chain.deleted) {
      // 撤销新建：链路已被删掉，画布 tab 也一并关掉，不让用户对着空链路
      wb.close(canvasKey(chain.chainId));
    } else {
      await workPanelRef.value?.reloadCanvas(chain.chainId);
      reloaded = true;
    }
  }
  if (!reloaded && chains.length) {
    ElMessage.success('AI 新建的链路已撤销');
  }
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
    openChainCanvas(chainId, node.label);
    return;
  }
  const row = rowOfNode(node);
  if (row) {
    openDetail(row);
  }
}

/**
 * 右键「加入会话」：与 hover 气泡走同一条路——整件资源进上下文暂存区，不直接发消息。
 * 链路给 chainId，自建组件给 dbId，系统内置件没有 DB 行就只给 componentCode。
 */
function addNodeToAgent(node: ResourceTreeNode) {
  const item = treeResourceContext(node);
  if (!item) {
    return;
  }
  addContext(item);
  ElMessage.success(`已加入会话：${item.title}`);
}

/** 树节点 → 上下文附件；没有可引用主键/编码时返回 null */
function treeResourceContext(node: ResourceTreeNode) {
  if (node.type === DATABUS_RESOURCE_TYPE_CHAIN) {
    const chainId = nodeChainId(node);
    if (chainId == null) {
      return null;
    }
    return resourceContext({ type: DATABUS_RESOURCE_TYPE_CHAIN, id: chainId, code: node.chainCode, name: node.label });
  }
  if (node.type !== DATABUS_RESOURCE_TYPE_COMPONENT && node.type !== DATABUS_RESOURCE_TYPE_SYSTEM_LEAF && node.type !== DATABUS_RESOURCE_TYPE_MARKET_REF) {
    return null;
  }
  if (!node.componentCode) {
    return null;
  }
  return resourceContext({
    type: DATABUS_RESOURCE_TYPE_COMPONENT,
    id: node.dbId ?? undefined,
    code: node.componentCode,
    name: node.label
  });
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
    case 'share-link':
      copyShareLink(node);
      break;
    case 'add-to-agent':
      addNodeToAgent(node);
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

    /* —— 市场引用叶：卸载（仅删我的安装记录，不动源组件本体） —— */
    case 'uninstall':
      void handleUninstallMarket(node);
      break;

    default:
      // 目录/收藏/移动等动作在树内闭环（见 ResourceTree），不上抛
      break;
  }
}

/** 卸载市场引用叶：树上 SHARED 安装组件的卸载（与 MarketPane.onUninstall 同口径） */
async function handleUninstallMarket(node: ResourceTreeNode) {
  const resourceId = node.dbId;
  if (resourceId == null) {
    return;
  }
  try {
    await modal.confirm(
      `确认卸载「${node.label}」？`
    );
  } catch {
    return;
  }
  try {
    await uninstallMarketItem(resourceId);
    modal.msgSuccess('已卸载');
    await onMarketInstalled();
  } catch {
    /* 拦截器已提示 */
  }
}

/** 分享链路/组件：拼只读分享 URL 并复制到剪贴板。
 *  链路 → editor/canvas/:chainId；组件 → editor/detail/:componentCode。
 *  鉴权不变（同源 token+perms），无权限打开即 403，不靠随机 URL 藏内容。 */
function copyShareLink(node: ResourceTreeNode) {
  const origin = window.location.origin;
  let href: string | null = null;
  if (node.type === DATABUS_RESOURCE_TYPE_CHAIN) {
    const chainId = nodeChainId(node);
    if (chainId != null) {
      href = `${origin}/databus/standalone/editor/canvas/${chainId}`;
    }
  } else if (node.componentCode) {
    href = `${origin}/databus/standalone/editor/detail/${encodeURIComponent(node.componentCode)}`;
  }
  if (!href) {
    ElMessage.warning('该资产缺少可分享的标识');
    return;
  }
  void navigator.clipboard
    .writeText(href)
    .then(() => ElMessage.success('分享链接已复制'))
    .catch(() => ElMessage.warning('复制失败，请手动复制地址栏链接'));
}

/** 树头部/目录右键「新建链路」：收敛到向导 chain 段（preset 预填归属目录，null=未归组） */
function onAddChain(directoryId: string | number | null) {
  wb.openCreate(DATABUS_RESOURCE_TYPE_CHAIN, { directoryId: directoryId ?? null });
}

/** 树「新建目录」承接：头部钮=根级无 preset；目录右键=建子目录，preset 预填父目录（开向导 directory 段） */
function onAddDirectory(preset?: FormPreset) {
  wb.openCreate(DATABUS_RESOURCE_TYPE_DIRECTORY, preset);
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
    openChainCanvas(payload.id, payload.chainName);
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
  const { data } = await publishChain(chainId);
  void reloadTree();
  await guidePublishAfterChain(data);
}

/**
 * 发布引导（decisions §十四-6）：链路发布成功后，闭包内未上架的自有物料弹窗确认整批提审；
 * 弹窗走 ElMessageBox（自定义按钮文案「提交审核 / 暂不上架」，modal.confirm 按钮文案固定）。
 * 他人未上架链后端直接拒发布（走不到这里）；他人未上架组件不阻塞，仅以编码软提示。
 */
async function guidePublishAfterChain(result?: ChainPublishResultVo): Promise<void> {
  const guide = result?.guideItems ?? [];
  const others = result?.otherUnlistedComponents ?? [];
  if (!guide.length) {
    if (others.length) {
      modal.msgWarning(`发布成功；链路引用了他人未上架组件：${others.join('、')}（不影响发布与运行）`);
    } else {
      modal.msgSuccess('发布成功');
    }
    return;
  }
  // 弹窗全局渲染，清单样式走内联（scoped 不生效）
  const message = h('div', { style: 'display:flex;flex-direction:column;gap:8px;' }, [
    h(
      'p',
      { style: 'margin:0;font-size:13px;line-height:1.6;color:var(--el-text-color-regular);' },
      `发布成功。还有 ${guide.length} 项你的物料未上架市场，上架后他人才能安装完整链路：`
    ),
    h(
      'div',
      { style: 'display:flex;flex-direction:column;gap:6px;max-height:240px;overflow-y:auto;padding:2px 0;' },
      guide.map((g) =>
        h('div', { style: 'display:flex;align-items:center;gap:8px;font-size:13px;min-width:0;' }, [
          h(
            'span',
            {
              style:
                'flex-shrink:0;width:44px;text-align:center;padding:1px 0;border-radius:4px;font-size:11px;' +
                (g.resourceType === MARKET_RESOURCE_TYPE.CHAIN
                  ? 'color:var(--el-color-primary);background:var(--el-color-primary-light-9);'
                  : 'color:var(--el-color-success);background:var(--el-color-success-light-9);')
            },
            g.resourceType === MARKET_RESOURCE_TYPE.CHAIN ? '链路' : '组件'
          ),
          h(
            'span',
            { style: 'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--el-text-color-primary);' },
            g.name
          )
        ])
      )
    ),
    ...(others.length
      ? [
          h(
            'p',
            { style: 'margin:0;font-size:12px;color:var(--el-text-color-secondary);' },
            `另引用了他人未上架组件：${others.join('、')}（不影响发布与运行）`
          )
        ]
      : []),
    h('p', { style: 'margin:0;font-size:12px;color:var(--el-text-color-secondary);' }, '提交后进入待审核，通过后即上架市场。')
  ]);
  try {
    await ElMessageBox.confirm(message, '发布成功 · 一并上架？', {
      confirmButtonText: '提交审核',
      cancelButtonText: '暂不上架',
      type: 'success'
    });
  } catch {
    modal.msgWarning('发布成功；物料暂未上架，可稍后在物料市场手动上架');
    return;
  }
  await publishMarketBatch({
    items: guide.map((g) => ({ resourceType: g.resourceType, sourceId: g.sourceId }))
  });
  modal.msgSuccess(`已将 ${guide.length} 项物料提交上架审核`);
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
  removeRecent(DATABUS_RESOURCE_TYPE_CHAIN, chainId);
  void reloadTree();
}

/** 执行完成：成败概要写入运行终端（自动弹出），行尾自带「详情 ↗」跳执行记录 */
function onExecuted(result: DatabusExecutionResult) {
  const ctx = executeCtx.value;
  run.appendChain({
    level: result.success ? 'success' : 'error',
    code: ctx?.chainCode ?? String(ctx?.chainId ?? result.chainId ?? ''),
    text: result.message ?? '',
    costMs: result.costTime,
    recordId: result.recordId ?? null
  });
  // 显式切「运行」：容器此前若被收起过（open 残留 true）watch 不会触发
  switchTerminalTab('run');
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

/** Ctrl/Cmd+K 打开命令面板；Ctrl+U 开合 AI 栏。输入区/代码编辑器内不抢键 */
const paletteOpen = ref(false);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable || !!target.closest('.cm-editor');
}

function onKeydown(event: KeyboardEvent) {
  // 命令面板属于全局入口，输入框里也应当能唤起
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    paletteOpen.value = !paletteOpen.value;
    return;
  }
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

/* ---------------- 响应式收栏（只收不放，保留用户手动展开的权利） ---------------- */

const narrowQuery = window.matchMedia('(max-width: 1199px)');
const compactQuery = window.matchMedia('(max-width: 1439px)');

function onNarrowChange(event: MediaQueryListEvent) {
  if (event.matches) {
    setDrawerCollapsed(true);
    historyCollapsed.value = true;
  }
}

function onCompactChange(event: MediaQueryListEvent) {
  if (event.matches) {
    historyCollapsed.value = true;
  }
}

function applyResponsiveCollapse() {
  if (narrowQuery.matches) {
    setDrawerCollapsed(true);
    historyCollapsed.value = true;
  } else if (compactQuery.matches) {
    historyCollapsed.value = true;
  }
}

onMounted(() => {
  // 工作区是剥壳独立路由（不挂 Layout），Layout 里的全局推送初始化不会执行：
  // 不在这里补一次 SSE，AI 的 databus:agent:chain:canvas:updated / chain:draft:saved 业务事件就永远收不到（只有对话流可用）。
  // initPush 内部先 closePush，重复调用安全。
  initPush();
  // 字典与 ph 图标全集都在树首次渲染前触发；getList 拉台账双源合流
  void ensureTaxonomy();
  void loadPhIcons();
  // 品牌图标集（logos）：连接器 manifest 里 `logos:mysql` 这类值要靠它离线渲染，见 useBrandIcons
  void loadBrandIcons();
  getList();
  applyResponsiveCollapse();
  narrowQuery.addEventListener('change', onNarrowChange);
  compactQuery.addEventListener('change', onCompactChange);
  window.addEventListener('keydown', onKeydown);
  window.addEventListener(REVEAL_AI_EVENT, onRevealAiRail);
});

onBeforeUnmount(() => {
  narrowQuery.removeEventListener('change', onNarrowChange);
  compactQuery.removeEventListener('change', onCompactChange);
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener(REVEAL_AI_EVENT, onRevealAiRail);
});
</script>

<style lang="scss" scoped>
/* 页面级 wrapper：吃满视口高度（2026-10-20 剥壳后不再缩后台 header 高度，§7 改造点2）。
   顶部 header 与工作区画布、会话历史栏统一用 --db-bg-sunken 同色，
   整块工作台是一张连续的面，只有中间/右侧内容白卡浮起。
   （早期为避免 tab 轨道与灰底混淆曾垫白，现按「整体统一」重新定案。） */
.wsp-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--db-bg-sunken, #f4f4f5);
  /* 与画布同圆角：header 带和下方画布共用 14px，壳的四角一条曲线到底 */
  border-radius: var(--db-r-card, 14px);
}

.wsp {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
  overflow: hidden;
  /* 浮岛画布：与输入井/会话历史栏同色（--db-bg-sunken），左栏无缝融进画布；
     8px 内衬 + 8px 栏间距，中栏/对话/抽屉各自成白卡 */
  gap: 8px;
  margin-top: 8px;
  padding: 8px;
  background: var(--db-bg-sunken, #f4f4f5);
  border: none;
  border-radius: var(--db-r-card, 14px);
}

/* 中栏：工作面板（flex:1）+ 终端纵向排布，宽度 = 三栏分配后的余量；
   自身是一张白卡，圆角裁切，与外层灰底形成层级 */
.wsp__center {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--db-surface, #fff);
  border-radius: var(--db-r-card);
  overflow: hidden;
}

/* 右抽屉槽：折叠时宽度收 0（不 v-if，保活 tab 停留位与资源树状态）；
   inner 固定 drawerWidth 不随收窄动画回流，外层 overflow 裁剪 */
.wsp__drawer {
  flex-shrink: 0;
  height: 100%;
  overflow: hidden;
  border-radius: var(--db-r-card);
  transition: width 0.2s ease;
}
</style>
