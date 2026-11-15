/**
 * 数据总线的链路域常量（与后端 `ChainStatusEnum`、`LogLevelEnum`、`ChainConstants` 对齐）。
 */

/** 链路生命周期（databus_chain.status）：草稿 / 已发布 / 已下线 */
export const DATABUS_CHAIN_STATUS_DRAFT = 'DRAFT';

export const DATABUS_CHAIN_STATUS_ENABLED = 'ENABLED';

export const DATABUS_CHAIN_STATUS_DISABLED = 'DISABLED';

/** 子流程引用节点的组件类型（defType，对应后端 ChainConstants.CHAIN_REF_TYPE） */
export const DATABUS_CHAIN_DEF_TYPE = 'CHAIN';

/** 执行记录档位（LogLevelEnum，databus_chain.log_level）：关闭 / 基础 / 完整 */
export const DATABUS_LOG_LEVEL_OFF = 'OFF';

export const DATABUS_LOG_LEVEL_BASIC = 'BASIC';

export const DATABUS_LOG_LEVEL_FULL = 'FULL';
