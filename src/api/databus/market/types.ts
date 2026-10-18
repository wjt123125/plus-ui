/**
 * 物料市场（组件 / 链路市场）类型定义。
 * 设计正本：docs/databus-material-market.md；判例：.trae/decisions.md §九·三。
 * 三张表：databus_market_item（市场物料）/ databus_market_category（分类）/ databus_install（安装血缘）。
 */

/** 物料类型（组件 / 链路） */
export type MarketResourceType = 'COMPONENT' | 'CHAIN';

/** 上架状态机：草稿 → 待审 → 通过 / 驳回 → 上线 → 下线 */
export type MarketItemStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ONLINE' | 'OFFLINE';

/** 安装模式（同构引用层：收藏＝星标，fork＝快照落地） */
export type MarketInstallMode = 'FORK' | 'FAVORITE';

/** 市场物料（databus_market_item 行 + 消费侧附加标记） */
export interface DatabusMarketItemVo {
  id: string | number;
  /** 上架者（命名空间键） */
  ownerId?: string | number;
  ownerCode?: string;
  resourceType: MarketResourceType;
  /** 源资源 id */
  sourceId?: string | number;
  /** 展示码 `{ownerCode}/{code}` */
  codeDisplay: string;
  name: string;
  summary?: string;
  icon?: string;
  color?: string;
  categoryId?: string | number;
  tags?: string[];
  status: MarketItemStatus;
  /** 缓存计数（异步刷新）：安装数 / 被引用数 / fork 改后发布数 */
  installCount?: number;
  refCount?: number;
  forkPublishCount?: number;
  /** 当前用户是否已安装（列表接口回填） */
  installed?: boolean;
  /** 已装时本地副本 id（list 接口回填，供「使用」直达） */
  localResourceId?: string | number;
  /** 当前用户是否为本物料的原上架者（list/detail 接口回填） */
  mine?: boolean;
  /** 驳回理由（审核驳回时写入，通过则清空） */
  remark?: string;
  /** 审核人 id（治理留痕，通过 / 驳回均记） */
  reviewBy?: string | number;
  /** 审核时间 */
  reviewTime?: string;
  createTime?: string;
  updateTime?: string;
}

/** 市场分类（多级平表，前端组树） */
export interface DatabusMarketCategoryVo {
  id: string | number;
  parentId?: string | number;
  name: string;
  sort?: number;
  /** 分类下物料数（管理/浏览 chips 用） */
  itemCount?: number;
}

/** 安装 / 血缘记录（databus_install 行 + 展示字段） */
export interface DatabusMarketInstallVo {
  id: string | number;
  ownerId?: string | number;
  marketItemId?: string | number;
  /** 本地副本 id（链路主键 / 组件 DB 行 id） */
  localResourceId?: string | number;
  mode?: MarketInstallMode;
  contentHash?: string;
  createTime?: string;
  /* —— 展示字段（管理页行列表用，后端连表回填） —— */
  resourceType?: MarketResourceType;
  name?: string;
  summary?: string;
  icon?: string;
  color?: string;
  /** 本地副本启停态（组件停用=true） */
  enabled?: boolean;
}

/** 市场列表查询 */
export interface MarketQuery {
  resourceType?: MarketResourceType;
  categoryId?: string | number;
  /** 名称 / 编码 / 标签（复用资源树过滤口径） */
  keyword?: string;
  pageNum?: number;
  pageSize?: number;
}

/** 安装表单（fork：落快照 + 进我目录 + 记 installedFrom） */
export interface MarketInstallForm {
  /** 目标目录（null=未归组） */
  directoryId?: string | number | null;
}

/** 上架提交表单（供给侧，进待审） */
export interface MarketPublishForm {
  resourceType: MarketResourceType;
  /** 源资源 id（链路主键 / 组件 DB 行 id） */
  sourceId: string | number;
  summary?: string;
  categoryId?: string | number;
  tags?: string[];
}

/** 审核表单（后期 AI 介入审核） */
export interface MarketReviewForm {
  approved: boolean;
  /** 驳回理由（approved=false 时） */
  reason?: string;
}
