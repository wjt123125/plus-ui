<!--
  上下文操作气泡：选中文字浮层与资源 hover 浮层共用同一套外观与操作。
  ask 态只有两个图标钮（复制 / 加入会话）；点「加入会话」后由父级切到 comment 态补评论。
  资源 hover 时由父级传入 info（名称 + 编码），在操作区上方多渲染一块信息区；
  划字浮层不传 info，保持原来的纯图标气泡。

  只负责外观、定位与输入框行为（自动增高 / 聚焦 / Enter 提交 / Esc 交给父级），
  暂存区增删、选区角标、hover 延迟显隐都在父级 / useResourceHover 里，组件本身无业务状态。
-->
<template>
  <section
    ref="rootRef"
    class="ctx-bubble"
    :class="{ 'ctx-bubble--ask': mode === 'ask', 'has-info': !!info }"
    :style="position"
    :title="title"
    @pointerdown="emit('touch')"
    @mouseenter="emit('keep')"
    @mouseleave="emit('leave')"
  >
    <!-- 资源 hover 卡的信息区：名称 + #编码；划字浮层不传 info，这里整块不渲染 -->
    <div v-if="info" class="ctx-bubble__info">
      <div v-if="info.title" class="ctx-bubble__info-title">{{ info.title }}</div>
      <div v-if="info.code" class="ctx-bubble__info-code">
        <span class="ctx-bubble__hash" aria-hidden="true">#</span>
        <span class="ctx-bubble__info-value">{{ info.code }}</span>
      </div>
    </div>
    <!-- 信息与操作之间的分界：全宽细线读作 footer 边界，不让右对齐按钮悬空 -->
    <div v-if="info" class="ctx-bubble__divider" aria-hidden="true" />
    <div class="ctx-bubble__row">
      <template v-if="mode === 'ask'">
        <button type="button" class="ctx-act" :title="copyTitle" :aria-label="copyTitle" @click="emit('copy')">
          <SvgIcon :icon-class="copyIcon" />
        </button>
        <span class="ctx-ask__divider" aria-hidden="true" />
        <button type="button" class="ctx-act" :title="joinTitle" :aria-label="joinTitle" @click="emit('join')">
          <SvgIcon icon-class="lucide:sparkles" />
        </button>
      </template>
      <template v-else>
        <textarea
          ref="noteRef"
          :value="note"
          class="ctx-bubble__input"
          rows="1"
          :placeholder="placeholder"
          @input="onInput"
          @keydown="onKeydown"
          @focus="emit('note-focus')"
          @blur="onNoteBlur"
        />
        <button
          type="button"
          class="ctx-act ctx-act--danger"
          :class="{ 'is-idle-hidden': idleHidden }"
          title="撤销这条上下文"
          aria-label="撤销这条上下文"
          @click="emit('remove')"
        >
          <SvgIcon icon-class="lucide:trash-2" />
        </button>
        <button
          type="button"
          class="ctx-act ctx-act--primary"
          :class="{ 'is-idle': !note.trim() }"
          title="保存评论"
          aria-label="保存评论"
          @click="emit('commit')"
        >
          <SvgIcon icon-class="lucide:check" />
        </button>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { anchorRectOf, bubblePosition, type AnchorRect } from './contextBubble';

defineOptions({ name: 'ContextActionBubble' });

const props = withDefaults(
  defineProps<{
    /** ask=确认要不要加入；comment=已入区，补评论 */
    mode: 'ask' | 'comment';
    /** 选区场景直接给矩形；hover 场景优先用 anchorEl */
    anchorRect?: AnchorRect | null;
    /** 跟随滚动的锚点元素：传了就在滚动/窗口变化时重新测量 */
    anchorEl?: HTMLElement | null;
    note: string;
    /** 评论态删除键在用户动手前隐身（划字浮层用） */
    idleHidden?: boolean;
    placeholder?: string;
    copyIcon?: string;
    copyTitle?: string;
    joinTitle?: string;
    /** 根节点 title（角标改评论时用来源标题做提示） */
    title?: string;
    /** 资源 hover 卡的信息区：名称 + 编码；划字浮层不传，保持纯图标气泡 */
    info?: { title?: string; code?: string } | null;
    /** 切到评论态时是否自动聚焦输入框；hover 卡传 false，避免鼠标移开时因聚焦而无法关闭 */
    autoFocus?: boolean;
  }>(),
  {
    anchorRect: null,
    anchorEl: null,
    idleHidden: false,
    placeholder: '输入你的评论',
    copyIcon: 'lucide:copy',
    copyTitle: '复制',
    joinTitle: '加入会话',
    title: '',
    info: null,
    autoFocus: true
  }
);

const emit = defineEmits<{
  'update:note': [value: string];
  copy: [];
  join: [];
  remove: [];
  commit: [];
  esc: [];
  /** 鼠标进入气泡：父级取消收起计时 */
  keep: [];
  /** 鼠标离开气泡：父级重新计时 */
  leave: [];
  touch: [];
  /** 锚点元素已脱离文档，父级应关闭气泡 */
  close: [];
  /** 评论框获得焦点：hover 场景据此判断「正在输入，不随鼠标移开关闭」 */
  'note-focus': [];
  /** 评论框失焦：父级据此提交并关闭；relatedTarget 在卡片内部时视为点了卡内按钮 */
  'note-blur': [event: FocusEvent];
}>();

const rootRef = ref<HTMLElement>();
const noteRef = ref<HTMLTextAreaElement>();
/** 首帧先藏起来，等 onMounted 量到尺寸再显示，避免在左上角闪一下 */
const position = ref<Record<string, string>>({ visibility: 'hidden' });

/** 评论框最多长到 4 行左右，再多就内部滚动 */
const NOTE_MAX_HEIGHT = 88;

function growNote(): void {
  const el = noteRef.value;
  if (!el) {
    return;
  }
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, NOTE_MAX_HEIGHT)}px`;
}

function currentRect(): AnchorRect | null {
  if (props.anchorEl) {
    const rect = anchorRectOf(props.anchorEl);
    if (!rect) {
      emit('close');
      return null;
    }
    // 锚点被滚出视口后继续贴着没有意义，交给父级收起
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      emit('close');
      return null;
    }
    return rect;
  }
  return props.anchorRect;
}

function place(): void {
  const rect = currentRect();
  if (!rect || !rootRef.value) {
    return;
  }
  position.value = { ...bubblePosition(rootRef.value, rect), visibility: 'visible' };
}

let rafId = 0;
function schedulePlace(): void {
  if (rafId) {
    return;
  }
  rafId = window.requestAnimationFrame(() => {
    rafId = 0;
    place();
  });
}

/** 评论态初始高度、焦点与定位：切态后等 DOM 更新完再做 */
watch(
  () => props.mode,
  (mode) => {
    if (mode !== 'comment') {
      return;
    }
    void nextTick(() => {
      growNote();
      place();
      if (props.autoFocus) {
        noteRef.value?.focus();
      }
    });
  },
  { immediate: true }
);

watch(
  () => [props.anchorRect, props.anchorEl] as const,
  () => schedulePlace()
);

/** 输入框自身长高时重新贴回锚点，父级不用再管定位 */
let observer: ResizeObserver | null = null;

function onViewportChange(): void {
  schedulePlace();
}

onMounted(() => {
  place();
  observer = new ResizeObserver(() => place());
  if (rootRef.value) {
    observer.observe(rootRef.value);
  }
  if (props.anchorEl) {
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);
  }
});

onBeforeUnmount(() => {
  if (rafId) {
    window.cancelAnimationFrame(rafId);
  }
  observer?.disconnect();
  window.removeEventListener('scroll', onViewportChange, true);
  window.removeEventListener('resize', onViewportChange);
});

function onInput(event: Event): void {
  emit('update:note', (event.target as HTMLTextAreaElement).value);
  growNote();
}

/** 失焦落在卡片内部（对勾/垃圾桶）时视为仍在操作这张卡，不向外报离开 */
function onNoteBlur(event: FocusEvent): void {
  const next = event.relatedTarget as Element | null;
  if (next && rootRef.value?.contains(next)) {
    return;
  }
  emit('note-blur', event);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('esc');
    return;
  }
  if (event.key !== 'Enter' || event.isComposing) {
    return;
  }
  // Shift+Enter 保留：单行输入里没有换行，但不该吞掉用户的组合键
  if (event.shiftKey) {
    return;
  }
  event.preventDefault();
  emit('commit');
}

defineExpose({
  /** 供父级在需要时重新贴锚点（例如角标重算后） */
  place,
  focus: () => noteRef.value?.focus()
});
</script>

<style lang="scss" scoped>
.ctx-bubble {
  position: fixed;
  z-index: 3000;
  display: flex;
  /* 有信息区时上下两段；没有信息区时 row 就是唯一子元素，外观与原先的横向气泡一致 */
  flex-direction: column;
  gap: 4px;
  width: 260px;
  padding: 5px 5px 5px 12px;
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  background: var(--el-bg-color-overlay, #fff);
  box-shadow: var(--el-box-shadow-light, 0 6px 24px rgba(0, 0, 0, 0.12));
  pointer-events: auto;
}

/* 两种状态的布局差异只留在这一层，信息区与操作行由内部结构决定 */
.ctx-bubble--ask {
  width: auto;
  padding: 4px;
  gap: 0;
}

/* 资源 hover 卡：名称 + 编码在上，操作在下；宽度固定给两行标题留出截断空间 */
.ctx-bubble.has-info {
  width: 244px;
  gap: 6px;
  padding: 8px 8px 6px;
}

/* 信息区 */
.ctx-bubble__info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding: 0 2px;
}

/* 名称最多两行：长标题在卡里尽量看全，超出才截断 */
.ctx-bubble__info-title {
  display: -webkit-box;
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  line-height: 16px;
  color: var(--el-text-color-primary, #303133);
  word-break: break-word;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.ctx-bubble__info-code {
  display: flex;
  gap: 2px;
  align-items: baseline;
  min-width: 0;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.4;
  color: var(--el-text-color-regular, #606266);
}

/* # 只做「这是编码」的弱提示，比中文标签轻，也比纯 code 更易辨认 */
.ctx-bubble__hash {
  flex: none;
  color: var(--el-text-color-placeholder, #a8abb2);
}

.ctx-bubble__info-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 信息区与操作行的分界：左右各收 2px，与标题/编码文字对齐，不横贯整张卡 */
.ctx-bubble__divider {
  flex: none;
  height: 1px;
  margin: 0 2px;
  background: var(--el-border-color-lighter, #ebeef5);
}

/* 操作行：评论框长高时按钮跟着落在底部，不跟着文字往上飘 */
.ctx-bubble__row {
  display: flex;
  gap: 2px;
  align-items: flex-end;
  min-width: 0;
}

.ctx-bubble--ask .ctx-bubble__row {
  align-items: center;
}

/* 带信息区时操作行靠右，卡片读起来是「信息 → 操作」而不是一条工具条 */
.ctx-bubble.has-info .ctx-bubble__row {
  justify-content: flex-end;
}

/* 两个图标之间的灰色细分割线 */
.ctx-ask__divider {
  flex: none;
  width: 1px;
  height: 14px;
  background: var(--el-border-color, #dcdfe6);
}

.ctx-bubble__input {
  flex: 1;
  min-width: 0;
  min-height: 26px;
  max-height: 88px;
  padding: 4px 0;
  border: none;
  background: transparent;
  color: var(--el-text-color-primary, #303133);
  font-family: inherit;
  font-size: 12px;
  line-height: 18px;
  resize: none;
  outline: none;
  overflow-y: auto;

  &::placeholder {
    color: var(--db-ink-muted, #6e6e73);
  }
}

/* 后缀动作钮：纯图标，文案只走 title / aria-label */
.ctx-act {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;

  :deep(svg) {
    width: 15px;
    height: 15px;
  }
}

.ctx-act:hover {
  background: rgba(120, 120, 128, 0.12);
}

.ctx-act--danger {
  color: var(--el-color-danger, #f56c6c);

  &:hover {
    background: var(--el-color-danger-light-9, #fef0f0);
  }
}

/* 还没动手时不显形但占着位，露出来的时候对勾不会跳位置 */
.ctx-act.is-idle-hidden {
  opacity: 0;
  pointer-events: none;
}

.ctx-act--primary {
  background: var(--el-text-color-primary, #303133);
  color: #fff;

  &:hover {
    background: #1f1f1f;
  }
}

/* 评论为空时按钮只是变淡，仍可点：不带评论加入上下文是合法操作 */
.ctx-act--primary.is-idle {
  background: var(--el-fill-color, #f0f2f5);
  color: var(--el-text-color-disabled, #a8abb2);

  &:hover {
    background: var(--el-fill-color-dark, #e6e8eb);
  }
}
</style>
