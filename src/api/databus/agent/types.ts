/** AI 助手对话入参 */
export interface AgentChatBo {
  /** 用户原话 */
  content: string;
  /** 会话 id，为空则新开会话 */
  conversationId?: string;
  /** 当前画布链路 id，可为空 */
  chainId?: number | string;
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
  chainId?: number | string;
  intent?: string;
  status: AgentRunStatus;
  report?: string;
  round?: number;
  expireTime?: string;
  createTime?: string;
}

/** AI 动手前的链路快照（每轮一行，用于「回到 AI 动手前」按轮次回滚） */
export interface AgentSnapshotVo {
  id: number | string;
  runId: string;
  /** 第几轮动手前（0 表示首轮） */
  round: number;
  /** 快照对应的链路 id（从 payload 解析，便于前端定位画布） */
  chainId?: number | string;
  chainName?: string;
  createTime?: string;
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