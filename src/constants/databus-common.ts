/**
 * 数据总线跨域公共常量（与后端 `CommonConstants`、`OwnerTypeEnum` 对齐）。
 *
 * 只收「多个域共用同一字面量」的词表：归属类型、统一资源树的资源类型、模板标记、目录根 id，
 * 以及 AI 交互卡片的卡片类型。
 */

/** 归属类型（owner_type 列，OwnerTypeEnum）：SYSTEM 系统内置 / USER 用户创建 */
export const DATABUS_OWNER_TYPE_SYSTEM = 'SYSTEM';

export const DATABUS_OWNER_TYPE_USER = 'USER';

/** 统一资源树的资源类型（前端词汇，见 workbench.types 的 ResourceNodeType） */
export const DATABUS_RESOURCE_TYPE_CHAIN = 'chain';

export const DATABUS_RESOURCE_TYPE_COMPONENT = 'component';

export const DATABUS_RESOURCE_TYPE_DIRECTORY = 'directory';

export const DATABUS_RESOURCE_TYPE_CONNECTION = 'connection';

/** 市场引用叶子：SHARED 安装组件挂树后的节点类型 */
export const DATABUS_RESOURCE_TYPE_MARKET_REF = 'market-ref';

/** 系统组件叶子（无 DB 行，取 jar 注解） */
export const DATABUS_RESOURCE_TYPE_SYSTEM_LEAF = 'system-leaf';

/** 模板标记（is_template 列，CommonConstants.TEMPLATE_FLAG_*）：0 普通 / 1 精选模板 */
export const DATABUS_TEMPLATE_FLAG_NO = '0';

export const DATABUS_TEMPLATE_FLAG_YES = '1';

/** 通用是否标记（CommonConstants.FLAG_*）：Y 是 / N 否（enabled 等 Y/N 列） */
export const DATABUS_FLAG_YES = 'Y';

export const DATABUS_FLAG_NO = 'N';

/** 目录根节点的 parent_id（CommonConstants.ROOT_PARENT 的字符串形态） */
export const DATABUS_DIRECTORY_ROOT_ID = '0';

/** AI 交互卡片类型（AgentCard.kind）：确认 / 选择 / 引用 */
export const DATABUS_CARD_KIND_CONFIRM = 'confirm';

export const DATABUS_CARD_KIND_CHOICE = 'choice';

export const DATABUS_CARD_KIND_REF = 'ref';

/** 卡片回执里的「取消」保留动作：不对应任何选项，后端据此判定用户放弃这张卡 */
export const DATABUS_CARD_ACTION_CANCEL = 'cancel';
