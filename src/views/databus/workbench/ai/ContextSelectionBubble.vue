<!--
  全局选区浮层（§22.2）：划字 → 先弹「加入会话？」确认气泡，此时不动暂存区、
  不清原生选区、不抢焦点，右键复制 / Ctrl+C 照常可用；点确认后才入暂存区并展开评论框，
  同时在选区右上角留一个角标，点角标可改评论 / 移除。

  挂在工作台根而不是聊天面板里：面板收起时也要能划字攒上下文；
  pointer-events 只放在气泡与角标上，否则整页点击会被透明层吃掉。
-->
<template>
  <div class="ctx-layer">
    <!-- 选区气泡两态：ask=只问要不要加入，comment=已入区，补评论；外观与 hover 浮层共用同一组件 -->
    <ContextActionBubble
      v-if="mode === 'ask' || mode === 'comment'"
      :mode="mode"
      :anchor-rect="bubbleAnchorRect"
      :note="note"
      :idle-hidden="!bubbleTouched"
      copy-title="复制选中内容"
      @update:note="onNoteUpdate"
      @touch="bubbleTouched = true"
      @copy="copySelection"
      @join="beginComment"
      @remove="discardSelection"
      @commit="commitNote"
      @esc="commitNote"
    />

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
    <ContextActionBubble
      v-if="mode === 'badge' && activeBadge && panelAnchorRect"
      :key="activeBadge.itemId"
      mode="comment"
      :anchor-rect="panelAnchorRect"
      :note="badgeNote"
      :title="activeBadge.title"
      @update:note="badgeNote = $event"
      @remove="removeActiveBadge"
      @commit="saveBadgeNote"
      @esc="closeBadgePanel"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { ElMessage } from 'element-plus';
import { contextMeta, type AgentContextItem } from './contextTypes';
import { useAgentContext, nextContextId, type ContextBadge } from './useAgentContext';
import ContextActionBubble from './ContextActionBubble.vue';
import type { AnchorRect } from './contextBubble';

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
  anchorRect: AnchorRect;
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

/** 当前气泡锚点：滚动/窗口变化时按 Range 重算，气泡组件只认这份矩形 */
const bubbleAnchorRect = ref<AnchorRect | null>(null);

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

/** 角标浮层的锚点：贴住角标自身的位置，与新选区气泡错开 */
const panelAnchorRect = computed<AnchorRect | null>(() => {
  const rect = activeBadge.value?.rect;
  return rect ? { ...rect } : null;
});

/** Range → 视口矩形；节点被重建/选区断开时返回 null */
function rangeAnchor(range: Range | null): AnchorRect | null {
  if (!range || !range.startContainer.isConnected) {
    return null;
  }
  const rect = range.getBoundingClientRect();
  if (!rect.width && !rect.height) {
    return null;
  }
  return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height };
}

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
  bubbleAnchorRect.value = pending.value.anchorRect;
  mode.value = 'ask';
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

/** 评论框输入：回写评论；增高与定位由气泡组件自己处理 */
function onNoteUpdate(value: string): void {
  note.value = value;
  syncEditingNote();
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

/** 角标浮层由角标位置反推锚点，避免和「新选区」气泡抢位置 */
function openBadgePanel(badge: ContextBadge): void {
  activeBadgeId.value = badge.itemId;
  badgeNote.value = badge.note;
  mode.value = 'badge';
}

function closeBadgePanel(): void {
  mode.value = null;
  activeBadgeId.value = '';
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
  if (target?.closest?.('.ctx-bubble') || target?.closest?.('.ctx-badge')) {
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
  // ask 态只是提示，滚动就收起；comment 态用户可能正在打字，保留并按新位置重算
  if (hideBubble && mode.value === 'ask') {
    closeBubble();
  }
  if (rafId) {
    return;
  }
  rafId = window.requestAnimationFrame(() => {
    rafId = 0;
    refreshBadges();
    if (mode.value === 'ask' || mode.value === 'comment') {
      const anchor = rangeAnchor(pending.value?.range ?? null);
      if (anchor) {
        bubbleAnchorRect.value = anchor;
      } else {
        closeBubble();
      }
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