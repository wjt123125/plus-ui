/**
 * 会话上下文附件（§22）：暂存区 + 来源角标。
 *
 * 暂存区按 conversationId 分桶：切会话各看各的，切回来还在；
 * 收起侧栏只是销毁 DOM，模块级状态不丢；刷新后暂存区清空，只保留消息里的 attachments。
 *
 * 上下文条目统一涵盖「划字摘录」与「整件资源引用」（kind 区分）：
 * 前者带来源角标，后者按引用卡渲染；真正发出去由 AgentChatPanel 把整批 contexts
 * 作为 attachments 交给后端。来源角标只管当次会话，DOM 被重建（Range 断开）后自动隐藏。
 */
import { computed, reactive, ref } from 'vue';
import { currentConversationKey } from './agentSession';
import { contextMeta, type AgentContextItem } from './contextTypes';

/** 角标定位用的视口矩形；只留数值，避免把 DOMRect 塞进响应式代理 */
export interface ContextBadgeRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface ContextBadge {
  itemId: string;
  fingerprint: string;
  /** 选区克隆；节点仍挂载时可用它重算位置，断开后置空由 rect 隐藏 */
  range: Range | null;
  rect: ContextBadgeRect | null;
  title: string;
  note: string;
}

export interface ResourceContextInput {
  type: string;
  id?: number | string;
  code?: string;
  name?: string;
  note?: string;
  /** 连接器专用：包定位身份（type + version） */
  connectorType?: string;
  connectorVersion?: string;
}

/** conversationId → 该会话暂存的上下文附件 */
const contextsByConversation = reactive<Record<string, AgentContextItem[]>>({});
const contexts = computed<AgentContextItem[]>(
  () => contextsByConversation[currentConversationKey()] ?? []
);
const badges = ref<ContextBadge[]>([]);

function currentList(): AgentContextItem[] {
  const key = currentConversationKey();
  if (!contextsByConversation[key]) {
    contextsByConversation[key] = [];
  }
  return contextsByConversation[key];
}

/** CSS Custom Highlight 的注册名，样式在 ContextSelectionBubble 的非 scoped 块里 */
const HIGHLIGHT_KEY = 'databus-context';

/** crypto.randomUUID 在非安全上下文（内网 http）不可用，兜底时间戳 + 随机串 */
export function nextContextId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toRect(range: Range | null): ContextBadgeRect | null {
  // 容器被 Vue 重建后 Range 仍然存在但节点已脱离文档，此时必须隐藏角标
  if (!range || !range.startContainer.isConnected) {
    return null;
  }
  const rect = range.getBoundingClientRect();
  if (!rect.width && !rect.height) {
    return null;
  }
  return { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
}

function highlightRegistry(): Map<string, unknown> | null {
  return (CSS as unknown as { highlights?: Map<string, unknown> }).highlights ?? null;
}

function highlightCtor(): (new (...ranges: Range[]) => unknown) | null {
  return (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight ?? null;
}

/** 高亮只走 CSS.highlights，不动 DOM——改 DOM 会和 Vue 的渲染结果打架 */
function syncHighlights(): void {
  const registry = highlightRegistry();
  const Highlight = highlightCtor();
  if (!registry || !Highlight) {
    return;
  }
  const ranges = badges.value.map((b) => b.range).filter((r): r is Range => !!r && r.startContainer.isConnected);
  if (!ranges.length) {
    registry.delete(HIGHLIGHT_KEY);
    return;
  }
  // Highlight 的 ranges 不能原地改，每次重建最省心
  registry.set(HIGHLIGHT_KEY, new Highlight(...ranges));
}

/**
 * 标题去重：附件内容允许重复，卡片标题不能撞脸，否则用户在输入区和会话里分不清是哪一条。
 * 重名时追加「（2）」「（3）」……，只影响展示与发给模型的上下文标题，不动原文。
 */
function uniqueTitle(base: string): string {
  const taken = new Set(contexts.value.map((c) => c.title));
  if (!taken.has(base)) {
    return base;
  }
  let index = 2;
  while (taken.has(`${base}（${index}）`)) {
    index += 1;
  }
  return `${base}（${index}）`;
}

/**
 * 加入暂存区；同一段原文重复选中时复用已有条目。
 *
 * @param item 待加入的条目
 * @return 真正留在暂存区里的条目（重复时是之前那条，id 可能与入参不同）
 */
function addContext(item: AgentContextItem): AgentContextItem {
  const list = currentList();
  const exist = list.find((c) => c.fingerprint === item.fingerprint);
  if (exist) {
    return exist;
  }
  const stored: AgentContextItem = { ...item, title: uniqueTitle(item.title) };
  list.push(stored);
  return stored;
}

function removeContext(item: AgentContextItem | string): void {
  const key = currentConversationKey();
  const id = typeof item === 'string' ? item : item.id;
  const list = contextsByConversation[key];
  if (list) {
    contextsByConversation[key] = list.filter((c) => c.id !== id);
  }
  removeBadge(id);
}

/**
 * 发出后暂存区清空，角标跟着消失：
 * 卡片已落在消息里，留着角标会指向一个暂存区里不存在的条目。
 */
function clearContexts(): void {
  delete contextsByConversation[currentConversationKey()];
  clearBadges();
}

function updateNote(item: AgentContextItem | string, note: string): void {
  const id = typeof item === 'string' ? item : item.id;
  const target = currentList().find((c) => c.id === id);
  if (target) {
    target.note = note;
  }
  const badge = badges.value.find((b) => b.itemId === id);
  if (badge) {
    badge.note = note;
  }
}

/** 画布 / 资源树 / 市场「加入会话」用：整件资源不截原文，只带主键/编码 */
function resourceContext(input: ResourceContextInput): AgentContextItem {
  const { type, id, code, name, note, connectorType, connectorVersion } = input;
  const meta = contextMeta(type);
  return {
    id: nextContextId(),
    kind: 'resource',
    type,
    title: name || code || meta.label,
    preview: code ? `${meta.label} · ${code}` : meta.label,
    note: note ?? '',
    payload: { id, code, connectorType, connectorVersion },
    fingerprint: `${type}|${id ?? code ?? ''}`
  };
}

function addBadge(input: { itemId: string; fingerprint: string; range: Range | null; title: string; note?: string }): void {
  const badge: ContextBadge = { ...input, note: input.note ?? '', rect: toRect(input.range) };
  const index = badges.value.findIndex((b) => b.itemId === badge.itemId || b.fingerprint === badge.fingerprint);
  if (index >= 0) {
    badges.value[index] = badge;
  } else {
    badges.value.push(badge);
  }
  syncHighlights();
}

function removeBadge(target: string): void {
  badges.value = badges.value.filter((b) => b.itemId !== target && b.fingerprint !== target);
  syncHighlights();
}

function clearBadges(): void {
  badges.value = [];
  syncHighlights();
}

/** 滚动 / 窗口变化后按 Range 重算角标位置；Range 断开的条目 rect 置空即隐藏 */
function refreshBadges(): void {
  if (!badges.value.length) {
    return;
  }
  for (const badge of badges.value) {
    badge.rect = toRect(badge.range);
  }
  syncHighlights();
}

export function useAgentContext() {
  return {
    contexts,
    badges,
    addContext,
    removeContext,
    clearContexts,
    updateNote,
    resourceContext,
    addBadge,
    clearBadges,
    refreshBadges
  };
}