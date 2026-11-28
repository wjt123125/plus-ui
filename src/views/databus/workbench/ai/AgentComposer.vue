<!--
  会话输入框（contenteditable）：上下文卡作为行内 token 与正文同处一条文本流，
  卡片可以和文字挨着排在同一行，而不是各占一行；卡片本体不可编辑，点 × 删除、点本体打开详情。

  DOM 由本组件命令式维护：文字是 chip 之外的文本节点，卡片是 contenteditable=false 的
  span。这样打字只改文本、不触发卡片重排，光标不会被 Vue 的补丁打乱。
-->
<template>
  <div class="composer" @click="focusEditor">
    <div
      ref="editorRef"
      class="composer__editor"
      contenteditable="plaintext-only"
      role="textbox"
      aria-multiline="true"
      @input="onInput"
      @keydown="onKeydown"
      @paste="onPaste"
      @click="onChipClick"
    />
    <span v-if="empty" class="composer__placeholder">{{ placeholder }}</span>
  </div>
</template>

<script lang="ts">
/** 一张行内卡片：key 全局唯一，用来和 contexts 的增删对齐 */
export interface ComposerChip {
  key: string;
  label: string;
  /** 用户评论：单独占一段，保证长标题也不会把它完全挤掉 */
  note?: string;
}
</script>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

defineOptions({ name: 'AgentComposer' });

const props = withDefaults(
  defineProps<{
    /** 正文，不含卡片文字；卡片内容靠 chips 单独传递 */
    text: string;
    chips: ComposerChip[];
    placeholder?: string;
  }>(),
  { placeholder: '' }
);

const emit = defineEmits<{
  'update:text': [text: string];
  send: [];
  'chip-open': [payload: { key: string; anchor: HTMLElement }];
  'chip-remove': [key: string];
}>();

const editorRef = ref<HTMLElement>();

/** 空态看正文和卡片两边：只有卡片也算「有内容」，不再显示占位提示 */
const empty = computed(() => !props.text && !props.chips.length);

/** 只统计 chip 之外的文字，卡片标签不算用户输入 */
function textOfNode(root: Node): string {
  let out = '';
  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? '';
      return;
    }
    if (node instanceof HTMLElement && node.dataset.chip) {
      return;
    }
    out += textOfNode(node);
  });
  return out;
}

function readText(): string {
  const el = editorRef.value;
  return el ? textOfNode(el) : '';
}

function emitText() {
  emit('update:text', readText());
}

/** 卡片在 DOM 里靠 dataset.chip 认领；头部叉号是唯一可点的删除位 */
function createChip(chip: ComposerChip): HTMLElement {
  const el = document.createElement('span');
  el.className = 'composer__chip';
  el.dataset.chip = chip.key;
  el.contentEditable = 'false';

  const head = document.createElement('span');
  head.className = 'composer__chip-head';
  head.dataset.act = 'remove';
  head.setAttribute('role', 'button');
  head.setAttribute('aria-label', '移除');
  // 和全局 SvgIcon 同一套线条图标，避免用文本 × 导致大小/位置飘
  head.innerHTML =
    '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" ' +
    'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

  const label = document.createElement('span');
  label.className = 'composer__chip-label';
  label.textContent = chip.label;

  // 评论单独一段：有评论时固定留出一截，长标题只会挤自己，不会把评论整段吃掉
  const note = document.createElement('span');
  note.className = 'composer__chip-note';
  note.textContent = chip.note ? `· ${chip.note}` : '';

  el.append(head, label, note);
  return el;
}

/** 按 chips 增删卡片 DOM：焦点在输入框时插在光标处，否则追加到正文末尾且不动光标 */
function syncChips() {
  const el = editorRef.value;
  if (!el) {
    return;
  }
  // 一趟同时收掉「已删除」与「文案变化」：卡片 key 不变，评论、标题去重序号只改 label/note
  const byKey = new Map(props.chips.map((chip) => [chip.key, chip]));
  const have = new Set<string>();
  el.querySelectorAll<HTMLElement>('[data-chip]').forEach((node) => {
    const key = node.dataset.chip ?? '';
    const chip = byKey.get(key);
    if (!chip) {
      node.remove();
      return;
    }
    have.add(key);
    const label = node.querySelector<HTMLElement>('.composer__chip-label');
    if (label && label.textContent !== chip.label) {
      label.textContent = chip.label;
    }
    const note = node.querySelector<HTMLElement>('.composer__chip-note');
    const noteText = chip.note ? `· ${chip.note}` : '';
    if (note && note.textContent !== noteText) {
      note.textContent = noteText;
    }
  });

  const missing = props.chips.filter((chip) => !have.has(chip.key));
  if (!missing.length) {
    return;
  }

  const selection = window.getSelection();
  const focused = document.activeElement === el && selection?.rangeCount === 1;
  const range = focused ? selection!.getRangeAt(0).cloneRange() : null;
  for (const chip of missing) {
    const node = createChip(chip);
    if (range) {
      range.insertNode(node);
      range.setStartAfter(node);
    } else {
      // 未聚焦（划字「加入会话」、资源树/画布/市场添加等）一律追加到正文末尾：
      // 插入顺序要和用户认知一致，不能挤到开头把已写的字顶到后面
      el.appendChild(node);
    }
  }
  if (range) {
    selection!.removeAllRanges();
    selection!.addRange(range);
  } else {
    // 内容超过可视高度时，末尾的卡片默认在视口外，滚到底才能让用户看见刚加的卡
    el.scrollTop = el.scrollHeight;
  }
}

/** 外部替换正文（发送后清空、建议直发）：只换文字，卡片交给 chips 同步 */
function applyText(value: string) {
  const el = editorRef.value;
  if (!el) {
    return;
  }
  // querySelectorAll 只认元素，文本节点要自己清，否则旧草稿会留在卡片后面
  Array.from(el.childNodes).forEach((node) => {
    if (!(node instanceof HTMLElement && node.dataset.chip)) {
      node.remove();
    }
  });
  if (value) {
    el.appendChild(document.createTextNode(value));
  }
}

/** 增删与文案变化都只由 chips 驱动，同一个 watcher 覆盖：新增补插、删除摘除、改写 label/note */
watch(
  () => props.chips.map((chip) => `${chip.key}\u0000${chip.label}\u0000${chip.note ?? ''}`).join('\u0001'),
  () => syncChips()
);

watch(
  () => props.text,
  (value) => {
    if (editorRef.value && readText() !== value) {
      applyText(value ?? '');
      syncChips();
    }
  }
);

onMounted(() => {
  applyText(props.text ?? '');
  syncChips();
});

function onInput() {
  emitText();
}

/** 光标前若没有正文，退格就当作删最后一张卡，避免浏览器直接把卡片 DOM 拿掉 */
function onBackspace(): boolean {
  const el = editorRef.value;
  const selection = window.getSelection();
  if (!el || !props.chips.length || !selection?.rangeCount) {
    return false;
  }
  const range = selection.getRangeAt(0);
  if (!range.collapsed || !el.contains(range.startContainer)) {
    return false;
  }
  const before = range.cloneRange();
  before.selectNodeContents(el);
  before.setEnd(range.endContainer, range.endOffset);
  if (textOfNode(before.cloneContents()).trim()) {
    return false;
  }
  emit('chip-remove', props.chips[props.chips.length - 1].key);
  return true;
}

function insertNewline() {
  document.execCommand('insertText', false, '\n');
  emitText();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Backspace' && onBackspace()) {
    event.preventDefault();
    return;
  }
  if (event.key !== 'Enter' || event.isComposing) {
    return;
  }
  event.preventDefault();
  if (event.shiftKey || event.altKey) {
    insertNewline();
    return;
  }
  emit('send');
}

function onPaste(event: ClipboardEvent) {
  event.preventDefault();
  const text = event.clipboardData?.getData('text/plain') ?? '';
  if (text) {
    document.execCommand('insertText', false, text);
    emitText();
  }
}

function onChipClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const chip = target?.closest<HTMLElement>('[data-chip]');
  if (!chip) {
    return;
  }
  event.preventDefault();
  const key = chip.dataset.chip ?? '';
  if (target?.closest('[data-act="remove"]')) {
    emit('chip-remove', key);
    return;
  }
  emit('chip-open', { key, anchor: chip });
}

function focusEditor() {
  editorRef.value?.focus();
}

defineExpose({ focus: focusEditor });
</script>

<style scoped lang="scss">
.composer {
  position: relative;
  /* 撑满输入卡：工具行贴底，编辑区吃掉剩余高度，卡片静止高度才由外层决定 */
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 46px;
}

/* 两行起、八行封顶，超出内部滚动；white-space 保留手动换行 */
.composer__editor {
  flex: 1 1 auto;
  max-height: 186px;
  overflow-y: auto;
  outline: none;
  color: var(--db-ink-secondary, #3a3a3c);
  font-size: 13px;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}

.composer__placeholder {
  position: absolute;
  top: 0;
  left: 0;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 13px;
  line-height: 1.75;
  white-space: pre-wrap;
  pointer-events: none;
}

/* 卡片 DOM 是命令式创建的，拿不到 scoped 的 data-v 属性，
   所以卡片相关规则必须走 :deep()，否则全部不生效（内联 SVG 会回落到 300×150） */
.composer :deep(.composer__chip) {
  display: inline-flex;
  align-items: center;
  max-width: 160px;
  height: 22px;
  margin-right: 4px;
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 6px;
  /* 略灰的底色：比输入框的灰再深一档，聚焦变白后也能看出是一张卡 */
  background: var(--el-bg-color, #fff);
  vertical-align: middle;
  user-select: none;
}

/* 头部：和标签之间有一条分隔线，静止时就能看出「头 / 身体」两段 */
.composer :deep(.composer__chip-head) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 20px;
  height: 100%;
  border-right: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 5px 0 0 5px;
  color: var(--db-ink-muted, #6e6e73);
  cursor: pointer;
  transition:
    background-color 0.15s,
    color 0.15s;
}

.composer :deep(.composer__chip-head svg) {
  width: 11px;
  height: 11px;
}

/* 叉号位是卡片的「头」：悬停整块加深，和标签正文拉开层次 */
.composer :deep(.composer__chip:hover .composer__chip-head) {
  background: rgba(120, 120, 128, 0.22);
  color: var(--db-ink, #1c1c1e);
}

.composer :deep(.composer__chip-label) {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0 2px 0 4px;
  overflow: hidden;
  color: var(--db-ink-secondary, #3a3a3c);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 评论不参与收缩（上限 64px）：标题再长也只会压自己，评论始终露出开头 */
.composer :deep(.composer__chip-note) {
  flex: 0 0 auto;
  max-width: 64px;
  padding-right: 6px;
  overflow: hidden;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.composer :deep(.composer__chip-note:empty) {
  display: none;
}
</style>
