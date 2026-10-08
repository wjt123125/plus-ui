<template>
  <section class="work-panel">
    <!--
  中栏工作面板（组件台账，主内容区，常驻不可折叠）：tab 条 + 面板内容 + 脏关闭确认 + 标签快捷键。
  tab 由宿主传入，「组件库」（kind='grid'，卡片网格经 #grid 插槽注入）与其它 tab 一样可关闭；
  宿主在点组件树目录节点时重新打开它。
  tab 状态缓存在这里（v-show 切换不销毁），切走草稿保留；关闭带脏圆点的 tab 弹确认，
  这是全站唯一模态。Ctrl+PageDown/PageUp 循环切 tab（焦点在输入区/编辑器内不抢键）。
-->
    <div class="work-panel__strip">
      <div class="work-panel__tabs">
        <div
          v-for="tab in tabs"
          :key="tab.key"
          class="wb-tab"
          :class="{ 'is-active': tab.key === activeKey }"
          :title="tabTitle(tab)"
          @click="emit('update:activeKey', tab.key)"
          @mousedown.middle.prevent="requestClose(tab.key)"
        >
          <span v-if="tab.dirty" class="wb-tab__dirty" aria-label="未保存" />
          <SvgIcon v-else class="wb-tab__icon" :icon-class="tabIcon(tab.kind)" />
          <span class="wb-tab__title">{{ tab.title }}</span>
          <SvgIcon class="wb-tab__close" icon-class="lucide:x" @click.stop="requestClose(tab.key)" />
        </div>
      </div>
    </div>

    <div class="work-panel__body">
      <el-empty v-if="!tabs.length" class="work-panel__empty" :image-size="72">
        <template #description>
          <p class="work-panel__empty-title">没有打开的面板</p>
          <p class="work-panel__empty-hint">点右侧组件树的目录节点打开组件库，点叶节点打开组件详情</p>
        </template>
      </el-empty>
      <template v-for="tab in tabs" :key="tab.key">
        <div v-show="tab.key === activeKey" class="work-panel__pane">
          <slot v-if="tab.kind === 'grid'" name="grid" />
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
          <el-empty v-else description="组件已不在台账中" :image-size="80" />
        </div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import modal from '@/plugins/modal';
import type { ScriptSaveResult } from '@/api/databus/component/types';
import { useLucideSubset } from '../../../workbench/composables/useLucideSubset';
import type { ComponentRegistryRow } from '../../model/registry';
import type { ComponentSaved, ComponentTab, ComponentTabKind } from '../workbench.types';
import DetailPane from './DetailPane.vue';
import FormPane from './FormPane.vue';
import ChangesPane from './ChangesPane.vue';

defineOptions({ name: 'ComponentWorkPanel' });

/** tab 图标一律走 lucide（离线注入，不用 @element-plus/icons-vue，见重构文档 §3/§4.1） */
const TAB_ICON: Record<ComponentTabKind, string> = {
  grid: 'lucide:layout-grid',
  detail: 'lucide:file-text',
  form: 'lucide:file-pen',
  changes: 'lucide:file-diff'
};

useLucideSubset();

const props = defineProps<{
  tabs: ComponentTab[];
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
  (e: 'dirty-change', key: string, dirty: boolean): void;
  (e: 'saved', tab: ComponentTab, payload: ComponentSaved): void;
  (e: 'rolled', tab: ComponentTab, result: ScriptSaveResult): void;
  (e: 'open-changes', tab: ComponentTab): void;
  (e: 'edit', row: ComponentRegistryRow): void;
  (e: 'delete', row: ComponentRegistryRow): void;
  (e: 'changes', row: ComponentRegistryRow): void;
}>();

function rowOf(tab: ComponentTab): ComponentRegistryRow | undefined {
  return props.rows.find((r) => r.code === tab.code);
}

/** 代码变更 tab 的当前版本：台账行最新值优先（编辑保存/回滚后随刷新变化） */
function currentVersionOf(tab: ComponentTab): number | null {
  return rowOf(tab)?.db?.version ?? tab.version ?? null;
}

function tabTitle(tab: ComponentTab): string {
  if (tab.kind === 'changes') {
    return `代码变更 · ${tab.code}`;
  }
  return tab.code ? `${tab.title}（${tab.code}）` : tab.title;
}

function tabIcon(kind: ComponentTabKind): string {
  return TAB_ICON[kind];
}

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
.work-panel {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: var(--el-bg-color, #fff);
}

.work-panel__strip {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 42px;
  margin: 8px 8px 4px;
  padding: 0 4px;
  border-radius: var(--app-radius-lg, 14px);
  /* Safari 轨道：浅灰半透明 + 磨砂（工作台专属 token，暗色主题自动适配） */
  background: var(--wb-tab-track-bg);
  backdrop-filter: blur(16px) saturate(1.6);
  -webkit-backdrop-filter: blur(16px) saturate(1.6);
}

.work-panel__tabs {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  min-width: 0;
  /* 滚动容器会按 overflow 裁剪投影，用上下内边距把激活卡片的投影留在裁剪盒内 */
  padding: 5px 0 7px;
}

.wb-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  height: 28px;
  padding: 0 6px 0 10px;
  max-width: 200px;
  border-radius: var(--app-radius-md, 10px);
  /* Safari：未激活是比轨道深一档的凹陷胶囊，与轨道拉开层次 */
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

  /* Safari：hover 时胶囊再加深一档 */
  &:hover {
    background: var(--wb-tab-hover-bg);

    .wb-tab__close {
      opacity: 1;
    }
  }

  /* Safari：激活是凸起悬浮卡片 + 柔影（亮色纯白、暗色深灰，均亮于轨道） */
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

.work-panel__body {
  flex: 1;
  min-height: 0;
  position: relative;
}

.work-panel__pane {
  position: absolute;
  inset: 0;
  min-width: 0;
}

/* 全部 tab 关掉后的引导空态 */
.work-panel__empty {
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
