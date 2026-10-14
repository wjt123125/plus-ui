/**
 * 数据总线告警管理相关类型，与后端 org.dromara.databus.domain.{bo,vo} 的 Alert* 系列对齐。
 * 规则 CRUD + 记录只读查询 + 手动评估。
 */

/**
 * 告警规则类型（与后端 AlertRuleTypeEnum 对齐）。
 * CONSECUTIVE_FAILURE：窗口内最近 N 次执行全部失败；SUCCESS_RATE：窗口内成功率低于阈值。
 */
export type AlertRuleType = 'CONSECUTIVE_FAILURE' | 'SUCCESS_RATE';

/**
 * 告警记录状态（与后端 AlertStatusEnum 对齐）。
 */
export type AlertStatus = 'FIRING' | 'RECOVERED';

/**
 * 通知结果（与后端 AlertNotifyStatusEnum 对齐）。
 */
export type AlertNotifyStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';

/**
 * 告警规则 VO，与后端 DatabusAlertRuleVo 对齐。
 */
export interface DatabusAlertRuleVo {
  /** 主键 id（雪花 id，Long 超 JS 安全整数时序列化为字符串） */
  id?: number | string;
  /** 规则名称 */
  ruleName: string;
  /** 目标链路编码 */
  chainCode: string;
  /** 规则类型 */
  ruleType: string;
  /** 评估窗口（分钟） */
  windowMinutes: number;
  /** 连续失败次数阈值（CONSECUTIVE_FAILURE 用） */
  thresholdCount?: number | null;
  /** 成功率下限百分比（SUCCESS_RATE 用，0-100） */
  thresholdRate?: number | string | null;
  /** 通知邮箱（多个用逗号或分号分隔） */
  notifyEmails: string;
  /** 是否启用（Y/N） */
  enabled?: string;
  /** 备注 */
  remark?: string;
  /** 创建时间 */
  createTime?: string;
  /** 更新时间 */
  updateTime?: string;
}

/**
 * 新增/修改告警规则入参，与后端 DatabusAlertRuleBo 对齐。
 */
export type DatabusAlertRuleBo = Omit<DatabusAlertRuleVo, 'createTime' | 'updateTime'>;

/**
 * 告警规则分页查询参数，与后端 list 端点支持的过滤字段对齐。
 */
export interface DatabusAlertRuleQuery extends PageQuery {
  /** 规则名称（后端模糊匹配） */
  ruleName?: string;
  /** 目标链路编码（后端模糊匹配） */
  chainCode?: string;
  /** 规则类型（精确匹配） */
  ruleType?: string;
  /** 是否启用（Y/N，精确匹配） */
  enabled?: string;
}

/**
 * 告警记录 VO，与后端 DatabusAlertRecordVo 对齐（只读历史）。
 */
export interface DatabusAlertRecordVo {
  /** 主键 id */
  id: number | string;
  /** 规则 id */
  ruleId: number | string;
  /** 规则名称（触发时快照） */
  ruleName?: string | null;
  /** 目标链路编码（触发时快照） */
  chainCode?: string | null;
  /** 告警类型（触发时快照） */
  alertType: string;
  /** 状态（FIRING / RECOVERED） */
  status: string;
  /** 告警摘要 */
  message?: string | null;
  /** 通知对象（触发时快照） */
  notifyEmails?: string | null;
  /** 通知结果（SUCCESS / FAILED / SKIPPED） */
  notifyStatus?: string | null;
  /** 触发时间 */
  triggerTime?: string;
  /** 恢复时间（FIRING 时为空） */
  recoverTime?: string | null;
}

/**
 * 告警记录分页查询参数，与后端 DatabusAlertRecordBo 对齐。
 */
export interface DatabusAlertRecordQuery extends PageQuery {
  /** 规则名称（后端模糊匹配） */
  ruleName?: string;
  /** 目标链路编码（后端模糊匹配） */
  chainCode?: string;
  /** 告警类型（精确匹配） */
  alertType?: string;
  /** 状态（精确匹配） */
  status?: string;
  /** 触发时间区间-起 yyyy-MM-dd HH:mm:ss */
  beginTime?: string;
  /** 触发时间区间-止 yyyy-MM-dd HH:mm:ss */
  endTime?: string;
}

/**
 * 告警规则评估结果，与后端 AlertEvaluateVo 对齐。
 */
export interface AlertEvaluateVo {
  /** 本次扫描的启用规则数 */
  ruleCount: number;
  /** 新触发（插入 FIRING 记录）的规则数 */
  firedCount: number;
  /** 恢复（翻转 FIRING 记录为 RECOVERED）的规则数 */
  recoveredCount: number;
  /** 触发通知发送成功数 */
  notifySuccess: number;
  /** 触发通知发送失败数（含邮件通道未启用） */
  notifyFailed: number;
  /** 评估总耗时（毫秒） */
  costMillis: number;
}