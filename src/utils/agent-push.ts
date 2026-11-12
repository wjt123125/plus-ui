import type { PushMessagePayload } from '@/utils/push-message';

/**
 * AI agent 全局推送总线。
 *
 * 后端把 AI 的产物事件（画布快照 / 草稿 / 脚本草稿 / 收口 / 授权）走既有 PushHelper 全局 SSE 下发，
 * 事件编码统一以 `databus:agent:` 开头、放在 data.eventCode 里（message 留给人类可读文案）。
 * push.ts 在进消息中心之前前置分流到这里，避免 AI 事件污染通知列表。
 */
export const AGENT_PUSH_PREFIX = 'databus:agent:';

export type AgentPushPayload = PushMessagePayload;

export type AgentPushHandler = (payload: AgentPushPayload) => void;

const handlers = new Set<AgentPushHandler>();

/**
 * 判断一条全局推送是不是 AI agent 事件。
 *
 * @param payload 已解析的推送载荷
 */
export function isAgentPush(payload: PushMessagePayload): boolean {
  const code = payload.data?.eventCode;
  return typeof code === 'string' && code.startsWith(AGENT_PUSH_PREFIX);
}

/**
 * 分发给所有订阅者（无人订阅时静默丢弃）。
 *
 * @param payload 已解析的推送载荷
 */
export function dispatchAgentPush(payload: AgentPushPayload): void {
  handlers.forEach(handler => handler(payload));
}

/**
 * 订阅 AI agent 推送，返回取消订阅函数。
 *
 * @param handler 处理器
 */
export function onAgentPush(handler: AgentPushHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}