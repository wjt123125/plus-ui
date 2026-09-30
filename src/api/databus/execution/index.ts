import type { PageResult } from '@/api/types';
import type { AxiosPromise } from '@/utils/api-types';
import request from '@/utils/request';
import type {
  DatabusExecutionQuery,
  DatabusExecutionResult,
  DatabusExecutionVo,
  ExecutionCleanupResult,
  ExecutionDetailVo,
  ManualExecuteBo
} from './types';

/**
 * 分页查询执行记录
 * GET /databus/execution/list（权限 databus:execution:list）
 */
export function listExecution(
  query?: DatabusExecutionQuery
): AxiosPromise<PageResult<DatabusExecutionVo>> {
  return request({
    url: '/databus/execution/list',
    method: 'get',
    params: query
  });
}

/**
 * 查询执行记录详情（总账 + FULL 档节点明细行）
 * GET /databus/execution/{id}（权限 databus:execution:query）
 */
export function getExecution(id: number | string): AxiosPromise<ExecutionDetailVo> {
  return request({
    url: '/databus/execution/' + id,
    method: 'get'
  });
}

/**
 * 手动执行已发布链路（走正式通道，按 log_level 落新记录）
 * POST /databus/execution/execute（权限 databus:execution:execute）
 * 执行成败均 200，看 res.data.success。
 */
export function executeChain(data: ManualExecuteBo) {
  return request({
    url: '/databus/execution/execute',
    method: 'post',
    data
  });
}

/**
 * 重跑：以历史记录入参再执行一次，产生新记录（原记录不变）
 * POST /databus/execution/rerun/{id}（权限 databus:execution:execute）
 */
export function rerunExecution(id: number | string): AxiosPromise<DatabusExecutionResult> {
  return request({
    url: '/databus/execution/rerun/' + id,
    method: 'post'
  });
}

/**
 * 手动触发保留期清理（定时任务每天凌晨按配置自动执行，此入口供即时清理）
 * POST /databus/execution/cleanup（权限 databus:execution:remove）
 *
 * @param retentionDays 保留天数覆盖；不传由后端取配置（默认 30 天）
 */
export function cleanupExecution(
  retentionDays?: number
): AxiosPromise<ExecutionCleanupResult> {
  return request({
    url: '/databus/execution/cleanup',
    method: 'post',
    params: retentionDays != null ? { retentionDays } : undefined
  });
}
