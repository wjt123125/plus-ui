<!--
  工作面板 tab 右键菜单（纯浮层 UI，对标 ResourceTreeContextMenu 的房内范式）。
  mask 捕获外部点击 / Esc 关闭；ul 定位到指针处；本组件零业务：只声明五项 + 计算禁用态，
  选中即 emit('command', cmd) 交宿主，关闭族语义（谁该被关 / 脏确认）归 useWorkspaceTabs。
  禁用规则：仅一条 tab 时「关闭其他」禁用；锚点是首/末条时「关闭左侧 / 右侧」禁用。
-->
<template>
  <template v-if="visible">
    <div class="wb-tab-ctx-mask" @click="emit('close')" @contextmenu.prevent="emit('close')" />
    <ul class="wb-tab-ctx" :style="{ left: `${x}px`, top: `${y}px` }" @click.stop @contextmenu.prevent>
      <li class="wb-tab-ctx__item is-warning" @click="pick('close')">
        <SvgIcon icon-class="lucide:x" /><span>关闭</span>
      </li>
      <li class="wb-tab-ctx__item is-warning" @click="pick('close-others')">
        <SvgIcon icon-class="lucide:circle-x" /><span>关闭其他</span>
      </li>
      <li class="wb-tab-ctx__divider" />
      <li class="wb-tab-ctx__item is-warning" @click="pick('close-left')">
        <SvgIcon icon-class="lucide:chevron-left" /><span>关闭左侧</span>
      </li>
      <li class="wb-tab-ctx__item is-warning" @click="pick('close-right')">
        <SvgIcon icon-class="lucide:chevron-right" /><span>关闭右侧</span>
      </li>
      <li class="wb-tab-ctx__divider" />
      <li class="wb-tab-ctx__item is-danger" @click="pick('close-all')">
        <SvgIcon icon-class="lucide:trash" /><span>关闭全部</span>
      </li>
    </ul>
  </template>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';
import type { TabMenuCommand } from '../workbench.types';

defineOptions({ name: 'TabContextMenu' });

/** 菜单图标走 lucide 离线子集（幂等注入，详见 useLucideSubset） */
useLucideSubset();

const props = defineProps<{
  visible: boolean;
  x: number;
  y: number;
  /** 锚点 tab 在会话中的序号（0 基）与总数，仅用于禁用态判定 */
  index: number;
  total: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'command', cmd: TabMenuCommand): void;
}>();

/** 命中禁用语义的项直接不响应，避免宿主再做一次空操作 */
function pick(cmd: TabMenuCommand) {
  if (cmd === 'close-others' && props.total <= 1) return;
  if (cmd === 'close-left' && props.index <= 0) return;
  if (cmd === 'close-right' && props.index >= props.total - 1) return;
  emit('command', cmd);
  emit('close');
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.visible) {
    emit('close');
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
.wb-tab-ctx-mask {
  position: fixed;
  inset: 0;
  z-index: 1997;
}

.wb-tab-ctx {
  position: fixed;
  z-index: 1998;
  min-width: 148px;
  padding: 4px;
  margin: 0;
  list-style: none;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  box-shadow: 0 6px 24px rgb(0 0 0 / 14%);
}

.wb-tab-ctx__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  font-size: 13px;
  color: var(--el-text-color-primary);
  cursor: pointer;
  border-radius: 5px;

  &:hover {
    background-color: var(--el-fill-color-light);
  }
}

/* 图标语义色：只染图标，文字保持主色（.svg-icon 走 currentColor） */
.wb-tab-ctx__item.is-warning :deep(.svg-icon) {
  color: var(--el-color-warning);
}

.wb-tab-ctx__item.is-danger :deep(.svg-icon) {
  color: var(--el-color-danger);
}

.wb-tab-ctx__divider {
  height: 1px;
  margin: 4px 6px;
  background-color: var(--el-border-color-lighter);
}
</style>
