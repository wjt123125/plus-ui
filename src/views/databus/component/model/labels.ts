/**
 * 组件管理页展示映射：分组/控件/节点类型等中文文案与小工具。
 * 分组口径与编辑器物料面板 PALETTE_GROUPS 七组对齐（cmp-defs.ts）。
 */
import type { ExprRole, NodeTypeKind, PropSchema, WidgetKind } from '@/api/databus/component/types';

/** 物料面板七组 key → 中文（/options 的 group 字段） */
export const GROUP_LABELS: Record<string, string> = {
  flow: '流程节点',
  sequence: '顺序编排',
  branch: '条件分支',
  loop: '循环迭代',
  other: '异常与逻辑',
  subflow: '子流程',
  business: '业务组件'
};

export function groupLabel(group?: string | null): string {
  if (!group) {
    return '未分组';
  }
  return GROUP_LABELS[group] ?? group;
}

/** 控件类型 → 中文 */
export const WIDGET_LABELS: Record<WidgetKind, string> = {
  TEXT: '文本',
  TEXTAREA: '长文本',
  NUMBER: '数字',
  BOOLEAN: '布尔',
  SELECT: '单选',
  MULTISELECT: '多选',
  PASSWORD: '密钥',
  CONNECTION_SELECT: '连接选择',
  KEY_VALUE_MAP: '键值表',
  OBJECT_ROWS: '对象行表',
  OBJECT: '对象分组',
  JSON: '高级 JSON'
};

export function widgetLabel(widget?: string | null): string {
  if (!widget) {
    return '-';
  }
  return (WIDGET_LABELS as Record<string, string>)[widget] ?? widget;
}

/** 表达式角色 → 标签文案（LITERAL/未声明不展示） */
export function exprRoleLabel(role?: ExprRole | null): string {
  if (role === 'DATA') {
    return '数据值';
  }
  if (role === 'TARGET') {
    return '写入路径';
  }
  return '';
}

/** LiteFlow 节点类型 → 中文 */
export const NODE_TYPE_LABELS: Record<NodeTypeKind, string> = {
  NODE: '普通节点',
  BOOLEAN: '布尔节点',
  FOR: '计数循环',
  ITERATOR: '迭代循环',
  SWITCH: '选择路由'
};

export function nodeTypeLabel(nodeType?: string | null): string {
  if (!nodeType) {
    return '-';
  }
  return NODE_TYPE_LABELS[nodeType as NodeTypeKind] ?? nodeType;
}

/** 配置区形态 → 中文 */
export function editorLabel(editor?: string | null): string {
  if (editor === 'form') {
    return '表单配置';
  }
  if (editor === 'script') {
    return '脚本配置';
  }
  return '-';
}

/** databus_component.category 旧五分类选项（表列正本，与 /options 的 group 不同） */
export const CATEGORY_OPTIONS = [
  { value: 'PROTOCOL', label: '协议类（HTTP 等）' },
  { value: 'DATA', label: '数据处理' },
  { value: 'FLOW_CONTROL', label: '流程控制' },
  { value: 'AI', label: '人工智能' },
  { value: 'PLATFORM', label: '平台对接（BPM 等）' }
] as const;

/** 面板七组选项（value=组 key，label=中文，color=组色），顺序与 PALETTE_GROUPS 对齐 */
export const GROUP_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'flow', label: GROUP_LABELS.flow, color: '#909399' },
  { value: 'sequence', label: GROUP_LABELS.sequence, color: '#409eff' },
  { value: 'branch', label: GROUP_LABELS.branch, color: '#e6a23c' },
  { value: 'loop', label: GROUP_LABELS.loop, color: '#67c23a' },
  { value: 'other', label: GROUP_LABELS.other, color: '#f56c6c' },
  { value: 'subflow', label: GROUP_LABELS.subflow, color: '#909399' },
  { value: 'business', label: GROUP_LABELS.business, color: '#409eff' }
];

/** 节点类型下拉 */
export const NODE_TYPE_OPTIONS = (Object.keys(NODE_TYPE_LABELS) as NodeTypeKind[]).map((value) => ({
  value,
  label: NODE_TYPE_LABELS[value]
}));

/** 配置形态下拉（契约 JSON 小写形式） */
export const EDITOR_OPTIONS = [
  { value: 'form', label: '表单配置（form）' },
  { value: 'script', label: '脚本配置（script）' }
] as const;

/** 控件类型下拉 */
export const WIDGET_OPTIONS = (Object.keys(WIDGET_LABELS) as WidgetKind[]).map((value) => ({
  value,
  label: WIDGET_LABELS[value]
}));

/** 表达式角色下拉（空值＝字面量默认） */
export const EXPR_ROLE_OPTIONS: { value: ExprRole | ''; label: string }[] = [
  { value: '', label: '字面量（默认）' },
  { value: 'DATA', label: '数据值（{{ }} 求值）' },
  { value: 'TARGET', label: '写入路径' }
];

/** 需要候选项编辑的控件 */
export const OPTION_WIDGETS: WidgetKind[] = ['SELECT', 'MULTISELECT'];

/**
 * 解析 param_schema 契约缓存列为字段数组。
 * 新形态只装 {"fields":[...]}；兼容历史同构形态（schema.fields 兜底）。
 * 空/坏 JSON 返回 null（调用方区分「未配置」与解析失败由调用方决定）。
 */
export function parseSchemaFields(raw?: string | null): PropSchema[] | null {
  if (!raw || !raw.trim()) {
    return [];
  }
  try {
    const obj = JSON.parse(raw);
    const fields = obj?.fields ?? obj?.schema?.fields;
    return Array.isArray(fields) ? (fields as PropSchema[]) : [];
  } catch {
    return null;
  }
}

/** JSON 美化；非法或空串原样返回 */
export function prettyJson(raw?: string | null): string {
  if (!raw || !raw.trim()) {
    return '';
  }
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
