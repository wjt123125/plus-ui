/**
 * 消息工具栏动作注册表（可插拔）。
 *
 * 工具栏组件只负责渲染，不认识任何具体动作；新增工具时在本文件 registerMessageAction 一次即可，
 * 面板与气泡不需要改动。动作按 placement 分成「平铺」与「收进更多（…）」两组。
 */
import { ElMessage } from 'element-plus';
import { isHandledRequestError } from '@/utils/request';
import { textOf, type AgentChatMessage, type AgentChatRole } from './useAgentChat';

export type MessageActionPlacement = 'inline' | 'more';

/** 工具条挂在哪种消息下：系统消息不挂 */
export type MessageActionRole = Exclude<AgentChatRole, 'system'>;

/** 面板注入的能力实现：动作只描述「做什么」，不直接碰面板状态 */
export interface MessageActionDeps {
  /** 原地重试一条 AI 回复 */
  retryReply: (messageId: string) => Promise<void>;
  /** 删除一轮对话（提问 + 回复） */
  removeTurn: (messageId: string) => Promise<void>;
  /** 回退到本轮对话发起前，返回被回滚的链路 */
  revertTurn: (messageId: string) => Promise<{ chainId: number | string; deleted: boolean }[]>;
}

/** 动作执行上下文 */
export interface MessageActionContext {
  /** 工具栏所属消息 */
  message: AgentChatMessage;
  /** 这一轮的提问（AI 消息的动作需要） */
  question?: AgentChatMessage;
  /** 这一轮的回复 */
  reply?: AgentChatMessage;
  /** 是否最后一轮：重试只对最后一轮开放，否则新一轮会排到历史末尾 */
  lastTurn: boolean;
  /** 当前会话是否有 run 在跑 */
  running: boolean;
  deps: MessageActionDeps;
}

export interface MessageAction {
  /** 唯一键，重复注册会覆盖 */
  key: string;
  label: string;
  /** lucide 图标名，需已在 useLucideSubset 中声明 */
  icon: string;
  /** 挂在哪种消息下 */
  role: MessageActionRole;
  /** inline 平铺在气泡下方，more 收进「…」菜单，缺省 inline */
  placement?: MessageActionPlacement;
  /** 数字小的排前面，相同则按注册顺序 */
  order?: number;
  /** 不满足条件时不渲染 */
  visible?: (ctx: MessageActionContext) => boolean;
  /** 置灰但保留入口 */
  disabled?: (ctx: MessageActionContext) => boolean;
  run: (ctx: MessageActionContext) => void | Promise<void>;
}

const registry: MessageAction[] = [];

/** 注册一个工具栏动作；同 key 覆盖，避免热更新时重复挂载 */
export function registerMessageAction(action: MessageAction) {
  const index = registry.findIndex((item) => item.key === action.key);
  if (index >= 0) {
    registry.splice(index, 1, action);
  } else {
    registry.push(action);
  }
}

/** 某条消息在指定分组下要渲染的动作（已排序） */
export function messageActionList(
  role: MessageActionRole,
  placement: MessageActionPlacement,
  ctx: MessageActionContext
): MessageAction[] {
  return registry
    .filter((item) => item.role === role && (item.placement ?? 'inline') === placement)
    .filter((item) => !item.visible || item.visible(ctx))
    .toSorted((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** 复制纯文本；请求类错误已由拦截器提示过，这里只兜底本地异常 */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制');
  } catch {
    ElMessage.error('复制失败');
  }
}

/** 动作统一兜底：请求错误拦截器已提示，剩下的是本地校验错误 */
async function guard(task: () => void | Promise<void>) {
  try {
    await task();
  } catch (error) {
    if (!isHandledRequestError(error)) {
      ElMessage.error(error instanceof Error ? error.message : '操作失败');
    }
  }
}

registerMessageAction({
  key: 'reply-copy',
  label: '复制',
  icon: 'lucide:copy',
  role: 'assistant',
  order: 10,
  visible: ({ message }) => !!textOf(message),
  run: ({ message }) => copyText(textOf(message))
});

registerMessageAction({
  key: 'reply-retry',
  label: '重试',
  icon: 'lucide:refresh-cw',
  role: 'assistant',
  order: 20,
  visible: ({ question, reply, lastTurn, running }) => !!question?.runId && !!reply && lastTurn && !running,
  run: ({ message, deps }) => guard(() => deps.retryReply(message.id))
});

registerMessageAction({
  key: 'question-copy',
  label: '复制',
  icon: 'lucide:copy',
  role: 'user',
  order: 10,
  visible: ({ message }) => !!textOf(message),
  run: ({ message }) => copyText(textOf(message))
});

registerMessageAction({
  key: 'question-delete',
  label: '删除',
  icon: 'lucide:trash',
  role: 'user',
  order: 20,
  disabled: ({ running }) => running,
  run: ({ message, deps }) => guard(() => deps.removeTurn(message.id))
});

registerMessageAction({
  key: 'question-revert',
  label: '回退到本轮对话发起前',
  icon: 'lucide:undo-2',
  role: 'user',
  order: 30,
  // 本地还没落库的提问没有 run，回退无处可退
  visible: ({ question }) => !!question?.runId,
  disabled: ({ running }) => running,
  run: ({ message, deps }) =>
    guard(async () => {
      await deps.revertTurn(message.id);
    })
});