/**
 * 会话上下文附件（§22）：前后端共用的数据契约 + 类型名注册表。
 *
 * 附件单独走 attachments 字段，不拼进正文；新增一种可引用物只在这里补一条中文名。
 * 展示按 kind 分流：resource＝整件资源引用卡，excerpt＝带序号的文字上下文卡；
 * 同一 kind 内不再按 type 换外观。
 */
export type AgentContextKind = 'excerpt' | 'resource';

/** 来源锚点：告诉模型这段文字是从哪条链路/哪个节点/哪条记录里取的 */
export interface AgentContextSource {
  assetType?: string;
  assetId?: number | string;
  assetName?: string;
  nodeName?: string;
  recordId?: number | string;
  /** 容器上的稳定锚点，用于「去看来处」定位与角标重算 */
  anchor?: string;
  offset?: number;
  length?: number;
  capturedAt?: string;
}

/** excerpt 带原文，resource 只带主键与编码 */
export interface AgentContextPayload {
  text?: string;
  fullText?: string;
  offset?: number;
  length?: number;
  truncated?: boolean;
  id?: number | string;
  code?: string;
  /** 连接器跳转所需：type 是定义类型，version 是包版本（二者才是连接器包的定位身份） */
  connectorType?: string;
  connectorVersion?: string;
}

export interface AgentContextItem {
  /** 前端 UUID：暂存去重与详情弹窗回查都认它 */
  id: string;
  /** excerpt = 划字来的；resource = 整件资源 */
  kind: AgentContextKind;
  /** provider 键，如 terminal-run / compile-error / chain / component */
  type: string;
  title: string;
  preview?: string;
  note?: string;
  payload?: AgentContextPayload;
  source?: AgentContextSource;
  /** 去重键：`type|anchor|offset|length` 或 `type|id` */
  fingerprint: string;
}

/** 本批接入的可引用类型；type 字段仍按 string 收，便于后端先于前端扩展 */
type AgentContextType =
  | 'terminal-run'
  | 'preview-run'
  | 'preview-result'
  | 'compile-error'
  | 'chain'
  | 'component'
  | 'connector'
  | 'chat';

export interface AgentContextMeta {
  /** 卡片/气泡上的中文类型名 */
  label: string;
}

const CONTEXT_TYPES: Record<AgentContextType, AgentContextMeta> = {
  'terminal-run': { label: '运行日志' },
  'preview-run': { label: '试跑结果' },
  'preview-result': { label: '试跑结果明细' },
  'compile-error': { label: '编译报错' },
  chain: { label: '链路' },
  component: { label: '组件' },
  connector: { label: '连接器' },
  chat: { label: '会话消息' }
};

/** 未注册类型兜底成中性名，漏配也不会渲染空白卡片 */
const FALLBACK: AgentContextMeta = { label: '上下文' };

export function contextMeta(type: string): AgentContextMeta {
  return CONTEXT_TYPES[type as AgentContextType] ?? FALLBACK;
}

/**
 * 整件资源引用（链路 / 组件 / 连接器）：输入区与消息里按「引用卡」渲染，点击跳转资源；
 * 其余 kind 都是文字摘录，按带序号的上下文卡渲染。
 */
export function isResourceContext(item: AgentContextItem): boolean {
  return item.kind === 'resource';
}