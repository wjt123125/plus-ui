/**
 * AI agent 全局推送订阅（侧栏对话面板用）。
 *
 * 事件总线在 utils/agent-push.ts，push.ts 在进消息中心前前置分流到那里；
 * 这里只包一层组件生命周期：面板卸载时自动退订，避免处理函数越堆越多。
 */
import { onBeforeUnmount } from 'vue';
import { onAgentPush, type AgentPushHandler } from '@/utils/agent-push';

export function useAgentPush(handler: AgentPushHandler) {
  const off = onAgentPush(handler);
  onBeforeUnmount(off);
  return off;
}