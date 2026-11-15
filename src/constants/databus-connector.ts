/**
 * 数据总线的连接器域常量（与后端 `ConnectorDefStatusEnum`、`ConnectorConstants` 对齐）。
 */

/** 连接器运行层状态（databus_connector_def.status）：待审核 / 启用 / 停用 / 废弃（终态） */
export const DATABUS_CONNECTOR_DEF_STATUS_PENDING = 'PENDING';

export const DATABUS_CONNECTOR_DEF_STATUS_ENABLED = 'ENABLED';

export const DATABUS_CONNECTOR_DEF_STATUS_DISABLED = 'DISABLED';

export const DATABUS_CONNECTOR_DEF_STATUS_DEPRECATED = 'DEPRECATED';

/** 连接器来源（ConnectorConstants.SOURCE_*，databus_connector_def.source）：开发目录装载 / 手动上传 / 官方 */
export const DATABUS_CONNECTOR_SOURCE_DEV = 'DEV';

export const DATABUS_CONNECTOR_SOURCE_UPLOAD = 'UPLOAD';

export const DATABUS_CONNECTOR_SOURCE_ADMIN = 'ADMIN';
