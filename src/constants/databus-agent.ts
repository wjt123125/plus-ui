/**
 * Databus AI Agent 事件码（与后端 `AgentConstants` 一一对应）。
 *
 * 事件码统一为 `databus:agent:<域>:<对象>:<动作>` 全冒号五段式，动作一律过去式——事件是「已经发生的事实」，
 * 不是命令；要不要开 tab、开哪个 tab 由前端按 eventCode 自己决定。命名正本见
 * databus-meta/docs/databus-agent-runtime.md §9.1。
 */

/** 全部 AI agent 业务事件码的公共前缀：用于把这类推送从消息中心里分流出去 */
export const AGENT_PUSH_PREFIX = 'databus:agent:';

/** 链路画布已更新：载荷为全量 cmpProperty 快照 + elExpression */
export const AGENT_EVENT_CHAIN_CANVAS_UPDATED = `${AGENT_PUSH_PREFIX}chain:canvas:updated`;

/** 链路草稿已落库：只带 chainId，前端刷新链树 */
export const AGENT_EVENT_CHAIN_DRAFT_SAVED = `${AGENT_PUSH_PREFIX}chain:draft:saved`;

/** 组件草稿已落库：带 componentId，前端刷组件树并把审阅 tab 顶出来 */
export const AGENT_EVENT_COMPONENT_DRAFT_SAVED = `${AGENT_PUSH_PREFIX}component:draft:saved`;

/** run 收口：成功 / 失败 / 中止 / 过期 */
export const AGENT_EVENT_RUN_LIFECYCLE_ENDED = `${AGENT_PUSH_PREFIX}run:lifecycle:ended`;

/** 本地提示行：画布更新被丢弃（不落库、不推送，仅用于系统行的归类） */
export const AGENT_EVENT_CHAIN_CANVAS_SKIPPED = `${AGENT_PUSH_PREFIX}chain:canvas:skipped`;

/* ---------------- run 生命周期与审批模式 ---------------- */

/** run 状态（AgentRunStatusEnum）：进行中 / 已完成 / 失败 / 已中止 / 已过期 / 已被新 run 顶替 */
export const DATABUS_AGENT_RUN_STATUS_RUNNING = 'RUNNING';

export const DATABUS_AGENT_RUN_STATUS_FINISHED = 'FINISHED';

export const DATABUS_AGENT_RUN_STATUS_FAILED = 'FAILED';

export const DATABUS_AGENT_RUN_STATUS_STOPPED = 'STOPPED';

export const DATABUS_AGENT_RUN_STATUS_EXPIRED = 'EXPIRED';

export const DATABUS_AGENT_RUN_STATUS_SUPERSEDED = 'SUPERSEDED';

/** 会话级操作审批模式（AgentApprovalModeEnum）：手动 / 自动 / 完全访问 */
export const DATABUS_AGENT_APPROVAL_MODE_MANUAL = 'MANUAL';

export const DATABUS_AGENT_APPROVAL_MODE_AUTO = 'AUTO';

export const DATABUS_AGENT_APPROVAL_MODE_FULL = 'FULL';

/* ---------------- 对话级 SSE 事件名（按 run 的流，不带 databus:agent: 前缀） ---------------- */

/** 模型正文增量 */
export const AGENT_SSE_TEXT = 'text';

/** 模型思考增量 */
export const AGENT_SSE_THINKING = 'thinking';

/** 本轮收口（报告正文） */
export const AGENT_SSE_DONE = 'done';

/** 本轮错误 */
export const AGENT_SSE_ERROR = 'error';

/** 交互卡片：与模型文字同序，data 是 AgentCard 对象而不是字符串 */
export const AGENT_SSE_CARD = 'card';

/** 工具阶段开始（运行中）：data 是 AgentStepInfo，前端插入一条阶段标题 */
export const AGENT_SSE_STEP_START = 'step_start';

/** 工具阶段结束（完成 / 失败）：data 是同一 stepId 的终态快照 */
export const AGENT_SSE_STEP_END = 'step_end';

/* ---------------- 工具阶段状态（AgentStepStatusEnum） ---------------- */

/** 阶段运行中：标题扫光 */
export const AGENT_STEP_STATUS_RUNNING = 'running';

/** 阶段已完成 */
export const AGENT_STEP_STATUS_DONE = 'done';

/** 阶段失败 */
export const AGENT_STEP_STATUS_FAILED = 'failed';
