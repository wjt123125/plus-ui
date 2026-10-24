/**
 * 物料市场（组件 / 链路市场）类型定义。
 * 设计正本：docs/databus-material-market.md；判例：.trae/decisions.md §九·三。
 * 三张表：databus_market_item（市场物料）/ databus_market_category（分类）/ databus_install（安装血缘）。
 */

/** 物料类型（组件 / 链路 / 连接器——连接器安装语义＝enable，不写 databus_install，§15.3） */
export type MarketResourceType = 'COMPONENT' | 'CHAIN' | 'CONNECTOR';

/** 源资源选择器三型（施工清单 d2）：市场两型 + 连接器（包上传型，接 defs 端点） */
export type SelectorResourceType = MarketResourceType;

/** 上架状态机：草稿 → 待审 → 通过 / 驳回 → 上线 → 下线 */
export type MarketItemStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ONLINE' | 'OFFLINE';

/** 安装模式（同构引用层：收藏＝星标，fork＝链路快照落地，shared＝组件共享注册不落副本） */
export type MarketInstallMode = 'FORK' | 'SHARED' | 'FAVORITE';

/** 市场物料（databus_market_item 行 + 消费侧附加标记） */
export interface DatabusMarketItemVo {
  id: string | number;
  /** 上架者（命名空间键） */
  ownerId?: string | number;
  ownerCode?: string;
  resourceType: MarketResourceType;
  /** 源资源 id（链路主键 / 组件 DB 行 id / 连接器 def 行 id） */
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
  /** 已装时本地副本 id（链路/组件为副本行 id；连接器为 def 行 id，供启停/卸载匹配） */
  localResourceId?: string | number;
  /** 当前用户是否为本物料的原上架者（list/detail 接口回填） */
  mine?: boolean;
  /** 驳回理由（审核驳回时写入，通过则清空） */
  remark?: string;
  /** 修改说明（P1 驳回-重提闭环：作者被驳回后重提时填写，审核者复核时展示） */
  modifyNote?: string;
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

/** 安装级联清单条目（decisions §十四-2 链路全 fork：闭包内子链随主链一并复制/复用） */
export interface MarketInstallCascadeItem {
  /** 源链路编码（市场物料口径） */
  sourceCode: string;
  /** 安装者目录内的新（或复用）链路编码 */
  newCode: string;
  /** 源链路名称（展示，缺省回退编码） */
  sourceName?: string;
  /** NEW＝本次新复制；REUSED＝命中既有同源副本直接复用 */
  status: 'NEW' | 'REUSED';
}

/** 安装 / 血缘记录（databus_install 行 + 展示字段） */
export interface DatabusMarketInstallVo {
  id: string | number;
  ownerId?: string | number;
  marketItemId?: string | number;
  /** 本地副本 id（链路主键 / 组件 DB 行 id） */
  localResourceId?: string | number;
  mode?: MarketInstallMode;
  /** 目录归属（组件 SHARED 引用挂树；null=未归组） */
  directoryId?: string | number | null;
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
  /** 组件编码（SHARED 引用叶子 open 通道：按 code 反查台账行） */
  componentCode?: string;
  /** 级联清单（仅 CHAIN 安装返回，decisions §十四-2）：主链＋全部级联子链，post-order 序主链居末；
   *  级联子链副本是安装者目录里的普通顶层链不写台账，主链仍以本行记录血缘 */
  cascade?: MarketInstallCascadeItem[];
}

/** 市场列表查询 */
export interface MarketQuery {
  resourceType?: MarketResourceType;
  categoryId?: string | number;
  /** 名称 / 编码 / 标签（复用资源树过滤口径） */
  keyword?: string;
  /** 作者登录名等值过滤（点卡片 @作者 筛选其作品；空=全部） */
  ownerCode?: string;
  pageNum?: number;
  pageSize?: number;
}

/** 安装表单（链路＝fork 快照进我目录；组件＝共享注册 + 引用挂树目录归属） */
export interface MarketInstallForm {
  /** 目标目录（null=未归组；链路为副本目录，组件为引用叶子归属） */
  directoryId?: string | number | null;
}

/** 上架提交表单（供给侧，进待审） */
export interface MarketPublishForm {
  resourceType: MarketResourceType;
  /** 源资源 id（链路主键 / 组件 DB 行 id / 连接器 def 行 id） */
  sourceId: string | number;
  summary?: string;
  categoryId?: string | number;
  tags?: string[];
  /** 修改说明（P1 驳回-重提闭环：被驳回后重提时填写） */
  modifyNote?: string;
}

/** 批量提审表单（decisions §十四-6 发布引导：链路发布后闭包内未上架自有物料整批提交） */
export interface MarketPublishBatchForm {
  items: MarketPublishForm[];
}

/** 审核表单（后期 AI 介入审核） */
export interface MarketReviewForm {
  approved: boolean;
  /** 驳回理由（approved=false 时） */
  reason?: string;
}

/** 画布节点概要（P1 审核预览：审核者可见的链路骨架，不携带实现细节） */
export interface MarketReviewNodePreview {
  type?: string;
  code?: string;
  name?: string;
  /** true=EL 结构关键字（THEN/IF/CHAIN…），false=业务组件/链引用叶子 */
  structure?: boolean;
  /** 引用层级（根 0，children/condition 逐级 +1；实现页按此缩进还原树形） */
  depth?: number;
}

/** 审核内容预览（P1 解「干审」：CHAIN=画布节点清单，COMPONENT=关键信息） */
export interface MarketReviewPreview {
  /** 画布节点清单（仅 CHAIN） */
  nodes?: MarketReviewNodePreview[];
  /** 源资源编码（COMPONENT＝组件编码，前端按 code 开组件详情 tab；CHAIN 为空——链路按 sourceId 开画布） */
  code?: string;
  /** 作者（COMPONENT：上架者展示码） */
  author?: string;
  /** 版本（COMPONENT） */
  version?: string;
  /** 脚本语言（COMPONENT） */
  scriptLang?: string;
  /** 描述（COMPONENT） */
  description?: string;
}

/** 实现预览（2026-10-24 装前可看）：组件＝脚本与契约、链路＝节点清单；仅 ONLINE 物料开放 */
export interface MarketPreviewVo {
  resourceType: MarketResourceType;
  /** 链路源 id（「打开只读画布」用；组件为空） */
  chainId?: string | number;
  /** 组件编码 */
  code?: string;
  version?: string;
  scriptLang?: string;
  /** 描述（组件取组件描述，链路取链路备注） */
  description?: string;
  /** 组件脚本正文（CHAIN 为空；上架即公开） */
  scriptBody?: string;
  /** 配置参数 / 输入 / 输出 Schema（JSON 原文，只读展示） */
  paramSchema?: string;
  inputSchema?: string;
  outputSchema?: string;
  /** 链路节点清单（仅 CHAIN，口径与审核预览同源） */
  nodes?: MarketReviewNodePreview[];
}

/** 审核详情（decisions §十四-7 嵌套审核：主体 item + 闭包依赖状态树 + P1 内容预览） */
export interface MarketReviewDetailVo {
  /** 受审主体物料行 */
  item?: DatabusMarketItemVo;
  /** 闭包依赖状态树（链＋组件；主链自身即主体不重复列出） */
  dependencies?: MarketReviewDependency[];
  /** 内容预览（P1） */
  preview?: MarketReviewPreview;
}

/** 依赖状态条目：一项闭包依赖（链或组件）的市场状态 */
export interface MarketReviewDependency {
  /** 依赖类型（CHAIN / COMPONENT） */
  resourceType?: MarketResourceType;
  /** 源资源 id（悬空引用为 null） */
  sourceId?: string | number;
  /** 源资源编码（链 chainCode / 组件 componentCode；悬空组件为引用编码）——「查看」跳 tab 的钥匙 */
  code?: string;
  /** 名称（悬空退化为引用编码） */
  name?: string;
  /** 对应市场物料 id（未上架为 null） */
  marketItemId?: string | number;
  /** 市场物料上架者 id（闭包联审：就地审依赖时判禁自审，owner=当前用户隐藏按钮） */
  ownerId?: string | number;
  /** 市场状态（ONLINE / PENDING / REJECTED / OFFLINE；null=未上架） */
  marketStatus?: MarketItemStatus | null;
  /** 审核备注（REJECTED 时为驳回理由） */
  remark?: string;
  /** 修改说明（P1 驳回-重提闭环：作者重提时填写） */
  modifyNote?: string;
  /** 引用树缩进层级（闭包联审：主链直接依赖为 1，逐级 +1；前端按 depth 缩进渲染） */
  depth?: number;
  /** 前置未过审依赖名清单（仅 CHAIN：其闭包内未 ONLINE 的成员；空=可直接审。行内提示「需先通过：××」） */
  blockedBy?: string[];
}
