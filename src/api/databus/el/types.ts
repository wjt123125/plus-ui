/**
 * LiteFlow 画布组件树，与后端 org.dromara.databus.el.bean.CmpProperty 对齐。
 *
 * 叶子节点（普通组件）：{ id, type: 'NodeComponent', properties: { tag, data } }
 * 编排节点：{ type: 'THEN' | 'WHEN' | 'IF' ..., properties: { id, tag }, children: [] }
 */
export interface CmpProperty {
  id?: string;
  type: string;
  properties?: CmpProperties | null;
  condition?: CmpProperty | null;
  children?: CmpProperty[];
}

export interface CmpProperties {
  id?: string;
  tag?: string;
  data?: string;
  /** 算子出口 label 自定义（按 branchIndex 存）；前端编辑态字段，
   *  序列化时写入算子 properties.outletLabels，后端往返需保留未知字段 */
  outletLabels?: string[];
}

/**
 * EL 表达式信息，与后端 org.dromara.databus.el.bean.ELInfo 对齐。
 */
export interface ELInfo {
  chainId?: string;
  elStr?: string;
}

/**
 * 试运行入参，与后端 org.dromara.databus.domain.bo.PreviewRunBo 对齐。
 */
export interface PreviewRunBo {
  /** 画布组件树（后端先转 EL、校验，再按 EL 真执行） */
  jsonEl: CmpProperty;
  /** 链路入参 JSON 字符串，解析后作为上下文文档根；默认 "{}" */
  requestJson?: string;
}

/**
 * 单节点执行步骤，与后端 DatabusExecutionResult.NodeStep 对齐。
 */
export interface NodeStep {
  /** LiteFlow nodeId（组件注册名，可重复） */
  nodeId?: string;
  nodeName?: string;
  /** 数据空间名（组件 tag） */
  tag?: string;
  success?: boolean;
  errorMessage?: string;
  /** 耗时毫秒 */
  timeSpent?: number;
  startTime?: string;
  endTime?: string;
}

/**
 * 试运行结果，与后端 org.dromara.databus.domain.vo.PreviewRunVo 对齐。
 * 无论生成/校验/执行成败，HTTP 均为 200，由 success/errorMessage 区分。
 */
export interface PreviewRunVo {
  elStr?: string;
  valid?: boolean;
  message?: string;
  executed?: boolean;
  success?: boolean;
  steps?: NodeStep[];
  contextJson?: string;
  errorMessage?: string;
}
