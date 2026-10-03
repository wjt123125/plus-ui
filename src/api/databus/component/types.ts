/**
 * 物料 schema 合流选项类型，与后端 /databus/component/options 响应对齐
 * （org.dromara.databus.domain.vo.ComponentOptionsVo / ComponentOptionVo / PropSchema）。
 */

/** 控件类型（后端反射阶段已解析，不含 AUTO） */
export type WidgetKind =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'SELECT'
  | 'MULTISELECT'
  | 'PASSWORD'
  | 'CONNECTION_SELECT'
  | 'KEY_VALUE_MAP'
  | 'OBJECT_ROWS'
  | 'OBJECT'
  | 'JSON';

/** 字段表达式角色 */
export type ExprRole = 'LITERAL' | 'DATA' | 'TARGET';

/** LiteFlow 节点类型 */
export type NodeTypeKind = 'NODE' | 'BOOLEAN' | 'FOR' | 'ITERATOR' | 'SWITCH';

/** 配置区编辑器形态 */
export type EditorKind = 'form' | 'script';

/** 物料来源 */
export type ComponentSource = 'SYSTEM' | 'CUSTOM';

/** select/multiselect 候选项 */
export interface PropOption {
  label: string;
  value: string;
}

/** 条件显示规则（多条 AND；field 相对当前对象层级，支持点路径） */
export interface PropShowWhen {
  field: string;
  eq?: string | null;
  ne?: string | null;
  in?: string[] | null;
  notIn?: string[] | null;
}

/** 物料配置字段 schema */
export interface PropSchema {
  /** 字段名 */
  name: string;
  /** 展示名 */
  label?: string | null;
  /** 说明文案（表单项下方小灰字） */
  description?: string | null;
  /** 最终控件 */
  widget: WidgetKind;
  /** 是否必填（前端表单拦截） */
  required?: boolean;
  /** 表达式角色 */
  exprRole?: ExprRole;
  /** 占位提示 */
  placeholder?: string | null;
  /** 排序；0 表示未显式声明（顺序以 fields 数组为准） */
  order?: number;
  /** select/multiselect 候选 */
  options?: PropOption[] | null;
  /** 条件显示 */
  showWhen?: PropShowWhen[] | null;
  /** OBJECT 分组 / OBJECT_ROWS 元素字段 */
  fields?: PropSchema[] | null;
  /** KEY_VALUE_MAP 键/值控件 */
  keyWidget?: WidgetKind | null;
  valueWidget?: WidgetKind | null;
  /** KEY_VALUE_MAP 值的表达式角色 */
  valueExprRole?: ExprRole | null;
}

/** schema 体 */
export interface ComponentSchemaBody {
  fields: PropSchema[];
}

/** /options 单项物料 */
export interface ComponentOption {
  code: string;
  name: string;
  shortName?: string | null;
  group?: string | null;
  icon?: string | null;
  color?: string | null;
  description?: string | null;
  nodeType?: NodeTypeKind | null;
  editor?: EditorKind | null;
  source: ComponentSource;
  sort?: number | null;
  /** 配置 JSON 示例（JSON 高级模式占位提示，后端物料注解 dataExample 下发） */
  dataExample?: string | null;
  schema?: ComponentSchemaBody | null;
}

/** /options 响应包络 */
export interface ComponentOptionsResp {
  /** schema 契约版本 */
  schemaVersion: number;
  components: ComponentOption[];
}
