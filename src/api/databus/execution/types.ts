/**
 * 数据总线执行记录相关类型，与后端 org.dromara.databus.domain 对齐。
 */

/**
 * 执行状态（databus_execution.status，与后端 ExecutionStatusEnum 对齐）。
 */
export type ExecutionStatus = 'RUNNING' | 'SUCCESS' | 'FAILED';

/**
 * 节点状态（databus_execution_node.status）。
 */
export type NodeExecutionStatus = 'SUCCESS' | 'FAILED';

/**
 * 执行记录总账 VO，与后端 DatabusExecutionVo 对齐。
 * 列表接口不返回 requestData/responseData（大字段白名单排除），详情接口才有。
 */
export interface DatabusExecutionVo {
  /** 执行记录主键（雪花 id，Long 超 JS 安全整数时序列化为字符串） */
  id: number | string;
  /** 链路 id（链路查不到的失败记录为空） */
  chainId?: number | string | null;
  /** 链路编码 */
  chainCode: string;
  /** 执行入参 JSON（仅详情返回；重跑的入参来源） */
  requestData?: string;
  /** 最终输出 JSON（仅详情返回） */
  responseData?: string;
  /** 执行状态 RUNNING/SUCCESS/FAILED */
  status: string;
  /** 失败时错误信息 */
  errorMsg?: string | null;
  /** 执行开始时间 */
  startTime?: string;
  /** 执行结束时间 */
  endTime?: string;
  /** 执行耗时（毫秒） */
  duration?: number | null;
  /** 创建时间 */
  createTime?: string;
}

/**
 * 节点明细行 VO，与后端 DatabusExecutionNodeVo 对齐（仅 FULL 档有数据）。
 */
export interface DatabusExecutionNodeVo {
  id: number | string;
  executionId: number | string;
  /** 节点实例 id（需后端开 enable-node-instance-id；区分同 nodeId 多次出现） */
  nodeInstanceId?: string | null;
  /** 节点 tag（数据空间名） */
  tag: string;
  /** 组件注册类型名（httpRequest/condition/forLoop 等） */
  nodeType: string;
  /** 节点执行前数据树快照 */
  inputJson?: string | null;
  /** 节点执行后数据空间快照 */
  outputJson?: string | null;
  /** SUCCESS/FAILED */
  status: string;
  errorMsg?: string | null;
  startTime?: string;
  endTime?: string;
  duration?: number | null;
  /** 分支标记（IF=true/false、SWITCH=<nodeId>、LOOP=<轮次>，多段分号拼接） */
  branchInfo?: string | null;
  createTime?: string;
}

/**
 * 执行记录详情：总账 + 节点明细行。
 */
export interface ExecutionDetailVo {
  execution: DatabusExecutionVo;
  nodes: DatabusExecutionNodeVo[];
}

/**
 * 执行记录分页查询参数，与后端 DatabusExecutionBo + PageQuery 对齐。
 */
export interface DatabusExecutionQuery extends PageQuery {
  /** 链路编码（后端模糊匹配） */
  chainCode?: string;
  /** 执行状态精确匹配 */
  status?: string;
  /** 开始时间区间-起 yyyy-MM-dd HH:mm:ss */
  beginTime?: string;
  /** 开始时间区间-止 yyyy-MM-dd HH:mm:ss */
  endTime?: string;
}

/**
 * 手动执行请求，与后端 ManualExecuteBo 对齐。
 */
export interface ManualExecuteBo {
  /** 已发布链路 id */
  chainId: number | string;
  /** 执行入参 JSON 字符串（空串=空文档执行） */
  requestJson?: string;
}

/**
 * 执行结果，与后端 DatabusExecutionResult 对齐。
 */
export interface DatabusExecutionResult {
  /** 业务追踪号（UUID） */
  executionId: string;
  /** 总账记录主键（BASIC/FULL 档有值；OFF 档/试运行无记录为 null） */
  recordId?: number | string | null;
  chainId?: string;
  success: boolean;
  message?: string | null;
  contextJson?: string;
  startTime?: string;
  endTime?: string;
  costTime?: number;
  steps?: Array<{
    nodeId?: string;
    nodeName?: string;
    tag?: string;
    title?: string | null;
    success: boolean;
    errorMessage?: string | null;
    summary?: string | null;
    detailJson?: string | null;
    timeSpent?: number | null;
    startTime?: string;
    endTime?: string;
  }>;
}
