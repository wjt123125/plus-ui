/**
 * 连接器运行层（万物皆包，databus-material-market.md §15）类型定义。
 * 两层状态机：market_item 管买卖，databus_connector_def 管运行（本文件）。
 * 安装语义＝enable（非 fork、不写 databus_install），启停/卸载统一走 defs 端点。
 */

/** 运行层状态机（def 行） */
export type ConnectorDefStatus = 'ENABLED' | 'SUSPENDED' | 'DEPRECATED';

/** def 来源（MARKET / UPLOAD / AI / ADMIN；内置连接器为 null） */
export type ConnectorDefSource = 'MARKET' | 'UPLOAD' | 'AI' | 'ADMIN';

/** 连接器配置字段（连接表单动态渲染，§15.1 前端直渲） */
export interface ConnectorConfigField {
  /** 字段类型：string / int / long / boolean / double / array / object */
  type?: string;
  /** 展示标签 */
  label?: string;
  /** 是否必填 */
  required?: boolean;
  /** 默认值 */
  defaultValue?: string;
  /** 候选值（enum 类字段用） */
  options?: string[];
  /** 说明 */
  description?: string;
}

/** 连接器操作（组件物料生成用） */
export interface ConnectorOperationDef {
  /** 操作名（与 Connector 业务方法名对应） */
  name?: string;
  /** 展示标签 */
  label?: string;
  /** 输入 schema */
  inputSchema?: Record<string, ConnectorConfigField>;
  /** 输出 schema */
  outputSchema?: Record<string, ConnectorConfigField>;
}

/**
 * 连接器 def 视图行（GET /databus/connector/defs 的合并视图）：
 * 内置（Spring 扫描，builtin=true 无 def 行）∪ def 行（包上传 / 市场来源）统一形态。
 */
export interface ConnectorDefVo {
  /** 主键 id（内置连接器无 def 行，为 null） */
  id?: string | number;
  /** 类型键（全局唯一；连接管理页 connectorType 引用此值） */
  type: string;
  /** 版本号（内置连接器为 null） */
  version?: string;
  /** 引擎档（http / jvm / native；内置为 null） */
  engine?: 'http' | 'jvm' | 'native' | string;
  /** 展示标签（manifest / descriptor 的 label） */
  label?: string;
  /** 图标名（Iconify 字符串） */
  icon?: string;
  /** 运行层状态（内置连接器视为 ENABLED） */
  status: ConnectorDefStatus | string;
  /** 来源（MARKET / UPLOAD / AI / ADMIN；内置为 null） */
  source?: ConnectorDefSource | string;
  /** 是否内置（内置不走启停/卸载端点） */
  builtin?: boolean;
  /** zip 落盘目录（plugins/{type}/{version}；内置为 null） */
  packagePath?: string;
  /** 操作清单（组件物料生成用） */
  operations?: ConnectorOperationDef[];
  /** Connection 配置 schema（连接表单动态渲染；字段名 → 字段定义） */
  configSchema?: Record<string, ConnectorConfigField>;
  createBy?: string | number;
  createTime?: string;
  updateTime?: string;
}
