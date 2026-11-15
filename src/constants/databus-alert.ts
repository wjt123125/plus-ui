/**
 * 数据总线的告警域常量（与后端 `AlertStatusEnum`、`AlertNotifyStatusEnum`、
 * `AlertNotifyTypeEnum`、`AlertConstants` 对齐）。
 */

/** 告警记录状态（databus_alert_record.status）：触发中 / 已恢复 */
export const DATABUS_ALERT_STATUS_FIRING = 'FIRING';

export const DATABUS_ALERT_STATUS_RECOVERED = 'RECOVERED';

/** 通知结果（AlertNotifyStatusEnum）：全部成功 / 部分成功 / 失败 / 未配置跳过 */
export const DATABUS_ALERT_NOTIFY_STATUS_SUCCESS = 'SUCCESS';

export const DATABUS_ALERT_NOTIFY_STATUS_PARTIAL = 'PARTIAL';

export const DATABUS_ALERT_NOTIFY_STATUS_FAILED = 'FAILED';

export const DATABUS_ALERT_NOTIFY_STATUS_SKIPPED = 'SKIPPED';

/** 通知渠道类型（AlertNotifyTypeEnum）：邮件 / Webhook / 链路 */
export const DATABUS_ALERT_NOTIFY_TYPE_EMAIL = 'EMAIL';

export const DATABUS_ALERT_NOTIFY_TYPE_WEBHOOK = 'WEBHOOK';

export const DATABUS_ALERT_NOTIFY_TYPE_CHAIN = 'CHAIN';

/** 记录投递状态（AlertConstants.STATUS_DISPATCHED）：已投递给通知通道 */
export const DATABUS_ALERT_DISPATCH_STATUS_DISPATCHED = 'DISPATCHED';
