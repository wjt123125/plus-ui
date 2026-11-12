/**
 * AI 会话「引用类型」注册表：以后要支持新的可引用资源，只改这一个文件。
 *
 * 元信息（标签 / 图标 / 类型色 / 引用段里的 id 字段名）集中定义，
 * 芯片渲染、发给模型的引用段文案、去重与资源映射都从这里读，
 * 避免各处散落「type === 'chain' ? ... : ...」。
 */
export type AgentRefType = 'chain' | 'component';

export interface AgentRefMeta {
  /** 引用段里对模型可见的类型名，如「链路」 */
  label: string;
  /** lucide 图标名，直接传给 SvgIcon 的 icon-class */
  icon: string;
  /** 类型色 CSS 变量：芯片以 --ref-color 注入，图标着色、底色由 color-mix 派生 */
  color: string;
  /** 引用段里主键的字段名，模型据此调工具，如 chainId / componentId */
  idKey: string;
}

const REF_TYPES: Record<AgentRefType, AgentRefMeta> = {
  chain: { label: '链路', icon: 'lucide:spline', color: 'var(--db-ref-chain)', idKey: 'chainId' },
  component: { label: '组件', icon: 'lucide:box', color: 'var(--db-ref-component)', idKey: 'componentId' }
};

/** 未注册类型兜底成中性灰，漏配也不会渲染空白芯片 */
const FALLBACK: AgentRefMeta = {
  label: '引用',
  icon: 'lucide:link',
  color: 'var(--db-ink-muted, #6e6e73)',
  idKey: 'refId'
};

export function refMeta(type: AgentRefType): AgentRefMeta {
  return REF_TYPES[type] ?? FALLBACK;
}

/** 反查类型：刷新恢复历史时从引用段里的中文标签还原 type */
export function refTypeByLabel(label: string): AgentRefType | null {
  const hit = (Object.keys(REF_TYPES) as AgentRefType[]).find((t) => REF_TYPES[t].label === label);
  return hit ?? null;
}