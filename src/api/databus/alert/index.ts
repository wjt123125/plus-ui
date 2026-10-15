import type { PageResult } from '@/api/types';
import type { AxiosPromise } from '@/utils/api-types';
import request from '@/utils/request';
import type {
  AlertEvaluateVo,
  DatabusAlertRecordQuery,
  DatabusAlertRecordVo,
  DatabusAlertRuleBo,
  DatabusAlertRuleQuery,
  DatabusAlertRuleVo
} from './types';

/**
 * 告警规则类型选项（与后端 AlertRuleTypeEnum 对齐，表单 select 与列表标签共用）。
 */
export const ALERT_RULE_TYPE_OPTIONS = [
  { value: 'CONSECUTIVE_FAILURE', label: '连续失败' },
  { value: 'SUCCESS_RATE', label: '成功率低于阈值' }
] as const;

/**
 * 通知渠道选项（与后端 AlertNotifyTypeEnum 对齐）。
 */
export const ALERT_NOTIFY_TYPE_OPTIONS = [
  { value: 'EMAIL', label: '邮件' },
  { value: 'WEBHOOK', label: 'Webhook' },
  { value: 'CHAIN', label: '通知链路' }
] as const;

/**
 * 分页查询告警规则
 * GET /databus/alert/rule/list（权限 databus:alert:query）
 */
export function listAlertRule(
  query?: DatabusAlertRuleQuery
): AxiosPromise<PageResult<DatabusAlertRuleVo>> {
  return request({
    url: '/databus/alert/rule/list',
    method: 'get',
    params: query
  });
}

/**
 * 查询告警规则详情
 * GET /databus/alert/rule/{id}（权限 databus:alert:query）
 */
export function getAlertRule(id: number | string): AxiosPromise<DatabusAlertRuleVo> {
  return request({
    url: '/databus/alert/rule/' + id,
    method: 'get'
  });
}

/**
 * 新增告警规则
 * POST /databus/alert/rule（权限 databus:alert:add）
 */
export function addAlertRule(data: DatabusAlertRuleBo) {
  return request({
    url: '/databus/alert/rule',
    method: 'post',
    data
  });
}

/**
 * 修改告警规则
 * PUT /databus/alert/rule（权限 databus:alert:edit）
 */
export function updateAlertRule(data: DatabusAlertRuleBo) {
  return request({
    url: '/databus/alert/rule',
    method: 'put',
    data
  });
}

/**
 * 删除告警规则（支持主键批量；记录保留便于历史追溯）
 * DELETE /databus/alert/rule/{ids}（权限 databus:alert:remove）
 */
export function delAlertRule(ids: number | string | Array<number | string>) {
  return request({
    url: '/databus/alert/rule/' + ids,
    method: 'delete'
  });
}

/**
 * 分页查询告警记录（历史告警，只读）
 * GET /databus/alert/record/list（权限 databus:alert:query）
 */
export function listAlertRecord(
  query?: DatabusAlertRecordQuery
): AxiosPromise<PageResult<DatabusAlertRecordVo>> {
  return request({
    url: '/databus/alert/record/list',
    method: 'get',
    params: query
  });
}

/**
 * 手动触发一次告警规则评估（定时任务每分钟自动执行）
 * POST /databus/alert/evaluate（权限 databus:alert:evaluate）
 */
export function evaluateAlert(): AxiosPromise<AlertEvaluateVo> {
  return request({
    url: '/databus/alert/evaluate',
    method: 'post'
  });
}