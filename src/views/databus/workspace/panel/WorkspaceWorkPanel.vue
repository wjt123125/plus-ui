<!--
  工作区中栏工作面板（单壳，常驻不可折叠）：多 kind tab 混排，pane 按 kind 分发（§2.1）。
  - canvas：链路画布（ChainCanvasPane workbench 宿主，v-show 保活）
  - detail / form / changes：组件详情 / 编辑 / 代码变更（原 WorkPanel 三 pane 平移）
  tab 由宿主传入；v-show 切换不销毁（切走草稿保留）；关闭带脏圆点的 tab 弹确认（全站唯一模态）；
  Ctrl+PageDown/PageUp 循环切 tab（焦点在输入区/编辑器内不抢键）。
  空态（tab 全关）由宿主经 #empty 插槽注入导航面板，缺省回退为一句提示。
-->
<template>
  <section class="ws-panel">
    <div v-if="tabs.length" class="ws-panel__strip">
      <div ref="tabsRef" class="ws-panel__tabs" @wheel="onTabsWheel">
        <div
          v-for="tab in tabs"
          :key="tab.key"
          class="wb-tab"
          :class="{ 'is-active': tab.key === activeKey }"
          :title="tabTitle(tab)"
          @click="emit('update:activeKey', tab.key)"
          @mousedown.middle.prevent="requestClose(tab.key)"
          @contextmenu.prevent="onTabContextMenu(tab, $event)"
        >
          <span v-if="tab.dirty" class="wb-tab__dirty" aria-label="未保存" />
          <SvgIcon v-else class="wb-tab__icon" :icon-class="tabIcon(tab.kind)" />
          <span class="wb-tab__title">{{ tab.title }}</span>
          <SvgIcon class="wb-tab__close" icon-class="lucide:x" @click.stop="requestClose(tab.key)" />
        </div>
      </div>
    </div>

    <div class="ws-panel__body">
      <slot v-if="!tabs.length" name="empty">
        <el-empty class="ws-panel__empty" :image-size="72">
          <template #description>
            <p class="ws-panel__empty-title">没有打开的面板</p>
            <p class="ws-panel__empty-hint">
              点右侧资源树的链路打开画布，点组件打开详情，或用上方入口新建
            </p>
          </template>
        </el-empty>
      </slot>
      <template v-for="tab in tabs" :key="tab.key">
        <div v-show="tab.key === activeKey" class="ws-panel__pane">
          <ChainCanvasPane
            v-if="tab.kind === 'canvas' && tab.chainId != null"
            host="workbench"
            :load-chain-id="tab.chainId"
            :active="tab.key === activeKey"
            @dirty-change="(dirty) => emit('dirty-change', tab.key, dirty)"
            @open-chain="(chainId, title) => emit('open-chain', chainId, title)"
            @open-component="(code, name) => emit('open-component', code, name)"
          />
          <DetailPane
            v-else-if="tab.kind === 'detail' && rowOf(tab)"
            :row="rowOf(tab)!"
            @edit="(row) => emit('edit', row)"
            @delete="(row) => emit('delete', row)"
            @changes="(row) => emit('changes', row)"
          />
          <FormPane
            v-else-if="tab.kind === 'form'"
            :db-id="tab.dbId"
            :tag-suggestions="tagSuggestions"
            :refresh-token="refreshTokens[tab.key] ?? 0"
            :preset="tab.preset"
            @saved="(payload) => emit('saved', tab, payload)"
            @cancel="requestClose(tab.key)"
            @dirty-change="(dirty) => emit('dirty-change', tab.key, dirty)"
            @open-changes="emit('open-changes', tab)"
          />
          <ChangesPane
            v-else-if="tab.kind === 'changes' && tab.dbId != null"
            :db-id="tab.dbId"
            :code="tab.code"
            :current-version="currentVersionOf(tab)"
            @rolled="(result) => emit('rolled', tab, result)"
          />
          <!-- 新建向导（2026-10-21 新建入口收敛，decisions §10）：filetype 分段四合一表单体，单例 create tab -->
          <CreatePane
            v-else-if="tab.kind === 'create'"
            :filetype="tab.filetype ?? 'chain'"
            :preset="tab.preset"
            :tag-suggestions="tagSuggestions"
            @saved="(payload: CreateSavedPayload) => emit('create-saved', tab, payload)"
            @cancel="requestClose(tab.key)"
            @dirty-change="(dirty: boolean) => emit('dirty-change', tab.key, dirty)"
            @filetype-change="(filetype: CreateFileType) => emit('create-filetype', tab, filetype)"
          />
          <!-- 物料市场 tab：纯浏览（安装/详情/启停本地副本）；治理与上架在 market-manage tab -->
          <MarketPane
            v-else-if="tab.kind === 'market'"
            :refresh-token="refreshTokens[tab.key] ?? 0"
            @open-local="
              (id: string | number, type: 'COMPONENT' | 'CHAIN', title: string) =>
                emit('market-open', id, type, title)
            "
            @installed="emit('market-installed')"
            @open-detail="(it: DatabusMarketItemVo) => emit('market-open-detail', it.id, it.name)"
            @open-manage="(s?: MarketScope) => emit('market-open-manage', s)"
          />
          <!-- 物料管理 tab（2026-10-30 由 MarketPane 内部 view/scope 提为独立 tab）：
               已装管理 / 我的上架 / 待审核三视角 + 连接器治理 + 上传包；
               视角记在 tab.marketScope 上随会话落盘，刷新后原地恢复 -->
          <MarketManagePane
            v-else-if="tab.kind === 'market-manage'"
            :scope="tab.marketScope"
            :refresh-token="refreshTokens[tab.key] ?? 0"
            @open-local="
              (id: string | number, type: 'COMPONENT' | 'CHAIN', title: string) =>
                emit('market-open', id, type, title)
            "
            @installed="emit('market-installed')"
            @toggle-local="(id: string | number, enabled: boolean) => emit('market-toggle', id, enabled)"
            @open-detail="(it: DatabusMarketItemVo) => emit('market-open-detail', it.id, it.name)"
            @open-review="
              (id: string | number, title: string) => emit('market-open-review', id, title)
            "
            @open-connector-package="
              (type: string, version: string, source?: string) =>
                emit('connector-package-open', type, version, source)
            "
            @scope-change="(s: MarketScope) => emit('market-manage-scope', s)"
            @back-to-market="emit('market-open-market')"
          />
          <!-- 物料审核 tab（2026-10-24 审核详情弹窗 tab 化）：审完关 tab 并刷市场 pane 冒泡；
               「查看」同市场 pane 口径（链开画布、组件开详情） -->
          <MarketReviewTab
            v-else-if="tab.kind === 'market-review' && tab.marketReviewItemId != null"
            :item-id="tab.marketReviewItemId"
            @open-source="
              (type: 'COMPONENT' | 'CHAIN', sourceId: string | number, code: string | null, title: string) =>
                emit('market-open-source', type, sourceId, code, title)
            "
            @reviewed="emit('market-reviewed', tab)"
            @dep-reviewed="emit('market-dep-reviewed')"
            @open-connector-package="
              (type: string, version: string) => emit('connector-package-open', type, version)
            "
          />
          <MarketItemPane
            v-else-if="tab.kind === 'market-detail' && tab.marketItemId != null"
            :item-id="tab.marketItemId"
            @open-local="
              (id: string | number, type: 'COMPONENT' | 'CHAIN', title: string) =>
                emit('market-open', id, type, title)
            "
            @installed="emit('market-installed')"
            @open-market="emit('market-open-market')"
            @open-manage="emit('market-open-manage', 'mine')"
            @open-source-canvas="
              (chainId: string | number, title: string) => emit('market-open-source-canvas', chainId, title)
            "
          />
          <!-- 连接器包查看 tab（2026-10-29 「看包」弹窗 tab 化）：身份是 type+version 二元组，pane 自取数 -->
          <ConnectorPackagePane
            v-else-if="tab.kind === 'connector-package' && tab.connectorType && tab.connectorVersion"
            :type="tab.connectorType"
            :version="tab.connectorVersion"
            :source="tab.connectorSource"
          />
          <!-- 管理页 pane（2026-10-20 tab 化，§10 步骤2）：连接列表 / 连接对象 -->
          <ConnectionPane
            v-else-if="tab.kind === 'connection-list'"
            :refresh-token="refreshTokens[tab.key] ?? 0"
            @open="(id: number | 'new', title: string) => emit('open-connection', id, title)"
          />
          <ConnectionPane
            v-else-if="tab.kind === 'connection-form'"
            :form-id="tab.formId"
            @saved="(payload: ConnectionSaved) => emit('connection-saved', tab, payload)"
            @cancel="requestClose(tab.key)"
            @dirty-change="(dirty: boolean) => emit('dirty-change', tab.key, dirty)"
          />
          <!-- 管理页 pane（2026-10-20 tab 化，§10 步骤3）：执行记录列表 / 单条记录 -->
          <ExecutionPane
            v-else-if="tab.kind === 'execution-list'"
            :refresh-token="refreshTokens[tab.key] ?? 0"
            @open="(id: number | string, title?: string) => emit('open-execution', id, title)"
            @refresh="emit('execution-refresh')"
          />
          <ExecutionPane
            v-else-if="tab.kind === 'execution-record'"
            :record-id="tab.recordId"
            @open="(id: number | string, title?: string) => emit('open-execution', id, title)"
            @refresh="emit('execution-refresh')"
          />
          <!-- 管理页 pane（2026-10-20 tab 化，§10 步骤4）：监控大盘 / 告警记录 / 设置 -->
          <MonitorPane
            v-else-if="tab.kind === 'monitor-overview'"
            :active="tab.key === activeKey"
            @open-alert="emit('open-alert')"
          />
          <AlertPane v-else-if="tab.kind === 'alert-record'" />
          <SettingsPane v-else-if="tab.kind === 'settings'" />
          <el-empty v-else description="资源已不在台账中" :image-size="80" />
        </div>
      </template>
    </div>

    <TabContextMenu
      :visible="tabMenu.visible"
      :x="tabMenu.x"
      :y="tabMenu.y"
      :index="tabMenu.index"
      :total="tabs.length"
      :can-open-new="tabMenuCanOpenNew"
      @close="tabMenu.visible = false"
      @command="onMenuCommand"
    />
  </section>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import modal from '@/plugins/modal';
import type { ScriptSaveResult } from '@/api/databus/component/types';
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';
import ChainCanvasPane from '@/views/databus/editor/ChainCanvasPane.vue';
import type { ComponentRegistryRow } from '@/views/databus/component/model/registry';
import type { DatabusMarketItemVo } from '@/api/databus/market/types';
import type { ComponentSaved, ConnectionSaved, CreateFileType, CreateSavedPayload, MarketScope, TabMenuCommand, WorkspaceTab, WorkspaceTabKind } from '../workbench.types';
import DetailPane from './DetailPane.vue';
import FormPane from './FormPane.vue';
import CreatePane from './CreatePane.vue';
import ChangesPane from './ChangesPane.vue';
import ConnectionPane from './ConnectionPane.vue';
import ExecutionPane from './ExecutionPane.vue';
import MonitorPane from './MonitorPane.vue';
import AlertPane from './AlertPane.vue';
import SettingsPane from './SettingsPane.vue';
import TabContextMenu from './TabContextMenu.vue';
import MarketPane from '../market/MarketPane.vue';
import MarketManagePane from '../market/MarketManagePane.vue';
import MarketItemPane from '../market/MarketItemPane.vue';
import MarketReviewTab from '../market/MarketReviewTab.vue';
import ConnectorPackagePane from '../market/ConnectorPackagePane.vue';

defineOptions({ name: 'WorkspaceWorkPanel' });

/** tab 图标一律走 lucide（离线注入，不用 @element-plus/icons-vue） */
const TAB_ICON: Record<WorkspaceTabKind, string> = {
  canvas: 'lucide:spline',
  detail: 'lucide:file-text',
  form: 'lucide:file-pen',
  changes: 'lucide:file-diff',
  market: 'lucide:store',
  // 物料管理（2026-10-30 由 MarketPane 内部视图提为独立 tab）；与全局设置 tab 同图标，两者极少同屏
  'market-manage': 'lucide:settings',
  'market-detail': 'lucide:package',
  // 物料审核（2026-10-24 审核详情弹窗 tab 化）
  'market-review': 'lucide:file-check',
  // 连接器包查看（2026-10-29 「看包」弹窗 tab 化）；与 market-detail 的 package 错开，同屏两 tab 可辨
  'connector-package': 'lucide:box',
  // 管理页 tab（2026-10-20 扩展，§4.1）；图标一律取自 lucide 子集现有 key（见 useLucideSubset）
  'connection-list': 'lucide:external-link',
  'connection-form': 'lucide:file-pen',
  'execution-list': 'lucide:play',
  'execution-record': 'lucide:history',
  'monitor-overview': 'lucide:layout-grid',
  'alert-record': 'lucide:circle-alert',
  settings: 'lucide:settings',
  // 新建向导（2026-10-21 新建入口收敛，decisions §10）
  create: 'lucide:file-plus'
};

useLucideSubset();

const props = defineProps<{
  tabs: WorkspaceTab[];
  activeKey: string;
  /** 台账全量行，按 code 解析 tab 对应的最新数据 */
  rows: ComponentRegistryRow[];
  tagSuggestions: string[];
  /** tab key → 重载令牌，宿主自增触发面板刷新 */
  refreshTokens: Record<string, number>;
}>();

const emit = defineEmits<{
  (e: 'update:activeKey', key: string): void;
  (e: 'close', key: string): void;
  (e: 'tab-action', cmd: TabMenuCommand, key: string): void;
  (e: 'dirty-change', key: string, dirty: boolean): void;
  (e: 'open-chain', chainId: number | string, title: string): void;
  (e: 'open-component', code: string, name: string): void;
  (e: 'saved', tab: WorkspaceTab, payload: ComponentSaved): void;
  (e: 'rolled', tab: WorkspaceTab, result: ScriptSaveResult): void;
  (e: 'open-changes', tab: WorkspaceTab): void;
  (e: 'edit', row: ComponentRegistryRow): void;
  (e: 'delete', row: ComponentRegistryRow): void;
  (e: 'changes', row: ComponentRegistryRow): void;
  /** 物料市场：打开本地副本（使用）/ 安装卸载后刷树 / 启停本地组件副本 */
  (e: 'market-open', localResourceId: string | number, resourceType: 'COMPONENT' | 'CHAIN', title: string): void;
  (e: 'market-installed'): void;
  (e: 'market-toggle', localResourceId: string | number, enabled: boolean): void;
  /** 市场浏览卡片点主体：打开物料详情 tab；物料详情页请求回到市场 tab */
  (e: 'market-open-detail', itemId: string | number, title: string): void;
  /** 审核详情「详情」按钮：打开物料审核 tab（kind market-review，同 id 单例） */
  (e: 'market-open-review', itemId: string | number, title: string): void;
  /** 「查看」连接器包：打开包查看 tab（kind connector-package，同 type+version 单例） */
  (e: 'connector-package-open', type: string, version: string, source?: string): void;
  /** 物料审核完成（通过/驳回成功）：宿主关审核 tab 并刷新市场 pane 待审核冒泡 */
  (e: 'market-reviewed', tab: WorkspaceTab): void;
  /** 依赖单据就地审完（闭包联审）：审核 tab 不关，宿主只刷新市场 pane 待审核冒泡 */
  (e: 'market-dep-reviewed'): void;
  /** P1 看得见：审核「查看」——链按 sourceId 开画布、组件按 code 开详情（宿主分发，市场审核 tab 共用） */
  (e: 'market-open-source', resourceType: 'COMPONENT' | 'CHAIN', sourceId: string | number, code: string | null, title: string): void;
  (e: 'market-open-market'): void;
  /** 去物料管理 tab（kind market-manage，全局单例）；带 scope＝顺便切到那个视角 */
  (e: 'market-open-manage', scope?: MarketScope): void;
  /** 管理 pane 内切视角：宿主回写 tab.marketScope（随会话落盘，刷新后原地恢复） */
  (e: 'market-manage-scope', scope: MarketScope): void;
  /** 市场物料详情「实现」页：打开源链路只读画布（未安装也能看编排） */
  (e: 'market-open-source-canvas', chainId: string | number, title: string): void;
  /** 连接管理：列表点卡片/新增开新对象 tab；对象保存回报宿主（关 tab / 刷列表 / 改标题） */
  (e: 'open-connection', id: number | 'new', title: string): void;
  (e: 'connection-saved', tab: WorkspaceTab, payload: ConnectionSaved): void;
  /** 新建向导：保存回报宿主派发后续动作（开画布/刷树/刷列表，向导 tab 保留）；切段确认后同步 tab.filetype */
  (e: 'create-saved', tab: WorkspaceTab, payload: CreateSavedPayload): void;
  (e: 'create-filetype', tab: WorkspaceTab, filetype: CreateFileType): void;
  /** 执行记录：列表/记录视图点「查看记录」开新记录 tab；重跑后请宿主刷新列表 tab */
  (e: 'open-execution', recordId: number | string, title?: string): void;
  (e: 'execution-refresh'): void;
  /** 监控大盘「告警中」卡片：开告警记录 tab（路由壳下由宿主自己跳转，不在此 emit 语义内） */
  (e: 'open-alert'): void;
}>();

function rowOf(tab: WorkspaceTab): ComponentRegistryRow | undefined {
  return props.rows.find((r) => r.code === tab.code);
}

/** 代码变更 tab 的当前版本：台账行最新值优先（编辑保存/回滚后随刷新变化） */
function currentVersionOf(tab: WorkspaceTab): number | null {
  return rowOf(tab)?.db?.version ?? tab.version ?? null;
}

function tabTitle(tab: WorkspaceTab): string {
  if (tab.kind === 'canvas') {
    return tab.title;
  }
  if (tab.kind === 'changes') {
    return `代码变更 · ${tab.code}`;
  }
  return tab.code ? `${tab.title}（${tab.code}）` : tab.title;
}

function tabIcon(kind: WorkspaceTabKind): string {
  return TAB_ICON[kind];
}

/* ---------------- tab 条：无滚动条横滚 / 右键菜单 / 激活入视 ---------------- */

/** tab 滚动容器（.ws-panel__tabs）：滚轮横滚与激活入视的基准 */
const tabsRef = ref<HTMLElement>();
/** tab 右键菜单浮层状态（锚点 key 留宿主，菜单只收序号/总数） */
const tabMenu = reactive({ visible: false, x: 0, y: 0, key: '', index: 0, kind: '' as WorkspaceTabKind | '' });

/** 是否有 standalone 逃生页（§6.4 七项全带；画布/组件编辑等编辑态 kind 无 path → 置灰「新窗体」） */
const STANDALONE_KINDS: WorkspaceTabKind[] = [
  'connection-list',
  'connection-form',
  'execution-list',
  'execution-record',
  'monitor-overview',
  'alert-record',
  'settings'
];
const tabMenuCanOpenNew = computed(() => STANDALONE_KINDS.includes(tabMenu.kind as WorkspaceTabKind));

/** 滚轮横滚（VS Code/Trae 范式）：竖向 delta 折算进 scrollLeft，横向 delta 交浏览器原生处理 */
function onTabsWheel(event: WheelEvent) {
  const el = tabsRef.value;
  if (!el || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
    return;
  }
  el.scrollLeft += event.deltaY;
  event.preventDefault();
}

function onTabContextMenu(tab: WorkspaceTab, event: MouseEvent) {
  tabMenu.visible = true;
  tabMenu.x = event.clientX;
  tabMenu.y = event.clientY;
  tabMenu.key = tab.key;
  tabMenu.index = props.tabs.findIndex((t) => t.key === tab.key);
  tabMenu.kind = tab.kind;
}

/** 菜单命令：关闭走本地脏确认；其余关闭族语义上抛宿主（useWorkspaceTabs 承接） */
function onMenuCommand(cmd: TabMenuCommand) {
  const key = tabMenu.key;
  tabMenu.visible = false;
  if (cmd === 'close') {
    void requestClose(key);
    return;
  }
  emit('tab-action', cmd, key);
}

/** 激活 tab 自动滚入可视区（只动横向，不碰纵向与页面滚动） */
watch(
  () => props.activeKey,
  () => {
    void nextTick(() => {
      const el = tabsRef.value;
      const active = el?.querySelector<HTMLElement>('.wb-tab.is-active');
      if (!el || !active) {
        return;
      }
      const box = el.getBoundingClientRect();
      const tab = active.getBoundingClientRect();
      const margin = 4;
      if (tab.left < box.left) {
        el.scrollLeft -= box.left - tab.left + margin;
      } else if (tab.right > box.right) {
        el.scrollLeft += tab.right - box.right + margin;
      }
    });
  },
  { immediate: true }
);

/** 关闭请求：脏 tab 先确认（全站唯一模态），其余直接关 */
async function requestClose(key: string) {
  const tab = props.tabs.find((t) => t.key === key);
  if (!tab) {
    return;
  }
  if (!tab.dirty) {
    emit('close', key);
    return;
  }
  try {
    await modal.confirm(`「${tab.title}」有未保存的改动，确认放弃并关闭？`);
    emit('close', key);
  } catch {
    /* 用户取消，tab 保留 */
  }
}

/** 输入区/代码编辑器内的按键不抢（避免打断输入与 CodeMirror 自带快捷键） */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    target.isContentEditable ||
    !!target.closest('.cm-editor')
  );
}

function onKeydown(event: KeyboardEvent) {
  if (!event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) {
    return;
  }
  if (isTypingTarget(event.target)) {
    return;
  }
  if (event.key === 'PageDown') {
    event.preventDefault();
    step(1);
  } else if (event.key === 'PageUp') {
    event.preventDefault();
    step(-1);
  }
}

function step(delta: 1 | -1) {
  const len = props.tabs.length;
  if (len <= 1) {
    return;
  }
  const idx = props.tabs.findIndex((t) => t.key === props.activeKey);
  if (idx < 0) {
    return;
  }
  emit('update:activeKey', props.tabs[(idx + delta + len) % len].key);
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<style lang="scss" scoped>
.ws-panel {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: var(--el-bg-color, #fff);
}

.ws-panel__strip {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  /* 34px + 无上外边距：tab 条与顶部 header、AI 栏头、资源树头齐成一条线 */
  height: 34px;
  margin: 2px 4px;
  padding: 0 4px;
  border-radius: var(--app-radius-lg, 14px);
  background: var(--wb-tab-track-bg);
  backdrop-filter: blur(16px) saturate(1.6);
  -webkit-backdrop-filter: blur(16px) saturate(1.6);
}

.ws-panel__tabs {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  overflow-y: hidden;
  /* 无可见滚动条（VS Code/Trae 范式）：溢出靠 hover 滚轮横滚，不占视觉 */
  scrollbar-width: none;
  -ms-overflow-style: none;
  min-width: 0;
  padding: 3px 0;

  &::-webkit-scrollbar {
    display: none;
  }
}

.wb-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  height: 24px;
  padding: 0 6px 0 10px;
  max-width: 200px;
  border-radius: var(--app-radius-md, 10px);
  background: var(--wb-tab-bg);
  font-size: 12px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease;

  &:hover {
    background: var(--wb-tab-hover-bg);

    .wb-tab__close {
      opacity: 1;
    }
  }

  &.is-active {
    background: var(--wb-tab-card-bg);
    color: var(--el-text-color-primary, #1d2129);
    font-weight: 600;
    box-shadow: var(--wb-tab-card-shadow);
  }

  &__icon {
    font-size: 13px;
    flex-shrink: 0;
  }

  &__dirty {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--el-color-warning, #e6a23c);
  }

  &__title {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__close {
    font-size: 12px;
    padding: 2px;
    border-radius: 4px;
    opacity: 0;
    flex-shrink: 0;
    transition:
      opacity 0.15s ease,
      background-color 0.15s ease;

    &:hover {
      background: var(--el-fill-color, #e9e9eb);
    }
  }

  &.is-active .wb-tab__close {
    opacity: 0.6;
  }
}

.ws-panel__body {
  flex: 1;
  min-height: 0;
  position: relative;
}

.ws-panel__pane {
  position: absolute;
  inset: 0;
  min-width: 0;
}

/* 全部 tab 关掉后的引导空态 */
.ws-panel__empty {
  height: 100%;
  justify-content: center;

  &-title {
    margin: 0;
    font-size: 14px;
    color: var(--el-text-color-secondary);
  }

  &-hint {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--el-text-color-placeholder);
  }
}
</style>
