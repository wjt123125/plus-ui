/**
 * AI 对话「引用卡」暂存（模块级单例，与 useAgentChat 同策略：收起侧栏不丢）。
 *
 * 资源树 / 画布右键「加入会话」只往这里塞一条引用，不发消息；
 * 真正发出去时由 AgentChatPanel 把引用拼成一段文本附在用户问题后面，
 * 让模型拿到确定的 chainId / componentId，不用靠名称猜。
 */
import { ref } from 'vue';
import { refMeta, refTypeByLabel, type AgentRefType } from './agentRefTypes';

export interface AgentRefItem {
  type: AgentRefType;
  /** 链路 id / 组件 dbId；系统内置件没有主键时留空，只带 code */
  id?: number | string;
  code?: string;
  name: string;
}

const refs = ref<AgentRefItem[]>([]);

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
  if (refs.value.some((r) => sameRef(r, item))) {
    return;
  }
  refs.value.push(item);
}

function removeRef(item: AgentRefItem): void {
  refs.value = refs.value.filter((r) => !sameRef(r, item));
}

function clearRefs(): void {
  refs.value = [];
}

/**
 * 拼成问题尾部的引用段；没有任何引用时返回空串。
 * 格式固定成「类型 + 名称 + code + id」，模型按 id 调工具、按名称对上人话。
 */
export function buildRefsText(list: AgentRefItem[]): string {
  if (!list.length) {
    return '';
  }
  const lines = list.map((r) => {
    const meta = refMeta(r.type);
    const code = r.code ? `，code=${r.code}` : '';
    // 系统内置件没有主键，只给 code，让模型用 componentCode 查
    const id = r.id != null ? `，${meta.idKey}=${r.id}` : '';
    return `- ${meta.label}「${r.name}」${code}${id}`;
  });
  return ['', '【引用】', ...lines].join('\n');
}

/**
 * 把消息文本尾部的引用段拆出来。
 * 发出去的消息只存这份文本，刷新恢复时靠它还原引用卡，避免退化成一段文字。
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