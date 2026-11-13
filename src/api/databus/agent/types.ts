/** AI 助手对话入参 */
export interface AgentChatBo {
  /** 用户原话 */
  content: string;
  /** 会话 id，为空则新开会话 */
  conversationId?: string;
}

/** 发起对话的返回：run 句柄与会话 id */
export interface AgentChatStartVo {
  /** run 句柄，用于打开 SSE 流与停止 */
  runId: string;
  /** SnailAI 会话 id，前端持久化用于刷新恢复 */
  conversationId: string;
}

/** run 状态 */
export type AgentRunStatus = 'RUNNING' | 'FINISHED' | 'FAILED' | 'STOPPED' | 'EXPIRED' | 'SUPERSEDED';

/** AI 任务（不含权限与链路快照） */
export interface AgentRunVo {
  runId: string;
  conversationId: string;
  intent?: string;
  status: AgentRunStatus;
  report?: string;
  round?: number;
  expireTime?: string;
  createTime?: string;
}

/** 「回到这次对话前」的回滚结果 */
export interface AgentRollbackVo {
  /** 被回滚的链路 id */
  chainId: number | string;
  /** true 表示本对话新建的链路已整条删除；false 表示结构已写回对话前 */
  deleted: boolean;
}

/** 会话摘要（按 run 聚合，不建独立会话表） */
export interface AgentConversationVo {
  /** SnailAI 会话 id */
  conversationId: string;
  /** 标题：同会话最早一条非 SUPERSEDED run 的原话左截 40 字 */
  title?: string;
  /** 最近一次 run 的创建时间 */
  lastTime?: string;
  /** 是否有进行中的 run */
  running?: boolean;
  /** 该会话的 run 条数 */
  runCount?: number;
}

/** AI 已落库的消息（按 seq 升序回放） */
export interface AgentMessageVo {
  runId: string;
  seq: number;
  /** databus:agent:canvas / draft / script-draft / run-end / auth */
  eventCode: string;
  chainId?: number | string;
  content: string;
  createTime?: string;
}