/**
 * 数据总线连接视图对象，与后端 org.dromara.databus.domain.vo.SysDatabusConnectionVo 对齐。
 *
 * 三层物料模型第二层（Connection 实例）：组件层通过 connectionId（业务键）引用，
 * id 仅为本表主键。
 */
export interface SysDatabusConnectionVo {
  /** 主键 id（新增为空，编辑/删除用） */
  id?: number;
  /** 连接 ID（全局唯一，组件层通过此值引用） */
  connectionId: string;
  /** 连接名称（用户可读） */
  connectionName: string;
  /** Connector 类型标识（对应 databus_connector_def.type，如 bpmHttp / jdbc-postgresql） */
  connectorType: string;
  /** 是否启用（Y 启用 N 禁用；启用后执行链路自动注入 DatabusContext） */
  enabled?: string;
  /** 备注 */
  remark?: string;
  /**
   * 连接配置（万物皆包：字段清单由所选连接器的 configSchema 决定，平台前后端都不写死字段名）。
   * 安全口径：schema 标 sensitive 的字段后端不回显，编辑时留空即沿用库中旧值。
   */
  config?: Record<string, unknown>;
  /** 创建时间 */
  createTime?: string;
  /** 更新时间 */
  updateTime?: string;
}

/**
 * 新增/修改/测试连接入参，与后端 org.dromara.databus.domain.bo.SysDatabusConnectionBo 对齐。
 * 所有连接器一律走 config Map 直通（后端零硬编码，不认识任何具体字段）。
 */
export type SysDatabusConnectionBo = Omit<SysDatabusConnectionVo, 'createTime' | 'updateTime'>;

/**
 * 测试连接返回体（方案 §3.5 / §10.1：testConnection 返回类型 String → Object）。
 * 各连接器自己决定内容，平台原样序列化：JDBC 回 status/message/product/version/driverVersion/elapsedMs，
 * BPM 仍回一个纯字符串。故消费侧必须两种形态都兼容（见 connection/index.ts 的 testResultMessage）。
 */
export interface TestConnectionResult {
  /** 三态：OK / UNREACHABLE / AUTH_FAILED（仅结构化返回的连接器有） */
  status?: string;
  /** 人类可读结论（成功提示直接用它） */
  message?: string;
  /** 数据库产品名 */
  product?: string;
  /** 数据库产品版本 */
  version?: string;
  /** 实际生效的驱动版本（与 manifest.driver.version 比对，判断包里那份有没有起作用） */
  driverVersion?: string;
  /** 探活耗时（毫秒） */
  elapsedMs?: number;
  [key: string]: unknown;
}

/**
 * 连接轻量选项（GET /databus/connection/options），与后端 ConnectionOptionVo 对齐：
 * 只含 id/connectionId/connectionName/connectorType/connectorFamily，不含 config 与密钥。
 */
export interface ConnectionOption {
  id: number;
  /** 连接业务键（组件 Cfg.connectionId 存此值，如 bpm-default） */
  connectionId: string;
  connectionName: string;
  /** 具体连接器 type（如 jdbc-postgresql），运行时按它找实例 */
  connectorType: string;
  /**
   * 能力族（如 jdbc / bpmHttp），由后端从 ConnectorDescriptor.family 解析；
   * 连接器包未装载或 describe() 失败时为 null，此时 ConnectionSelect 退化为不过滤。
   */
  connectorFamily?: string | null;
}

/**
 * 连接列表分页查询参数，与后端 list 端点支持的过滤字段对齐。
 */
export interface SysDatabusConnectionQuery extends PageQuery {
  /** 连接 ID（后端模糊匹配） */
  connectionId?: string;
  /** 连接名称（后端模糊匹配） */
  connectionName?: string;
  /** Connector 类型（精确匹配） */
  connectorType?: string;
  /** 是否启用（Y/N，精确匹配） */
  enabled?: string;
}
