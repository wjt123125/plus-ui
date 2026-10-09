<!--
  分栏竖向拖拽条（databus 工作台共享件）。
  target="prev"（默认）调整自己左邻栏宽（右拖变宽）；
  target="next" 调整右邻栏宽（右栏在分隔条右侧时用，右拖变窄）。
-->
<template>
  <div
    class="wb-splitter"
    :class="{ 'is-active': dragging }"
    title="拖拽调整宽度"
    @pointerdown="startDrag"
  >
    <span class="wb-splitter__hit" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: number;
    /** 下界（不传=不设下限，自由拖拽；仅兜底 0 防负宽度） */
    min?: number;
    /** 上界（不传=不设上限，可拖到任意宽） */
    max?: number;
    /** 被调整宽度的栏在分隔条的哪一侧 */
    target?: 'prev' | 'next';
  }>(),
  { target: 'prev' }
);

const emit = defineEmits<{
  (e: 'update:modelValue', width: number): void;
  (e: 'update:dragging', dragging: boolean): void;
}>();

const dragging = ref(false);

function clamp(width: number): number {
  // 默认不设上下限，自由拖拽；仅兜底 0（宽度不能为负）
  let next = Math.max(0, width);
  if (props.min != null) {
    next = Math.max(props.min, next);
  }
  if (props.max != null) {
    next = Math.min(props.max, next);
  }
  return next;
}

function startDrag(event: PointerEvent) {
  event.preventDefault();
  dragging.value = true;
  emit('update:dragging', true);
  const startX = event.clientX;
  const startWidth = props.modelValue;

  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - startX;
    emit('update:modelValue', clamp(startWidth + (props.target === 'prev' ? dx : -dx)));
  };
  const onUp = () => {
    dragging.value = false;
    emit('update:dragging', false);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}
</script>

<style lang="scss" scoped>
.wb-splitter {
  position: relative;
  width: 5px;
  flex-shrink: 0;
  align-self: stretch;
  cursor: col-resize;
  z-index: 3;

  &__hit {
    position: absolute;
    inset: 0 -4px;
  }

  &::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 2px;
    width: 1px;
    background: var(--el-border-color-lighter, #ebeef5);
    transition: background-color 0.15s ease, width 0.15s ease;
  }

  &:hover::before,
  &.is-active::before {
    left: 1px;
    width: 3px;
    background: var(--el-color-primary);
  }
}
</style>
