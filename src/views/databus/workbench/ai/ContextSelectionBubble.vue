<!--
  全局选区浮层（§22.2）：划字 → 先弹「加入会话？」确认气泡，此时不动暂存区、
  不清原生选区、不抢焦点，右键复制 / Ctrl+C 照常可用；点确认后才入暂存区并展开评论框，
  同时在选区右上角留一个角标，点角标可改评论 / 移除。

  挂在工作台根而不是聊天面板里：面板收起时也要能划字攒上下文；
  pointer-events 只放在气泡与角标上，否则整页点击会被透明层吃掉。
-->
<template>
  <div class="ctx-layer">
    <!-- 选区气泡两态：ask=只问要不要加入，comment=已入区，补评论 -->
    <section
      v-if="mode === 'ask' || mode === 'comment'"
      ref="bubbleRef"
      class="ctx-bubble"
      :class="{ 'ctx-bubble--ask': mode === 'ask' }"
      :style="bubbleStyle"
      @pointerdown="bubbleTouched = true"
    >
      <template v-if="mode === 'ask'">
        <button type="button" class="ctx-act" title="复制选中内容" aria-label="复制选中内容" @click="copySelection">
          <SvgIcon icon-class="lucide:copy" />
        </button>
        <span class="ctx-ask__divider" aria-hidden="true" />
        <button type="button" class="ctx-act" title="加入会话" aria-label="加入会话" @click="beginComment">
          <SvgIcon icon-class="lucide:sparkles" />
        </button>
      </template>
      <template v-else>
        <textarea
          ref="noteRef"
          v-model="note"
          class="ctx-bubble__input"
          rows="1"
          placeholder="输入你的评论"
          @input="onNoteInput"
          @keydown="onNewKeydown"
        />
        <button
          type="button"
          class="ctx-act ctx-act--danger"
          :class="{ 'is-idle-hidden': !bubbleTouched }"
          title="撤销这条上下文"
          aria-label="撤销这条上下文"
          @click="discardSelection"
        >
          <SvgIcon icon-class="lucide:trash-2" />
        </button>
        <button
          type="button"
          class="ctx-act ctx-act--primary"
          :class="{ 'is-idle': !note.trim() }"
          title="保存评论"
          aria-label="保存评论"
          @click="commitNote"
        >
          <SvgIcon icon-class="lucide:check" />
        </button>
      </template>
    </section>

    <!-- 来源角标：数字与暂存卡序号一一对应，位置来自 Range，Range 断开后 rect 为空即不渲染 -->
    <button
      v-for="badge in visibleBadges"
      :key="badge.itemId"
      type="button"
      class="ctx-badge"
      :style="badgeStyle(badge)"
      :title="badgeTitle(badge)"
      @click.stop="openBadgePanel(badge)"
    >
      {{ badge.order }}
    </button>

    <!-- 点角标后的改评论 / 移除浮层：与新选区气泡同一形态，标题走 hover 提示 -->
    <section
      v-if="mode === 'badge' && activeBadge"
      ref="panelRef"
      class="ctx-bubble ctx-bubble--badge"
      :style="panelStyle"
      :title="activeBadge.title"
    >
      <textarea
        ref="badgeNoteRef"
        v-model="badgeNote"
        class="ctx-bubble__input"
        rows="1"
        placeholder="输入你的评论"
        @input="onBadgeInput"
        @keydown="onBadgeKeydown"
      />
      <button type="button" class="ctx-act ctx-act--danger" title="移除这条上下文" aria-label="移除这条上下文" @click="removeActiveBadge">
        <SvgIcon icon-class="lucide:trash-2" />
      </button>
      <button
        type="button"
        class="ctx-act ctx-act--primary"
        :class="{ 'is-idle': !badgeNote.trim() }"
        title="保存评论"
        aria-label="保存评论"
        @click="saveBadgeNote"
      >
        <SvgIcon icon-class="lucide:check" />
      </button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { ElMessage } from 'element-plus';
import { contextMeta, type AgentContextItem } from './contextTypes';
import { useAgentContext, nextContextId, type ContextBadge } from './useAgentContext';

const { badges, contexts, addContext, addBadge, removeContext, updateNote, refreshBadges } = useAgentContext();

defineOptions({ name: 'ContextSelectionBubble' });

/** 原文全文上限：超过就截断并打 truncated 标记，别把整屏日志塞进一次请求 */
const MAX_FULL_TEXT = 20000;
/** preview 只留选中文字的前 40 字：卡片是一行，露太多既挤也不协调 */
const PREVIEW_CHARS = 40;
const GAP = 8;

interface PendingSelection {
  type: string;
  container: HTMLElement;
  range: Range;
  text: string;
  anchorRect: { top: number; bottom: number; left: number; right: number; width: number; height: number };
}

/** ask=确认是否加入；comment=已入区，正在补评论 */
const mode = ref<'ask' | 'comment' | 'badge' | null>(null);
const note = ref('');
/** 这次选区用户动过手没有：没动过就先不给删除键，避免刚冒出来就露出危险操作 */
const bubbleTouched = ref(false);
const badgeNote = ref('');
/** 新选区气泡正在补评论的条目 id：卡片在选中那一刻就已入暂存区 */
const editingId = ref('');
const activeBadgeId = ref('');
/** 选区里带 DOM 节点，不能进深响应式代理 */
const pending = shallowRef<PendingSelection | null>(null);

const bubbleRef = ref<HTMLElement>();
const noteRef = ref<HTMLTextAreaElement>();
const panelRef = ref<HTMLElement>();
const badgeNoteRef = ref<HTMLTextAreaElement>();

const bubbleStyle = ref<Record<string, string>>({});
const panelStyle = ref<Record<string, string>>({});

/** 评论框最多长到 4 行左右，再多就内部滚动，别把页面顶跑 */
const NOTE_MAX_HEIGHT = 88;

/** textarea 没有 autosize：先归零再按 scrollHeight 撑开，超上限交给 CSS 滚动 */
function growNote(el: HTMLTextAreaElement | undefined): void {
  if (!el) {
    return;
  }
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, NOTE_MAX_HEIGHT)}px`;
}

/**
 * 角标要显示的数字：取它在暂存区里的位次（1 起），和输入框上方的卡片序号对上。
 * 条目已被移除时 order 为 0，这条角标就没有存在意义，直接不渲染。
 */
const visibleBadges = computed(() =>
  badges.value
    .filter((b) => b.rect)
    .map((b) => ({ ...b, order: contexts.value.findIndex((c) => c.id === b.itemId) + 1 }))
    .filter((b) => b.order > 0)
);
const activeBadge = computed(() => badges.value.find((b) => b.itemId === activeBadgeId.value) ?? null);

/** 从选区节点向上找最近的接入容器；找不到说明这块面板没声明 data-context-type，不弹气泡 */
function findContextContainer(node: Node | null): HTMLElement | null {
  const el = node instanceof Element ? node : node?.parentElement;
  return el?.closest<HTMLElement>('[data-context-type]') ?? null;
}

function closeBubble(): void {
  if (mode.value === 'ask' || mode.value === 'comment') {
    mode.value = null;
  }
  editingId.value = '';
  pending.value = null;
}

function showBubble(selection: Selection): void {
  const text = selection.toString().trim();
  if (text.length < 2) {
    closeBubble();
    return;
  }
  const range = selection.getRangeAt(0);
  const container = findContextContainer(range.commonAncestorContainer);
  const type = container?.dataset.contextType?.trim();
  if (!container || !type) {
    closeBubble();
    return;
  }
  const rect = range.getBoundingClientRect();
  if (!rect.width && !rect.height) {
    closeBubble();
    return;
  }
  pending.value = {
    type,
    container,
    range: range.cloneRange(),
    text,
    anchorRect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height }
  };
  // 只弹确认气泡：暂存区不动、原生选区不清、不抢焦点，右键复制 / Ctrl+C 保持可用
  note.value = '';
  editingId.value = '';
  mode.value = 'ask';
  // 等气泡渲染出真实高度再定位，否则上下翻转会算错
  nextTick(placeBubble);
}

function placeBubble(): void {
  const p = pending.value;
  const el = bubbleRef.value;
  if (!p || !el) {
    return;
  }
  const width = el.offsetWidth || 340;
  const height = el.offsetHeight || 40;
  const rect = p.anchorRect;
  let top = rect.top - height - GAP;
  if (top < GAP) {
    top = Math.min(rect.bottom + GAP, window.innerHeight - height - GAP);
  }
  const left = Math.max(GAP, Math.min(rect.left, window.innerWidth - width - GAP));
  bubbleStyle.value = { top: `${top}px`, left: `${left}px` };
}

/**
 * 「复制」：直接用选区原文，不依赖当前 Selection 是否还活着。
 */
async function copySelection(): Promise<void> {
  const text = pending.value?.text;
  if (!text) {
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制');
  } catch {
    ElMessage.error('复制失败，请用 Ctrl+C');
  }
}

/**
 * 「加入会话」被点下：这时才把选区推进暂存区、留角标，并切成补评论态。
 * 先入区再编辑：用户还没写评论时，输入框上方就已经有卡片了。
 */
function beginComment(): void {
  if (!pending.value) {
    return;
  }
  attachSelection();
  bubbleTouched.value = false;
  mode.value = 'comment';
  nextTick(() => {
    // 复用已有条目时可能带着旧评论，先按内容撑开再定位
    growNote(noteRef.value);
    placeBubble();
    noteRef.value?.focus();
  });
}

/**
 * 把当前选区推进暂存区并留一枚角标。
 */
function attachSelection(): void {
  const p = pending.value;
  if (!p) {
    return;
  }
  const ds = p.container.dataset;
  const rawFull = p.container.innerText ?? '';
  const truncated = rawFull.length > MAX_FULL_TEXT;
  const fullText = truncated ? rawFull.slice(0, MAX_FULL_TEXT) : rawFull;
  const text = p.text;
  const offset = fullText.indexOf(text);
  const anchor = ds.contextAnchor || undefined;
  // 标题只用选中的原文：不掺入容器标题之类没被选中的内容；过长就截断加省略号。
  // 来源（链路/节点）已在 source 里，附件渲染时单独展示，不必塞进标题。
  const selected = text.replace(/\s+/g, ' ').trim();
  const item: AgentContextItem = {
    id: nextContextId(),
    kind: 'excerpt',
    type: p.type,
    title: selected ? (selected.length > 20 ? `${selected.slice(0, 20)}…` : selected) : contextMeta(p.type).label,
    preview: text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}…` : text,
    note: '',
    payload: { text, fullText, offset, length: text.length, truncated },
    source: {
      assetType: ds.contextAssetType,
      assetId: ds.contextAssetId,
      assetName: ds.contextAssetName,
      nodeName: ds.contextNodeName,
      recordId: ds.contextRecordId,
      anchor,
      offset,
      length: text.length,
      capturedAt: new Date().toISOString()
    },
    fingerprint: `${p.type}|${anchor ?? ''}|${offset}|${text.length}`
  };
  const stored = addContext(item);
  addBadge({ itemId: stored.id, fingerprint: stored.fingerprint, range: p.range, title: stored.title, note: stored.note });
  editingId.value = stored.id;
  note.value = stored.note;
  // 原生选区会盖住 Custom Highlight，且此时已经没有保留价值
  window.getSelection()?.removeAllRanges();
}

/** 输入即回写：气泡被滚动或点别处关掉时，已经敲进去的评论不会丢 */
function syncEditingNote(): void {
  // 能开始打字就说明用户已经在操作这条，删除键可以露出来了
  bubbleTouched.value = true;
  if (editingId.value) {
    updateNote(editingId.value, note.value.trim());
  }
}

/** 评论框：回写评论 + 跟随内容增高，气泡按新高度重新定位（保持贴在选区上方） */
function onNoteInput(): void {
  syncEditingNote();
  growNote(noteRef.value);
  nextTick(placeBubble);
}

/** 角标浮层里的评论框：同样增高，并按角标位置重新定位 */
function onBadgeInput(): void {
  growNote(badgeNoteRef.value);
  nextTick(placeBadgePanel);
}

/** 确认评论：卡片早就在暂存区了，这里只把评论写回去 */
function commitNote(): void {
  if (editingId.value) {
    updateNote(editingId.value, note.value.trim());
  }
  editingId.value = '';
  closeBubble();
}

/** 垃圾桶：丢弃这次选区，卡片和角标一起撤掉 */
function discardSelection(): void {
  if (editingId.value) {
    removeContext(editingId.value);
  }
  editingId.value = '';
  closeBubble();
}

function onNewKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    commitNote();
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
  commitNote();
}

function badgeTitle(badge: ContextBadge): string {
  return badge.note ? `${badge.title} · ${badge.note}` : badge.title;
}

function badgeStyle(badge: ContextBadge): Record<string, string> {
  const rect = badge.rect!;
  return {
    top: `${Math.max(GAP, rect.top - 11)}px`,
    left: `${Math.min(rect.right + 2, window.innerWidth - 24)}px`
  };
}

/** 角标浮层复用气泡样式，但由角标位置反推，避免和「新选区」气泡抢位置 */
function placeBadgePanel(): void {
  const badge = activeBadge.value;
  const el = panelRef.value;
  if (!badge?.rect || !el) {
    return;
  }
  const width = el.offsetWidth || 340;
  const height = el.offsetHeight || 40;
  const rect = badge.rect;
  let top = rect.top - height - 6;
  if (top < GAP) {
    top = Math.min(rect.bottom + 6, window.innerHeight - height - GAP);
  }
  const left = Math.max(GAP, Math.min(rect.left, window.innerWidth - width - GAP));
  panelStyle.value = { top: `${top}px`, left: `${left}px` };
}

function openBadgePanel(badge: ContextBadge): void {
  activeBadgeId.value = badge.itemId;
  badgeNote.value = badge.note;
  mode.value = 'badge';
  nextTick(() => {
    growNote(badgeNoteRef.value);
    placeBadgePanel();
    badgeNoteRef.value?.focus();
  });
}

function saveBadgeNote(): void {
  updateNote(activeBadgeId.value, badgeNote.value.trim());
  mode.value = null;
  activeBadgeId.value = '';
}

function removeActiveBadge(): void {
  removeContext(activeBadgeId.value);
  mode.value = null;
  activeBadgeId.value = '';
}

function onBadgeKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    mode.value = null;
    activeBadgeId.value = '';
    return;
  }
  // Enter 等同点对勾：输入完直接保存，和上方新选区气泡一致
  if (event.key !== 'Enter' || event.isComposing) {
    return;
  }
  event.preventDefault();
  saveBadgeNote();
}

/* ---------------- 选区与视口事件 ---------------- */

function onMouseUp(event: MouseEvent): void {
  // 点我们自己浮层里的内容不算「重新选区」，否则改评论时气泡会被抢走
  const target = event.target as Element | null;
  if (target?.closest?.('.ctx-layer')) {
    return;
  }
  // mouseup 同一拍里选区尚未落定（双击选词尤其明显），延后一拍再读
  window.setTimeout(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      closeBubble();
      return;
    }
    showBubble(selection);
  }, 0);
}

function onDocMouseDown(event: MouseEvent): void {
  if (mode.value !== 'badge') {
    return;
  }
  const target = event.target as Element | null;
  if (target?.closest?.('.ctx-bubble--badge') || target?.closest?.('.ctx-badge')) {
    return;
  }
  mode.value = null;
  activeBadgeId.value = '';
}

/** 确认态没有输入框可挂 keydown，Esc 走全局：只关气泡，不动选区 */
function onDocKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || mode.value !== 'ask') {
    return;
  }
  closeBubble();
}

/** 滚动用捕获阶段：面板内部滚动容器也能触发角标重算 */
function onScroll(): void {
  scheduleViewportSync(true);
}

function onResize(): void {
  scheduleViewportSync(false);
}

let rafId = 0;

function scheduleViewportSync(hideBubble: boolean): void {
  if (hideBubble && (mode.value === 'ask' || mode.value === 'comment')) {
    closeBubble();
  }
  if (rafId) {
    return;
  }
  rafId = window.requestAnimationFrame(() => {
    rafId = 0;
    refreshBadges();
    if (mode.value === 'ask' || mode.value === 'comment') {
      placeBubble();
    }
    if (mode.value === 'badge') {
      placeBadgePanel();
    }
  });
}

/**
 * 闪一下来处：色调取输入框聚焦时那层描边（--db-rule-strong），圆角也跟输入框一致，
 * 动画结束自动摘掉 class，不写内联样式，也就不怕和面板自己的 hover / 选中态打架。
 * 只在找不到具体文字、没法精确定位时才用（整块闪）。
 */
function flashTarget(target: HTMLElement): void {
  const rule = getComputedStyle(target).getPropertyValue('--db-rule-strong').trim() || 'rgba(60, 60, 67, 0.24)';
  target.classList.add('is-ctx-flash');
  const anim = target.animate(
    [{ boxShadow: `inset 0 0 0 1.5px ${rule}` }, { boxShadow: 'inset 0 0 0 1.5px transparent' }],
    { duration: 700, iterations: 3, easing: 'ease-in-out' }
  );
  const done = () => target.classList.remove('is-ctx-flash');
  anim.onfinish = done;
  anim.oncancel = done;
}

/**
 * 在容器里按引文重新定位出 Range。
 * 选区文字来自 innerText，和 textContent 的换行/缩进常有差异，所以整段找不到就退到逐行、再退到行首片段。
 */
function locateRange(root: HTMLElement, text: string | undefined): Range | null {
  if (!text) {
    return null;
  }
  const candidates = [text, ...text.split('\n')].map((s) => s.trim()).filter((s) => s.length >= 2);
  for (const needle of candidates) {
    const range = rangeOfText(root, needle);
    if (range) {
      return range;
    }
  }
  return null;
}

/** 把「第几个字」映射回 DOM 文本节点，得到可高亮的 Range */
function rangeOfText(root: HTMLElement, needle: string): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }
  let all = '';
  for (const textNode of nodes) {
    all += textNode.data;
  }
  const start = all.indexOf(needle);
  if (start < 0) {
    return null;
  }
  const end = start + needle.length;
  const range = document.createRange();
  let cursor = 0;
  for (const textNode of nodes) {
    const next = cursor + textNode.data.length;
    if (start >= cursor && start < next) {
      range.setStart(textNode, start - cursor);
    }
    if (end > cursor && end <= next) {
      range.setEnd(textNode, end - cursor);
      return range;
    }
    cursor = next;
  }
  return null;
}

/** 只闪「选中的那几个字」：走 CSS Highlight，不画框、不动 DOM，段落里刚好框住这段字 */
function blinkRange(range: Range): void {
  const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  const Highlight = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  if (!registry || !Highlight) {
    return;
  }
  const key = 'databus-flash';
  registry.set(key, new Highlight(range));
  let visible = true;
  let ticks = 0;
  const timer = window.setInterval(() => {
    visible = !visible;
    if (visible) {
      registry.set(key, new Highlight(range));
    } else {
      registry.delete(key);
    }
    if (++ticks >= 6) {
      window.clearInterval(timer);
      registry.delete(key);
    }
  }, 320);
}

function onReveal(event: Event): void {
  const detail = (event as CustomEvent<{ anchor?: string; text?: string }>).detail;
  const anchor = detail?.anchor;
  if (!anchor) {
    return;
  }
  const target = document.querySelector<HTMLElement>(`[data-context-anchor="${CSS.escape(anchor)}"]`);
  if (!target) {
    return;
  }
  const range = locateRange(target, detail.text);
  if (!range) {
    // 定位不到具体文字（DOM 已重建、内容被替换）才退回整块闪
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    flashTarget(target);
    return;
  }
  const block = range.startContainer.parentElement ?? target;
  block.scrollIntoView({ block: 'center', behavior: 'smooth' });
  blinkRange(range);
}

onMounted(() => {
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('mousedown', onDocMouseDown);
  document.addEventListener('keydown', onDocKeydown);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('databus:context:reveal', onReveal);
});

onBeforeUnmount(() => {
  document.removeEventListener('mouseup', onMouseUp);
  document.removeEventListener('mousedown', onDocMouseDown);
  document.removeEventListener('keydown', onDocKeydown);
  window.removeEventListener('scroll', onScroll, true);
  window.removeEventListener('resize', onResize);
  window.removeEventListener('databus:context:reveal', onReveal);
  if (rafId) {
    window.cancelAnimationFrame(rafId);
  }
});
</script>

<style lang="scss">
/* CSS Custom Highlight 的样式必须放全局块里，scoped 选不中 ::highlight 伪元素 */
::highlight(databus-context) {
  /* 浅蓝实色，与系统/编辑器选中态一致，不用半透明叠色（会随背后深浅变色） */
  background-color: #cfe9fb;
  color: inherit;
}

/* 「跳转到消息」时的描边闪烁：得给个圆角，inset 阴影才会跟着圆角走 */
.is-ctx-flash {
  border-radius: var(--db-r-card, 14px);
}

/* 精确到选中文字本身的闪烁：只给这段字上底色，不改段落其它部分 */
::highlight(databus-flash) {
  background-color: rgba(120, 120, 128, 0.35);
}
</style>

<style lang="scss" scoped>
.ctx-layer {
  position: fixed;
  inset: 0;
  z-index: 3000;
  /* 整层只负责定位，命中交给气泡与角标，否则挡住页面点击 */
  pointer-events: none;
}

.ctx-bubble {
  position: absolute;
  display: flex;
  /* 评论框长高时按钮跟着落在底部，不跟着文字往上飘 */
  align-items: flex-end;
  gap: 2px;
  width: 260px;
  padding: 5px 5px 5px 12px;
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  background: var(--el-bg-color-overlay, #fff);
  box-shadow: var(--el-box-shadow-light, 0 6px 24px rgba(0, 0, 0, 0.12));
  pointer-events: auto;
}

/* 确认态是两个图标钮，不需要评论框那 340px；
   没有 textarea 兜底，分割线要跟着按钮垂直居中，不能继承底对齐 */
.ctx-bubble--ask {
  align-items: center;
  width: auto;
  padding: 4px;
  gap: 2px;
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

/* 两个图标钮同一套 hover，确认态里没有主次之分 */
.ctx-act:hover {
  background: rgba(120, 120, 128, 0.12);
}

.ctx-act--danger {
  color: var(--el-color-danger, #f56c6c);

  &:hover {
    background: var(--el-color-danger-light-9, #fef0f0);
  }
}

/* 还没动手时不显形但占着位，露出来的时候对勾不會跳位置 */
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

.ctx-badge {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--db-blue, #007aff);
  color: #fff;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.16);
  cursor: pointer;
  pointer-events: auto;

  &:hover {
    background: var(--db-blue-hover, #0068db);
  }
}
</style>