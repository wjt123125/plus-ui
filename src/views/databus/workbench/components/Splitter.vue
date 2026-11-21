<!--
  分栏竖向拖拽条（databus 工作台共享件）。
  target="prev"（默认）调整自己左邻栏宽（右拖变宽）；
  target="next" 调整右邻栏宽（右栏在分隔条右侧时用，右拖变窄）。

  浮岛布局下分隔条默认完全隐形（栏间只有 8px 留白），hover / 拖拽时才亮一条针形示意线（--db-mint）；
  双击回到 resetWidth，聚焦后 ←/→ 可微调（Shift 加速），拖拽时浮出当前宽度。
-->
<template>
  <div
    class="wb-splitter"
    :class="{ 'is-active': dragging, 'is-disabled': disabled }"
    role="separator"
    aria-orientation="vertical"
    aria-label="拖拽调整宽度，双击复位，方向键微调"
    :aria-valuenow="modelValue"
    :aria-disabled="disabled"
    :tabindex="disabled ? -1 : 0"
    @pointerdown="startDrag"
    @dblclick="handleReset"
    @keydown="onKeydown"
  >
    <span class="wb-splitter__hit" />
    <svg class="wb-splitter__needle" viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true">
      <path d="M5 0C5.6 22 10 42 10 50C10 58 5.6 78 5 100C4.4 78 0 58 0 50C0 42 4.4 22 5 0Z" />
    </svg>
    <span v-if="dragging" class="wb-splitter__tip db-num">{{ modelValue }}px</span>
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
    /** 双击复位到的宽度（不传=不复位） */
    resetWidth?: number;
    /** 相邻栏已收起：宽度归零并禁用交互，避免拖动一个看不见的栏 */
    disabled?: boolean;
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

/** 方向键微调：普通 16px，Shift 加速到 64px；方向按 target 语义换算 */
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
    return;
  }
  event.preventDefault();
  const step = event.shiftKey ? 64 : 16;
  const towardRight = event.key === 'ArrowRight';
  const delta = (props.target === 'prev' ? 1 : -1) * (towardRight ? step : -step);
  emit('update:modelValue', clamp(props.modelValue + delta));
}

function handleReset() {
  if (props.resetWidth != null) {
    emit('update:modelValue', clamp(props.resetWidth));
  }
}

function startDrag(event: PointerEvent) {
  if (props.disabled) {
    return;
  }
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
  /* 零宽 + 负外边距：把自身从布局宽度里抹掉，只借用父级 flex gap 的 8px 作为热区，
     因此旁边栏收起 / 展开都不会多出一段空白 */
  width: 0;
  margin: 0 -4px;
  flex-shrink: 0;
  align-self: stretch;
  cursor: col-resize;
  z-index: 3;
  outline-offset: -3px;

  &__hit {
    position: absolute;
    inset: 0 -12px;
  }

  /* 相邻栏收起：完全不占位，也不响应拖拽 */
  &.is-disabled {
    pointer-events: none;
  }

  /* 默认隐形：浮岛之间只有留白；hover / 拖拽 / 聚焦才亮一条"针形"示意线。
     针形用内联 SVG 画：中间最宽、两端收成尖，实色填充、边缘锐利（不用遮罩渐隐，避免发虚） */
  &__needle {
    position: absolute;
    top: 8px;
    /* 显式给高度：SVG 是替换元素，只写 top/bottom 会按 viewBox 比例算成 20px */
    height: calc(100% - 16px);
    left: 50%;
    width: 2px;
    fill: var(--db-mint);
    opacity: 0;
    transform: translateX(-50%);
    pointer-events: none;
    transition: opacity var(--db-dur-fast) var(--db-ease);
  }

  &:hover &__needle,
  &:focus-visible &__needle {
    opacity: 0.55;
  }

  &.is-active &__needle {
    opacity: 1;
  }

  /* 拖拽宽度浮标：贴在分隔条上方，等宽数字不抖 */
  &__tip {
    position: absolute;
    top: 12px;
    left: 50%;
    z-index: 4;
    padding: 3px 8px;
    border-radius: var(--db-r-pill);
    background: var(--db-ink);
    color: var(--db-bg-solid);
    font-size: var(--db-fs-xs);
    line-height: 1.4;
    white-space: nowrap;
    transform: translateX(-50%);
    pointer-events: none;
  }
}
</style>
