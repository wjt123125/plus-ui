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
          <MarketPane
            v-else-if="tab.kind === 'market'"
            @open-local="
              (id: string | number, type: 'COMPONENT' | 'CHAIN', title: string) =>
                emit('market-open', id, type, title)
            "
            @installed="emit('market-installed')"
            @toggle-local="(id: string | number, enabled: boolean) => emit('market-toggle', id, enabled)"
            @open-detail="(it: DatabusMarketItemVo) => emit('market-open-detail', it.id, it.name)"
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
          />
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
import type { ComponentSaved, TabMenuCommand, WorkspaceTab, WorkspaceTabKind } from '../workbench.types';
import DetailPane from './DetailPane.vue';
import FormPane from './FormPane.vue';
import ChangesPane from './ChangesPane.vue';
import TabContextMenu from './TabContextMenu.vue';
import MarketPane from '../market/MarketPane.vue';
import MarketItemPane from '../market/MarketItemPane.vue';

defineOptions({ name: 'WorkspaceWorkPanel' });

/** tab 图标一律走 lucide（离线注入，不用 @element-plus/icons-vue） */
const TAB_ICON: Record<WorkspaceTabKind, string> = {
  canvas: 'lucide:spline',
  detail: 'lucide:file-text',
  form: 'lucide:file-pen',
  changes: 'lucide:file-diff',
  market: 'lucide:store',
  'market-detail': 'lucide:package'
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
  (e: 'market-open-market'): void;
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
const tabMenu = reactive({ visible: false, x: 0, y: 0, key: '', index: 0 });

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
