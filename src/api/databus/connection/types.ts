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
  /** Connector 类型标识（1D-P0 仅 bpmHttp） */
  connectorType: string;
  /** 连接地址（BPM 容器地址，如 http://localhost:8088） */
  endpoint?: string;
  /** OpenAPI access_key（CC 身份策略访问凭证） */
  accessKey?: string;
  /** OpenAPI secret（CC 身份策略私钥，敏感字段；编辑留空不修改） */
  apiSecret?: string;
  /** HTTP 超时（毫秒，后端兜底默认 30000） */
  timeout?: number;
  /** 失败重试次数（后端兜底默认 0；1D-P0 保留字段） */
  retryCount?: number;
  /** 是否启用（Y 启用 N 禁用；启用后执行链路自动注入 DatabusContext） */
  enabled?: string;
  /** 备注 */
  remark?: string;
  /** 创建时间 */
  createTime?: string;
  /** 更新时间 */
  updateTime?: string;
}

/**
 * 新增/修改/测试连接入参，与后端 org.dromara.databus.domain.bo.SysDatabusConnectionBo 对齐。
 * 字段平铺提交（不嵌套 config 子对象），Service 层负责转 Connection.config Map。
 */
export type SysDatabusConnectionBo = Omit<SysDatabusConnectionVo, 'createTime' | 'updateTime'>;

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
