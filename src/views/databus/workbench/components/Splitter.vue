<!--
  分栏竖向拖拽条（databus 工作台共享件）。
  target="prev"（默认）调整自己左邻栏宽（右拖变宽）；
  target="next" 调整右邻栏宽（右栏在分隔条右侧时用，右拖变窄）。

  性能契约（拖拽期间不经过 Vue 渲染）：
    1. pointerdown 用 setPointerCapture 接住整段拖拽，不再往 window 挂监听；
    2. pointermove 只记录目标宽度，requestAnimationFrame 每帧最多落一次；
    3. 预览直接改相邻栏的 inline width，父组件零重渲染；pointerup 才 emit 一次提交；
    4. 拖拽期间给布局容器加 is-resizing，暂停栏位 transition / hover 命中。

  浮岛布局下分隔条默认完全隐形（栏间只有 8px 留白），hover / 拖拽时才亮一条针形示意线（--db-mint）；
  双击回到 resetWidth，聚焦后 ←/→ 可微调（Shift 加速），拖拽时浮出当前宽度。
-->
<template>
  <div
    ref="rootEl"
    class="wb-splitter"
    :class="{ 'is-active': dragging, 'is-disabled': disabled }"
    role="separator"
    aria-orientation="vertical"
    aria-label="拖拽调整宽度，双击复位，方向键微调"
    :aria-valuenow="dragging ? liveWidth : modelValue"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-disabled="disabled"
    :tabindex="disabled ? -1 : 0"
    @pointerdown="startDrag"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @lostpointercapture="onPointerUp"
    @dblclick="handleReset"
    @keydown="onKeydown"
  >
    <span class="wb-splitter__hit" />
    <svg class="wb-splitter__needle" viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true">
      <path d="M5 0C5.6 22 10 42 10 50C10 58 5.6 78 5 100C4.4 78 0 58 0 50C0 42 4.4 22 5 0Z" />
    </svg>
    <span v-if="dragging" class="wb-splitter__tip db-num">{{ liveWidth }}px</span>
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
}>();

const rootEl = ref<HTMLElement | null>(null);
const dragging = ref(false);
/** 拖拽中的实时宽度（只驱动 tip 与 aria，不参与父组件渲染） */
const liveWidth = ref(props.modelValue);

let paneEl: HTMLElement | null = null;
let rafId = 0;
let startX = 0;
let startWidth = 0;
/** 本帧目标宽度 */
let pendingWidth = 0;
/** 已落到 DOM 上的宽度 */
let appliedWidth = 0;

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

/** 被调整的栏就是分隔条的前/后一个元素兄弟（拖拽期间直接写它的 inline width）。
    目标栏被折叠时紧邻的会是另一根零宽分隔条，此时不做 DOM 预览，退回逐帧 emit */
function resolvePane(): HTMLElement | null {
  const host = rootEl.value;
  if (!host) return null;
  const el = props.target === 'prev' ? host.previousElementSibling : host.nextElementSibling;
  if (!(el instanceof HTMLElement) || el.classList.contains('wb-splitter')) {
    return null;
  }
  return el;
}

/** 把本帧目标宽度落到 DOM：有相邻栏就直写样式，否则退化为每帧 emit */
function applyPreview() {
  rafId = 0;
  if (pendingWidth === appliedWidth) {
    return;
  }
  appliedWidth = pendingWidth;
  liveWidth.value = pendingWidth;
  if (paneEl) {
    paneEl.style.width = `${pendingWidth}px`;
  } else {
    emit('update:modelValue', pendingWidth);
  }
}

function startDrag(event: PointerEvent) {
  if (props.disabled || (event.pointerType === 'mouse' && event.button !== 0)) {
    return;
  }
  event.preventDefault();
  startX = event.clientX;
  startWidth = props.modelValue;
  pendingWidth = startWidth;
  appliedWidth = startWidth;
  liveWidth.value = startWidth;
  paneEl = resolvePane();
  dragging.value = true;
  // 指针捕获：拖出分隔条/窗口也继续收事件，pointerup 自动释放
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  rootEl.value?.parentElement?.classList.add('is-resizing');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) {
    return;
  }
  const dx = event.clientX - startX;
  pendingWidth = clamp(startWidth + (props.target === 'prev' ? dx : -dx));
  if (!rafId) {
    rafId = requestAnimationFrame(applyPreview);
  }
}

function onPointerUp(event: PointerEvent) {
  if (!dragging.value) {
    return;
  }
  const host = event.currentTarget as HTMLElement;
  if (host.hasPointerCapture?.(event.pointerId)) {
    host.releasePointerCapture(event.pointerId);
  }
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  // 同步落最后一帧样式，再提交一次响应式值（整段拖拽只触发一次父组件更新）
  if (pendingWidth !== appliedWidth) {
    appliedWidth = pendingWidth;
    liveWidth.value = pendingWidth;
    if (paneEl) {
      paneEl.style.width = `${pendingWidth}px`;
    }
  }
  dragging.value = false;
  emit('update:modelValue', pendingWidth);
  paneEl = null;
  rootEl.value?.parentElement?.classList.remove('is-resizing');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
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
  /* 拖拽期间热区要压住相邻栏（相邻栏 pointer-events: none） */
  touch-action: none;

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