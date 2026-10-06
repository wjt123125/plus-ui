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

/**
 * 物料来源（三态合流）：
 * - SYSTEM：纯内置件（无 DB 行，契约/治理全取 jar 注解）
 * - OVERLAY：治理覆盖行（同码 DB 行无脚本，治理取 DB、契约取内置注解）
 * - CUSTOM：库存件（同码启用有 script_body，契约/治理全量取 DB）
 */
export type ComponentSource = 'SYSTEM' | 'OVERLAY' | 'CUSTOM';

/** 业务叶子业务域：bpm=BPM 平台件，common=通用件 */
export type ComponentDomain = 'bpm' | 'common';

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
  /** 业务叶子业务域（bpm/common；仅 business 组下发，其余为 null） */
  domain?: ComponentDomain | null;
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
  /** 编目标签（自定义行治理列；内置件不下发） */
  tags?: string[] | null;
  /** 是否废弃（废弃件老链路可见、面板置灰） */
  deprecated?: boolean | null;
  /** 废弃提示文案 */
  deprecateNote?: string | null;
}

/** /options 响应包络 */
export interface ComponentOptionsResp {
  /** schema 契约版本 */
  schemaVersion: number;
  components: ComponentOption[];
}

/**
 * databus_component 表列分类（旧五分类，台账表 category 列）。
 * 注意：编辑器物料面板分组以 /options 的 group 字段为准（七组），与此列不同。
 */
export type ComponentCategory = 'PROTOCOL' | 'DATA' | 'FLOW_CONTROL' | 'AI' | 'PLATFORM';

/** 组件元信息行（/databus/component/list、/{id}），与 DatabusComponentVo 对齐 */
export interface DatabusComponentVo {
  /** 主键 id（自定义件新增为空） */
  id?: number;
  /** 组件编码（链路 cmp_property 节点 "id" 引用此值，唯一） */
  componentCode: string;
  /** 组件名称【治理】 */
  componentName: string;
  /** 物料网格短名【治理】 */
  shortName?: string | null;
  /** 表列分类（PROTOCOL/DATA/FLOW_CONTROL/AI/PLATFORM）【治理】 */
  category: string;
  /** 物料面板七组（flow/sequence/branch/loop/other/subflow/business）【治理】 */
  groupName?: string | null;
  /** 业务叶子业务域（bpm/common；仅 business 组使用）【治理】 */
  domain?: string | null;
  /** 图标（svg 名或 Iconify 名，如 ph:pencil-simple）【治理】 */
  icon?: string | null;
  /** 面板色值（如 #409eff）【治理】 */
  color?: string | null;
  /** 面板排序（升序，缺省 100）【治理】 */
  sort?: number | null;
  /** 一句话描述【治理】 */
  description?: string | null;
  /** 编目标签【治理】 */
  tags?: string[] | null;
  /** LiteFlow 节点类型（NODE/BOOLEAN/FOR/ITERATOR/SWITCH）【契约缓存】 */
  nodeType?: NodeTypeKind | null;
  /** 配置形态（form/script）【契约缓存】 */
  editor?: EditorKind | null;
  /**
   * 参数 schema 体（契约缓存列，新形态只装 {"fields":[...]}）。
   * 空/坏 JSON 时 /options 降级为无 schema，编辑器回退 JSON 高级模式。
   */
  paramSchema?: string | null;
  /** 配置 JSON 示例【契约缓存】 */
  dataExample?: string | null;
  /** 输入 Schema（预留，连线校验用）【契约缓存】 */
  inputSchema?: string | null;
  /** 输出 Schema（预留，连线校验用）【契约缓存】 */
  outputSchema?: string | null;
  /** 脚本语言（脚本宿主，当前固定 java；空＝无脚本工件）【工件】 */
  scriptLang?: string | null;
  /** 脚本正文（完整 Java 类源码；空＝治理覆盖行或纯内置）【工件】 */
  scriptBody?: string | null;
  /** 脚本版本（已保存版本号，无脚本为空）【工件】 */
  version?: number | null;
  /** 启停状态（0 启用 1 停用） */
  status: string;
  /** 废弃标记（0 正常 1 废弃；废弃≠停用） */
  deprecated?: string | null;
  /** 废弃提示文案 */
  deprecateNote?: string | null;
  /** 文档链接 */
  docUrl?: string | null;
  /** 备注 */
  remark?: string | null;
  /** 创建时间 */
  createTime?: string;
}

/** 新增/修改入参（scriptLang/scriptBody/version 为工件列，第一步 form 不可写不传） */
export type DatabusComponentForm = Omit<
  DatabusComponentVo,
  'createTime' | 'scriptLang' | 'scriptBody' | 'version'
>;

/** 列表分页查询参数（后端 DatabusComponentBo 支持的过滤字段） */
export interface DatabusComponentQuery extends PageQuery {
  componentCode?: string;
  componentName?: string;
  category?: string;
  status?: string;
}

// ------------------------------------------------------------------
// 脚本宿主（javax.pro 完整 Java 源码：保存即编译/热更/版本/回滚）
// ------------------------------------------------------------------

/** 编译诊断条目（与后端 ScriptDiagnostic record 对齐） */
export interface ScriptDiagnostic {
  /** 级别：ERROR/WARNING/MANDATORY_WARNING/NOTE/OTHER */
  kind: string;
  /** 源码行号（1 起；未知 -1） */
  line: number;
  /** 源码列号（1 起；未知 -1） */
  column: number;
  message: string;
}

/** 保存脚本入参（POST /databus/component/script） */
export interface ScriptSaveBo {
  id: number;
  /** 缺省 java */
  scriptLang?: string;
  /** 完整 Java 类源码 */
  scriptBody: string;
}

/** 回滚入参（POST /databus/component/script/rollback） */
export interface ScriptRollbackBo {
  id: number;
  versionNo: number;
}

/** 脚本保存/回滚结果（编译失败同样 200 返回，success=false 带诊断） */
export interface ScriptSaveResult {
  success: boolean;
  /** 失败总述 */
  message?: string | null;
  /** 行列诊断 */
  diagnostics?: ScriptDiagnostic[] | null;
  componentId?: number;
  version?: number;
  scriptLang?: string | null;
  nodeType?: NodeTypeKind | null;
  editor?: EditorKind | null;
  paramSchema?: string | null;
  dataExample?: string | null;
  fieldCount?: number;
}

/** 版本历史行（GET /script/{id}/versions，版本号倒序，含正文） */
export interface ScriptVersion {
  id: number;
  componentId: number;
  versionNo: number;
  scriptLang?: string | null;
  scriptBody: string;
  remark?: string | null;
  createBy?: number | null;
  createTime?: string;
}

/** 库存脚本件运行时注册健康项（GET /script/runtime） */
export interface ScriptRuntime {
  componentId: number;
  componentCode: string;
  version?: number | null;
  healthy: boolean;
  error?: string | null;
  registeredAt?: string;
  failedAt?: string;
}
