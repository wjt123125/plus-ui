/**
 * 数据总线的市场域常量（与后端 `MarketConstants` 对齐）。
 */

/** 市场发布状态（MarketConstants.STATUS_*）：待审核 / 已上架 / 已下架 / 已驳回 */
export const DATABUS_MARKET_STATUS_PENDING = 'PENDING';

export const DATABUS_MARKET_STATUS_ONLINE = 'ONLINE';

export const DATABUS_MARKET_STATUS_OFFLINE = 'OFFLINE';

export const DATABUS_MARKET_STATUS_REJECTED = 'REJECTED';

/** 安装模式（MarketConstants.MODE_*）：FORK 复制副本 / SHARED 共享引用 */
export const DATABUS_MARKET_MODE_FORK = 'FORK';

export const DATABUS_MARKET_MODE_SHARED = 'SHARED';

/** 市场资源类型（MarketConstants.TYPE_*）：链路 / 组件 / 连接器 */
export const DATABUS_MARKET_RESOURCE_TYPE_CHAIN = 'CHAIN';

export const DATABUS_MARKET_RESOURCE_TYPE_COMPONENT = 'COMPONENT';

export const DATABUS_MARKET_RESOURCE_TYPE_CONNECTOR = 'CONNECTOR';

/** 链路安装级联明细状态（MarketConstants.CASCADE_*）：新建副本 / 复用既有 */
export const DATABUS_MARKET_CASCADE_NEW = 'NEW';

export const DATABUS_MARKET_CASCADE_REUSED = 'REUSED';
