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

/** 通用交互卡片（运行时 §16）：confirm 为审批确认，choice 为用户拍板，ref 为资源跳转卡 */
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
  /** 仅 choice：是否允许用户自由输入（相当于 E 选项） */
  allowFreeText?: boolean;
  /** inline 留在消息流；dialog 浮起来等回执（选择卡固定 dialog） */
  presentation?: 'inline' | 'dialog';
  /** 协议版本，缺省按 1 处理 */
  v?: number;
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

/** 卡片回执：用户点了哪些项、补充了什么 */
export interface AgentCardReply {
  cardId: string;
  /** 选中的动作键：单选一项，多选多项 */
  actions: string[];
  /** 自由输入内容，仅 allowFreeText 卡片允许 */
  text?: string;
  /** 服务端写入的用户可见文案；回传时带上会被服务端覆盖，只用于历史回放 */
  display?: string;
}

/**
 * 工具阶段事件（服务端 AgentStepEvent 同构）：只用于就地更新一条阶段行。
 * 失败原因属于模型诊断信息，不会出现在这里。
 */
export interface AgentStepInfo {
  /** run 内唯一的单次调用 id */
  stepId: string;
  /** 工具名（与后端 AgentConstants.TOOL_* 一致），仅排障用 */
  tool?: string;
  /** 阶段标题（服务端按工具元数据生成） */
  title: string;
  status: 'running' | 'done' | 'failed';
}

/** 错误类别（与后端 AgentErrorCategory 对应） */
export type AgentErrorCategory =
  | 'transient'
  | 'user_action'
  | 'config'
  | 'permission'
  | 'content'
  | 'unknown';

/**
 * 用户可见的统一错误信封（与后端 AgentError 同构）。
 * 前端只渲染 message / retryable / referenceId，不维护错误码到文案的映射。
 */
export interface AgentErrorInfo {
  code: string;
  category: AgentErrorCategory;
  retryable: boolean;
  retryAfterMs?: number;
  message: string;
  referenceId?: string;
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

/** 系统事件：前端只报「发生了什么」，展示文案与模型指令都由后端目录生成 */
export interface AgentSystemEvent {
  /** 事件码，如 component.draft.rejected */
  code: string;
  /** 事件事实（组件编码、名称、版本等） */
  payload?: Record<string, unknown>;
}

export interface AgentChatBo {
  /** 用户原话 */
  content: string;
  /** 会话 id，为空则新开会话 */
  conversationId?: string;
  /** 卡片回执：用户在确认 / 选择卡片上点了哪些项、补充了什么 */
  cardReply?: AgentCardReply;
  /** 本轮附带的上下文（划字摘录 + 资源引用），与正文分开传 */
  attachments?: AgentContextItem[];
  /** 系统事件：草稿采纳 / 拒绝等，可替代正文单独成一轮 */
  systemEvent?: AgentSystemEvent;
}

/** 发起对话的返回：run 句柄与会话 id */
export interface AgentChatStartVo {
  /** run 句柄，用于打开 SSE 流与停止 */
  runId: string;
  /** SnailAI 会话 id，前端持久化用于刷新恢复 */
  conversationId: string;
  /** 本轮展示文案（只带系统事件时由后端生成，前端气泡直接展示） */
  intent?: string;
  /** 用户可见的回执文案（卡片轮次才有，由服务端按选项翻译，前端不自己拼） */
  display?: string;
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
  /** 本轮用户可见错误（脱敏后的 AgentErrorInfo JSON）；刷新后据此还原错误提示 */
  errors?: string[];
  /** 本轮追问建议（run 结束后异步生成，最多 3 条）；空数组表示不展示 */
  followUps?: string[];
  /** 本轮附件 JSON 字符串（AgentContextItem[]），刷新后据此还原上下文卡 */
  attachments?: string;
  /** 本轮是否真正改过链路：true 才提供「回退到本轮对话发起前」入口 */
  changed?: boolean;
  round?: number;
  expireTime?: string;
  createTime?: string;
}

/** 回退 / 预检共用的资源条目 */
export interface AgentRollbackVo {
  /** 资源类型：CHAIN 链路 / COMPONENT_DRAFT 组件草稿 */
  resourceType: string;
  /** 资源 id（链路 id 或草稿组件 id） */
  resourceId: number | string;
  /** 资源编码（链路编码 / 组件编码） */
  resourceCode?: string;
  /** 资源名称（链路名称 / 组件名称） */
  resourceName?: string;
  /** DELETE 删除 / RESTORE 写回 / SKIP 跳过 / REFERENCE 引用影响 */
  action?: 'DELETE' | 'RESTORE' | 'SKIP' | 'REFERENCE';
  /** true 表示整条已删除；false 表示已写回或跳过 */
  deleted: boolean;
  /** 跳过或受影响的原因，直接展示给用户 */
  reason?: string;
}

/** 回退预检结果：三份清单互不重叠，全空表示这一轮没有可回退的改动 */
export interface AgentRevertPreviewVo {
  /** 将撤销 */
  revert: AgentRollbackVo[];
  /** 将跳过（附原因） */
  skip: AgentRollbackVo[];
  /** 受影响的引用方链路 */
  affected: AgentRollbackVo[];
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