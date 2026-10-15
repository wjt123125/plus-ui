/**
 * 数据总线监控大盘相关类型，与后端 org.dromara.databus.domain.vo 的 Monitor* 系列对齐。
 * 数据来源：小时聚合宽表（databus_metric_*_hourly）；实时错误流读原始总账 databus_execution。
 */

/**
 * 大盘概览卡片：当前窗口 + 上一等长窗口（前端自算环比）。
 * 两窗口首尾相接、口径一致：当前 [begin, end)，上一 [begin - span, begin)。
 */
export interface MonitorOverviewVo {
  /** 统计窗口小时数 */
  hours: number;
  /** 当前窗口起点（含） */
  begin?: string;
  /** 当前窗口终点（不含，即当前整点） */
  end?: string;
  /** 当前窗口总执行次数 */
  totalCount: number;
  /** 当前窗口成功次数 */
  successCount: number;
  /** 当前窗口失败次数 */
  failedCount: number;
  /** 当前窗口成功率（百分比，两位）；无样本为 null */
  successRate?: number | string | null;
  /** 当前窗口加权平均耗时（毫秒）；无样本为 null */
  avgDuration?: number | null;
  /** 当前窗口 P95 耗时（毫秒）。小时桶分位不可跨桶加权，取窗口内各链路-小时桶的最劣值；无样本为 null */
  p95Duration?: number | null;
  /** 当前窗口 P99 耗时（毫秒，口径同 P95）；无样本为 null */
  p99Duration?: number | null;
  /** 当前窗口有执行的链路数（活跃链路） */
  activeChainCount?: number | null;
  /** 当前处于 FIRING 状态的告警数（时点值，非窗口统计，无环比） */
  firingAlertCount?: number | null;
  /** 上一窗口总执行次数 */
  prevTotalCount: number;
  /** 上一窗口成功次数 */
  prevSuccessCount: number;
  /** 上一窗口失败次数 */
  prevFailedCount: number;
  /** 上一窗口成功率（百分比，两位）；无样本为 null */
  prevSuccessRate?: number | string | null;
  /** 上一窗口加权平均耗时（毫秒）；无样本为 null */
  prevAvgDuration?: number | null;
  /** 上一窗口 P95 耗时（毫秒，口径同当前窗口）；无样本为 null */
  prevP95Duration?: number | null;
  /** 上一窗口 P99 耗时（毫秒）；无样本为 null */
  prevP99Duration?: number | null;
  /** 上一窗口有执行的链路数 */
  prevActiveChainCount?: number | null;
}

/**
 * 趋势时间序列点（按小时桶；全链路合并口径）。
 */
export interface MonitorTrendPointVo {
  /** 小时桶（整点） */
  statHour: string;
  /** 该小时总执行次数 */
  totalCount: number;
  /** 该小时成功次数 */
  successCount: number;
  /** 该小时失败次数 */
  failedCount: number;
  /** 该小时成功率（百分比，两位）；无样本为 null */
  successRate?: number | string | null;
  /** 该小时加权平均耗时（毫秒）；无样本为 null */
  avgDuration?: number | null;
  /** 该小时 P95 耗时（毫秒）。桶内多链路的 P95 不可跨链加权合并，取桶内各链路的最劣值 */
  p95Duration?: number | null;
  /** 该小时 P99 耗时（毫秒，口径同 P95） */
  p99Duration?: number | null;
  /** 该小时最长单次执行耗时（毫秒） */
  maxDuration?: number | null;
  /** 该小时有执行的链路数（活跃链路） */
  chainCount?: number | null;
}

/**
 * 链路健康行：窗口内每个有执行的链路一行的量质速度全景。
 */
export interface ChainHealthVo {
  /** 链路编码 */
  chainCode: string;
  /** 窗口内总执行次数 */
  totalCount: number;
  /** 窗口内成功次数 */
  successCount: number;
  /** 窗口内失败次数 */
  failedCount: number;
  /** 窗口内成功率（百分比，两位）；无样本为 null */
  successRate?: number | string | null;
  /** 窗口内加权平均耗时（毫秒）；无样本为 null */
  avgDuration?: number | null;
  /** 窗口内 P95 耗时（毫秒，各小时桶最劣值）；无样本为 null */
  p95Duration?: number | null;
}

/**
 * 链路失败排行榜行。
 */
export interface ChainFailureRankVo {
  /** 链路编码 */
  chainCode: string;
  /** 窗口内总执行次数 */
  totalCount: number;
  /** 窗口内成功次数 */
  successCount: number;
  /** 窗口内失败次数 */
  failedCount: number;
  /** 窗口内成功率（百分比，两位）；无样本为 null */
  successRate?: number | string | null;
  /** 窗口内加权平均耗时（毫秒）；无样本为 null */
  avgDuration?: number | null;
}

/**
 * 节点耗时排行榜行。
 */
export interface NodeSlowRankVo {
  /** 链路编码 */
  chainCode: string;
  /** 节点标签（组件 tag） */
  tag: string;
  /** 节点类型（组件类名/节点类型） */
  nodeType: string;
  /** 窗口内节点调用次数 */
  totalCount: number;
  /** 窗口内节点失败次数 */
  failedCount: number;
  /** 窗口内加权平均耗时（毫秒）；无样本为 null */
  avgDuration?: number | null;
  /** 窗口内最大耗时（毫秒） */
  maxDuration?: number | null;
}

/**
 * 错误热点排行榜行。
 */
export interface ErrorHotRankVo {
  /** 链路编码 */
  chainCode: string;
  /** 错误指纹（归一化摘要，去数字噪声） */
  errorFingerprint: string;
  /** 原始错误样本（截断 500 字符） */
  errorSample?: string | null;
  /** 窗口内该指纹发生次数 */
  happenCount: number;
}

/**
 * 三张排行榜聚合返回体。
 */
export interface MonitorRankingVo {
  /** 统计窗口小时数 */
  hours: number;
  /** 每榜条数上限 */
  topN: number;
  /** 链路失败排行（失败次数倒序） */
  chainFailures: ChainFailureRankVo[];
  /** 节点耗时排行（平均耗时倒序） */
  slowNodes: NodeSlowRankVo[];
  /** 错误热点排行（发生次数倒序） */
  hotErrors: ErrorHotRankVo[];
}

/**
 * 实时错误流条目（读原始总账，不限窗口）。
 */
export interface MonitorErrorStreamVo {
  /** 执行记录 id */
  id: number | string;
  /** 链路编码 */
  chainCode: string;
  /** 执行状态（流内固定 FAILED） */
  status: string;
  /** 错误信息 */
  errorMsg?: string | null;
  /** 执行开始时间 */
  startTime?: string;
  /** 执行耗时（毫秒） */
  duration?: number | null;
}

/**
 * 指标小时聚合结果（手动触发端点返回）。
 */
export interface MetricAggregateVo {
  /** 本次聚合的目标小时桶（整点） */
  statHour: string;
  /** 写入的链路级聚合行数 */
  chainRows: number;
  /** 写入的节点级聚合行数 */
  nodeRows: number;
  /** 写入的错误聚合行数 */
  errorRows: number;
  /** 聚合耗时（毫秒） */
  costMillis: number;
}