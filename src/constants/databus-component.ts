/**
 * 数据总线的组件域常量（与后端 `ComponentStatusEnum`、`ComponentConstants` 对齐）。
 */

/** 组件状态（databus_component.status）：草稿 / 启用 / 停用 */
export const DATABUS_COMPONENT_STATUS_DRAFT = 'DRAFT';

export const DATABUS_COMPONENT_STATUS_ENABLED = 'ENABLED';

export const DATABUS_COMPONENT_STATUS_DISABLED = 'DISABLED';

/** 组件来源（ComponentSource）：系统内置 / 覆盖 / 用户自建 */
export const DATABUS_COMPONENT_SOURCE_SYSTEM = 'SYSTEM';

export const DATABUS_COMPONENT_SOURCE_OVERLAY = 'OVERLAY';

export const DATABUS_COMPONENT_SOURCE_CUSTOM = 'CUSTOM';

/** 组件分类（ComponentCategory；未归类默认 PLATFORM，见 ComponentConstants.CATEGORY_DEFAULT） */
export const DATABUS_COMPONENT_CATEGORY_PROTOCOL = 'PROTOCOL';

export const DATABUS_COMPONENT_CATEGORY_DATA = 'DATA';

export const DATABUS_COMPONENT_CATEGORY_FLOW_CONTROL = 'FLOW_CONTROL';

export const DATABUS_COMPONENT_CATEGORY_AI = 'AI';

export const DATABUS_COMPONENT_CATEGORY_PLATFORM = 'PLATFORM';

/** 脚本语言（ComponentConstants.SCRIPT_LANG_*） */
export const DATABUS_COMPONENT_SCRIPT_LANG_JAVA = 'java';

/** 废弃标记（is_deprecated 列，ComponentConstants.DEPRECATED_*）：0 否 / 1 是 */
export const DATABUS_COMPONENT_DEPRECATED_NO = '0';

export const DATABUS_COMPONENT_DEPRECATED_YES = '1';
