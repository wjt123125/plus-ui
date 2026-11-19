/** 卡片选项：label 渲染成按钮，description 是按钮下的说明 */
export interface AgentCardOption {
  /** 回传的动作键，确认卡为 confirm / cancel */
  key: string;
  /** 按钮文案 */
  label: string;
  /** 选项自述，必须给 */
  description?: string;
  style?: 'primary' | 'default';
}

/** 通用交互卡片（运行时 §16）：confirm 为审批确认，choice 为后续选择卡，ref 为资源跳转卡 */
export interface AgentCard {
  /** run 内唯一，点选后原样回传 */
  cardId: string;
  kind: 'confirm' | 'choice' | 'ref';
  title: string;
  body?: string;
  /** 原文块：真正要执行的那次调用，等宽展示 */
  detail?: string;
  options: AgentCardOption[];
  /** 仅 choice 使用 */
  multiSelect?: boolean;
  presentation?: 'inline' | 'dialog';
  /** 仅 ref 使用：点击由宿主开对应 tab（如草稿审阅页） */
  resource?: AgentCardResource;
}

/** ref 卡指向的资源；id 是雪花 id，按字符串收避免精度丢失 */
export interface AgentCardResource {
  type: 'component' | 'chain';
  id?: string;
  code?: string;
  name?: string;
  /** 仅组件：是否草稿（前端据此在卡片上露出「▶ 试运行」） */
  draft?: boolean;
}

/** 卡片回执：用户点了哪一项 */
export interface AgentCardReply {
  cardId: string;
  action: string;
}

/** 附件来源锚点；画布/日志面板按 dataset 约定填入 */
export interface AgentContextSource {
  assetType?: string;
  assetId?: number | string;
  assetName?: string;
  nodeName?: string;
  recordId?: number | string;
  runId?: number | string;
  anchor?: string;
  route?: string;
  offset?: number;
  length?: number;
  capturedAt?: string;
}

/** excerpt 带原文；resource 只带主键与编码 */
export interface AgentContextPayload {
  text?: string;
  fullText?: string;
  offset?: number;
  length?: number;
  chars?: number;
  truncated?: boolean;
  id?: number | string;
  code?: string;
}

/**
 * 会话上下文附件（§22）。与视图侧 AgentContextItem 同构，
 * api 层单独声明一份，避免从 views 反向 import。
 */
export interface AgentContextItem {
  id: string;
  kind: 'excerpt' | 'resource';
  /** terminal-run / preview-run / compile-error / chain / component */
  type: string;
  title: string;
  preview?: string;
  note?: string;
  payload?: AgentContextPayload;
  source?: AgentContextSource;
  fingerprint: string;
}

/** AI 助手对话入参 */
export interface AgentChatBo {
  /** 用户原话 */
  content: string;
  /** 会话 id，为空则新开会话 */
  conversationId?: string;
  /** 卡片回执：用户在确认 / 选择卡片上点了哪一项 */
  cardReply?: AgentCardReply;
  /** 本轮附带的上下文（划字摘录 + 资源引用），与正文分开传 */
  attachments?: AgentContextItem[];
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
  /** 本轮产生的卡片 JSON，按 seq 升序；刷新后据此还原 */
  cards?: string[];
  /** 本轮收到的卡片回执 JSON，按 seq 升序；回执落在点选后新建的 run 上，需按 cardId 跨 run 归位 */
  cardReplies?: string[];
  /** 本轮附件 JSON 字符串（AgentContextItem[]），刷新后据此还原上下文卡 */
  attachments?: string;
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

/** 会话审批模式 */
export type AgentApprovalMode = 'MANUAL' | 'AUTO' | 'FULL' | 'CUSTOM';

/** 会话审批模式回包：allowFullAccess 由部署开关决定，false 时完全访问档置灰 */
export interface AgentApprovalModeVo {
  /** 当前生效模式（FULL 在部署未开放时后端已归一为 MANUAL） */
  mode: AgentApprovalMode;
  /** 本部署是否开放完全访问 */
  allowFullAccess: boolean;
}

/** 会话摘要（按 run 聚合，不建独立会话表） */
export interface AgentConversationVo {
  /** SnailAI 会话 id */
  conversationId: string;
  /** 标题：用户自定义标题优先，否则取同会话最早一条非 SUPERSEDED run 的原话 */
  title?: string;
  /** 最近一次 run 的创建时间 */
  lastTime?: string;
  /** 是否有进行中的 run */
  running?: boolean;
  /** 该会话的 run 条数 */
  runCount?: number;
  /** 是否置顶（meta 覆盖项） */
  pinned?: boolean;
  /** 归属工作区 id；空表示默认工作区 */
  workspaceId?: number | string | null;
}

/** AI 已落库的消息（按 seq 升序回放） */
export interface AgentMessageVo {
  runId: string;
  seq: number;
  /** databus:agent:chain:canvas:updated / chain:draft:saved / component:draft:saved / run:lifecycle:ended */
  eventCode: string;
  chainId?: number | string;
  content: string;
  createTime?: string;
}