<template>
  <section class="chain-work-panel">
    <!--
      中栏工作面板（链路工作台，常驻不可折叠）：tab 条 + 画布 panes + 脏关闭确认 + 标签快捷键。
      与组件工作台 WorkPanel 同构；tab 只有一种形态——链路画布（kind='canvas'），
      pane 即 ChainCanvasPane 的 workbench 宿主（v-show 切换不销毁，切走草稿与画布布局保留）。
      关闭带脏圆点的 tab 弹确认（全站唯一模态）；Ctrl+PageDown/PageUp 循环切 tab。
    -->
    <div class="chain-work-panel__strip">
      <div class="chain-work-panel__tabs">
        <div
          v-for="tab in tabs"
          :key="tab.key"
          class="wb-tab"
          :class="{ 'is-active': tab.key === activeKey }"
          :title="tab.title"
          @click="emit('update:activeKey', tab.key)"
          @mousedown.middle.prevent="requestClose(tab.key)"
        >
          <span v-if="tab.dirty" class="wb-tab__dirty" aria-label="未保存" />
          <SvgIcon v-else class="wb-tab__icon" icon-class="lucide:spline" />
          <span class="wb-tab__title">{{ tab.title }}</span>
          <SvgIcon class="wb-tab__close" icon-class="lucide:x" @click.stop="requestClose(tab.key)" />
        </div>
      </div>
    </div>

    <div class="chain-work-panel__body">
      <el-empty v-if="!tabs.length" class="chain-work-panel__empty" :image-size="72">
        <template #description>
          <p class="chain-work-panel__empty-title">没有打开的画布</p>
          <p class="chain-work-panel__empty-hint">点右侧链路树的链路打开画布（同链单例，不重复开 tab）</p>
        </template>
      </el-empty>
      <div v-for="tab in tabs" :key="tab.key" v-show="tab.key === activeKey" class="chain-work-panel__pane">
        <ChainCanvasPane
          host="workbench"
          :load-chain-id="tab.chainId"
          :active="tab.key === activeKey"
          @dirty-change="(dirty) => emit('dirty-change', tab.chainId, dirty)"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import modal from '@/plugins/modal';
import { useLucideSubset } from '../../../workbench/composables/useLucideSubset';
import ChainCanvasPane from '../../../editor/ChainCanvasPane.vue';
import type { ChainTab } from '../workbench.types';

defineOptions({ name: 'ChainWorkPanel' });

useLucideSubset();

const props = defineProps<{
  tabs: ChainTab[];
  activeKey: string;
}>();

const emit = defineEmits<{
  (e: 'update:activeKey', key: string): void;
  (e: 'close', key: string): void;
  (e: 'dirty-change', chainId: ChainTab['chainId'], dirty: boolean): void;
}>();

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

/** 画布内（vue-flow/CodeMirror/输入框）的按键不抢 */
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
/* 与组件工作台 WorkPanel 同款三段式（strip / body / absolute pane），wb-tab 视觉完全一致 */
.chain-work-panel {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: var(--el-bg-color, #fff);
}

.chain-work-panel__strip {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 42px;
  margin: 8px 8px 4px;
  padding: 0 4px;
  border-radius: var(--app-radius-lg, 14px);
  background: var(--wb-tab-track-bg);
  backdrop-filter: blur(16px) saturate(1.6);
  -webkit-backdrop-filter: blur(16px) saturate(1.6);
}

.chain-work-panel__tabs {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  min-width: 0;
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

.chain-work-panel__body {
  flex: 1;
  min-height: 0;
  position: relative;
}

.chain-work-panel__pane {
  position: absolute;
  inset: 0;
  min-width: 0;
}

/* 全部 tab 关掉后的引导空态 */
.chain-work-panel__empty {
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
