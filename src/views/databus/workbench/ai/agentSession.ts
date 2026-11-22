/**
 * 会话级瞬时状态（模块级单例）：当前激活会话 id 与输入草稿。
 *
 * 目的：
 * - 新建/切换会话时，草稿跟着会话走，A 的输入不会带到 B；
 * - 输入草稿落 localStorage，切会话、收起侧栏、刷新页面回来都还在；
 * - 空白「新会话」不落会话 id，草稿暂存在 UNSAVED_CONVERSATION_KEY 下，
 *   点新建时清掉，切回历史会话则恢复该会话自己的草稿；
 * - 上下文暂存区（useAgentContext）也从这里取当前会话 id，
 *   保持同一套归属，避免循环 import（useAgentChat 依赖上下文类型）。
 */
import { computed } from 'vue';
import { usePersisted } from '../composables/usePersisted';

/** 还没有会话 id 时的草稿归属；只服务于空白新会话，点新建即清空 */
export const UNSAVED_CONVERSATION_KEY = '__unsaved__';

/** 当前激活会话 id（多会话切换只改这一个值；空串表示空白新会话） */
export const activeConversationId = usePersisted('databus.agent.activeConversationId', '');

/** 草稿归属 key：优先真实会话 id，空白态用固定占位 */
export function currentConversationKey(): string {
  return activeConversationId.value || UNSAVED_CONVERSATION_KEY;
}

/** conversationId → 输入框草稿 */
const drafts = usePersisted<Record<string, string>>('databus.agent.drafts', {});

export const currentDraft = computed<string>({
  get: () => drafts.value[currentConversationKey()] ?? '',
  set: (text: string) => {
    const key = currentConversationKey();
    if (text) {
      drafts.value[key] = text;
    } else {
      delete drafts.value[key];
    }
  }
});

/** 清掉某个归属下的草稿：点新建时清空白态槽位，空白态首条消息发出后兜底清理 */
export function clearDraft(conversationId: string): void {
  delete drafts.value[conversationId];
}
