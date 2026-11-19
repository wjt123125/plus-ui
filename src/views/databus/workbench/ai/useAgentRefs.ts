/**
 * AI 对话「引用卡」暂存（模块级单例，与 useAgentChat 同策略：收起侧栏不丢）。
 *
 * 资源树 / 画布右键「加入会话」只往这里塞一条引用，不发消息；
 * 真正发出去时由 AgentChatPanel 交给 useAgentChat，转成 resource 附件随消息带出，
 * 让模型拿到确定的 chainId / componentId，不用靠名称猜。
 */
import { computed, reactive } from 'vue';
import { currentConversationKey } from './agentSession';
import { refMeta, refTypeByLabel, type AgentRefType } from './agentRefTypes';

export interface AgentRefItem {
  type: AgentRefType;
  /** 链路 id / 组件 dbId；系统内置件没有主键时留空，只带 code */
  id?: number | string;
  code?: string;
  name: string;
}

/** conversationId → 该会话暂存的引用卡；切会话各看各的，切回来还在 */
const refsByConversation = reactive<Record<string, AgentRefItem[]>>({});

const refs = computed<AgentRefItem[]>(() => refsByConversation[currentConversationKey()] ?? []);

function currentList(): AgentRefItem[] {
  const key = currentConversationKey();
  if (!refsByConversation[key]) {
    refsByConversation[key] = [];
  }
  return refsByConversation[key];
}

/** 同类型同 id（无 id 时同 code）只留一条，重复加入不叠加 */
function sameRef(a: AgentRefItem, b: AgentRefItem): boolean {
  if (a.type !== b.type) {
    return false;
  }
  if (a.id != null || b.id != null) {
    return String(a.id) === String(b.id);
  }
  return a.code === b.code;
}

function addRef(item: AgentRefItem): void {
  const list = currentList();
  if (list.some((r) => sameRef(r, item))) {
    return;
  }
  list.push(item);
}

function removeRef(item: AgentRefItem): void {
  const key = currentConversationKey();
  const list = refsByConversation[key];
  if (list) {
    refsByConversation[key] = list.filter((r) => !sameRef(r, item));
  }
}

function clearRefs(): void {
  delete refsByConversation[currentConversationKey()];
}

/**
 * 把消息文本尾部的引用段拆出来。
 * 仅用于读旧历史（新消息的引用走 attachments）；刷新恢复时靠它还原引用卡，避免退化成一段文字。
 */
export function parseRefsText(text: string): { text: string; refs: AgentRefItem[] } {
  const marker = '【引用】';
  // 后端 intent 前后会 trim，纯引用消息的开头换行可能已被吃掉，所以不依赖前置换行
  const idx = text.indexOf(marker);
  if (idx < 0) {
    return { text, refs: [] };
  }
  const refs: AgentRefItem[] = [];
  for (const line of text.slice(idx + marker.length).split('\n')) {
    const label = /^-\s*([^「]+)「/.exec(line)?.[1]?.trim();
    const name = /「(.+?)」/.exec(line)?.[1];
    const type = label ? refTypeByLabel(label) : null;
    if (!type || !name) {
      continue;
    }
    const meta = refMeta(type);
    const code = /[,，]\s*code=([^,，]+)/.exec(line)?.[1];
    const id = new RegExp(`[,，]\\s*${meta.idKey}=([^,，]+)`).exec(line)?.[1];
    refs.push({ type, name, code, id });
  }
  return { text: text.slice(0, idx).replace(/\n$/, ''), refs };
}

export function useAgentRefs() {
  return { refs, addRef, removeRef, clearRefs };
}