import type { AxiosPromise } from '@/utils/api-types';
import request from '@/utils/request';
import type {
  MetricAggregateVo,
  MonitorErrorStreamVo,
  MonitorOverviewVo,
  MonitorRankingVo,
  MonitorTrendPointVo
} from './types';

/**
 * 大盘概览卡片（当前窗口 + 上一等长窗口，前端自算环比）
 * GET /databus/monitor/overview（权限 databus:monitor:query）
 *
 * @param hours 窗口小时数，默认 24、上限 720
 */
export function monitorOverview(hours = 24): AxiosPromise<MonitorOverviewVo> {
  return request({
    url: '/databus/monitor/overview',
    method: 'get',
    params: { hours }
  });
}

/**
 * 趋势时间序列：窗口内按小时桶返回成功/失败次数与成功率、平均耗时
 * GET /databus/monitor/trend（权限 databus:monitor:query）
 *
 * @param hours 窗口小时数，默认 24、上限 720
 */
export function monitorTrend(hours = 24): AxiosPromise<MonitorTrendPointVo[]> {
  return request({
    url: '/databus/monitor/trend',
    method: 'get',
    params: { hours }
  });
}

/**
 * 三张排行榜：链路失败 / 节点耗时 / 错误热点
 * GET /databus/monitor/ranking（权限 databus:monitor:query）
 *
 * @param hours 窗口小时数，默认 24、上限 720
 * @param topN  每榜条数，默认 10、上限 50
 */
export function monitorRanking(hours = 24, topN = 10): AxiosPromise<MonitorRankingVo> {
  return request({
    url: '/databus/monitor/ranking',
    method: 'get',
    params: { hours, topN }
  });
}

/**
 * 实时错误流：最近若干条失败执行记录（不限窗口，读原始总账）
 * GET /databus/monitor/error-stream（权限 databus:monitor:query）
 *
 * @param limit 条数，默认 20、上限 100
 */
export function monitorErrorStream(limit = 20): AxiosPromise<MonitorErrorStreamVo[]> {
  return request({
    url: '/databus/monitor/error-stream',
    method: 'get',
    params: { limit }
  });
}

/**
 * 手动触发指标聚合（定时任务每小时自动执行，此入口供补算历史小时与验证）
 * POST /databus/monitor/aggregate（权限 databus:monitor:aggregate）
 *
 * @param hour 目标小时（yyyy-MM-ddTHH:mm:ss 或 yyyy-MM-dd HH:mm:ss），不传则聚合上一个完整小时
 */
export function monitorAggregate(hour?: string): AxiosPromise<MetricAggregateVo> {
  return request({
    url: '/databus/monitor/aggregate',
    method: 'post',
    params: hour ? { hour } : undefined
  });
}