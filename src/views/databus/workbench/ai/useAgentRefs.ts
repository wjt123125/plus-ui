/**
 * AI 会话「资源引用」的展示映射（不再是独立暂存区）。
 *
 * 暂存与发送统一走 useAgentContext 的 contexts：整件资源是 kind='resource' 的上下文条目，
 * 输入区与消息里按引用卡渲染，点击跳转资源。本文件只保留：
 * - AgentRefItem：宿主跳转接口（开画布 / 开详情）使用的载荷；
 * - refToContext / agentRefOf：引用卡与上下文条目的互转；
 * - parseRefsText：旧历史正文里的「【引用】」段还原（新消息不再走这条路）。
 */
import { refMeta, refTypeByLabel, type AgentRefType } from './agentRefTypes';
import type { AgentContextItem } from './contextTypes';

export interface AgentRefItem {
  type: AgentRefType;
  /** 链路 id / 组件 dbId；系统内置件没有主键时留空，只带 code */
  id?: number | string;
  code?: string;
  name: string;
  /** 连接器专用：包定位身份（type + version） */
  connectorType?: string;
  connectorVersion?: string;
}

/** 引用卡 → 统一上下文条目（旧历史恢复 / 兼容入口使用） */
export function refToContext(ref: AgentRefItem): AgentContextItem {
  return {
    id: `ref_${ref.type}_${ref.id ?? ref.code ?? ''}`,
    kind: 'resource',
    type: ref.type,
    title: ref.name,
    note: '',
    payload: { id: ref.id, code: ref.code },
    fingerprint: `${ref.type}|${ref.id ?? ref.code ?? ''}`
  };
}

/** 上下文条目 → 宿主跳转载荷（只对整件资源有意义） */
export function agentRefOf(item: AgentContextItem): AgentRefItem {
  return {
    type: item.type as AgentRefType,
    name: item.title,
    id: item.payload?.id,
    code: item.payload?.code,
    connectorType: item.payload?.connectorType,
    connectorVersion: item.payload?.connectorVersion
  };
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
