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
  /** 节点标题（用户填写的业务名，留空则前端按组件类型 + cfg 实时推断默认）；
   *  前端编辑态字段，不参与 EL 生成；后端透传到 NodeStep.title */
  title?: string;
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
  /** 节点标题（画布上用户填写的业务名；未填为 null，前端再按 cfg 推断默认） */
  title?: string;
  success?: boolean;
  errorMessage?: string;
  /** 耗时毫秒 */
  timeSpent?: number;
  startTime?: string;
  endTime?: string;
  /** 组件自报的人话执行结果（未报时前端兜底显示「完成」） */
  summary?: string;
  /** 该步数据空间 $.<tag> 子树的当场 JSON 快照（条件组件为 {conditionResult}） */
  detailJson?: string;
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
