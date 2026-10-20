/**
 * 工作区（单壳）专属类型（2026-10-17 工作区融合，workbench-unification.md）。
 * 通用壳类型在 ../../workbench/workbench.types；这里放工作区业务结构：
 * 五 kind tab 契约（grid 已废 2026-10-18；market 新增 2026-10-18）+ 统一资源树节点 + 收藏/最近访问条目。
 */
import type { ComponentSource } from '@/api/databus/component/types';
import type { DatabusChainVo } from '@/api/databus/chain/types';
import type { WorkbenchTab } from '../workbench/workbench.types';
import type { ComponentRegistryRow } from '../component/model/registry';

/**
 * 工作区 tab 形态（2026-10-20 管理页 tab 化扩展，databus-workspace-tabs.md §4.1）：
 * 链路画布 / 组件详情 / 组件编辑 / 代码变更 / 物料市场 / 物料详情（组件库 grid 已废 2026-10-18）
 * + 连接列表/连接对象 / 执行列表/执行记录 / 监控大盘 / 告警记录 / 设置（七值，key 规则见 §4.1）
 */
export type WorkspaceTabKind =
  | 'canvas'
  | 'detail'
  | 'form'
  | 'changes'
  | 'market'
  | 'market-detail'
  | 'connection-list'
  | 'connection-form'
  | 'execution-list'
  | 'execution-record'
  | 'monitor-overview'
  | 'alert-record'
  | 'settings';

/** 新建组件 tab 的预设上下文（目录右键「新建组件」携带） */
export interface FormPreset {
  group?: string;
  domain?: string | null;
  /** 归属目录 id（统一资源树目录节点右键新建组件时携带） */
  directoryId?: string | number | null;
}

/** 工作区 tab（多 kind 混排，key 规则见 workbench-unification.md §2.1） */
export interface WorkspaceTab extends WorkbenchTab {
  kind: WorkspaceTabKind;
  /** canvas：链路主键（同链单例判定） */
  chainId?: DatabusChainVo['id'];
  /** canvas：链路编码（执行终端展示用） */
  chainCode?: string;
  /** detail/form/changes：组件编码（detail 正本身份是 code，内置件亦适用）；canvas/market 为空串 */
  code: string;
  /** form/changes：组件 DB 行 id（编辑/代码变更必需） */
  dbId?: number;
  /** market-detail：物料主键（同 id 单例；pane 自取数，不走台账。雪花 id 超 2^53，故用字符串防精度丢失） */
  marketItemId?: string;
  /** changes：当前脚本版本 */
  version?: number | null;
  /** 仅新建 form tab 使用：表单初始分组/业务域/归属目录 */
  preset?: FormPreset;
  /** connection-form：连接主键（新建为 'new'） */
  formId?: number | 'new';
  /** execution-record：执行记录主键（雪花 id 超 2^53，故与 VO 同宽用字符串兜底） */
  recordId?: number | string;
}

/** 连接表单保存回报（新增时后端不回填主键，宿主据 isNew 关对象 tab 并刷新连接列表） */
export interface ConnectionSaved {
  connectionName: string;
  isNew: boolean;
}

/** 编辑面板保存/脚本发布后的回报载荷（新增时 id 由宿主按 code 从刷新后的台账解析） */
export interface ComponentSaved {
  id?: number;
  code: string;
  name: string;
  version?: number | null;
}

/** 资源生命周期轴（行尾色点）：草稿 / 已发布 / 已下线 */
export type ResourceLifecycle = 'draft' | 'published' | 'offline';

/** 资源装饰轴（字母码，可与生命周期并存、可多个）：异常 / 会话脏 / 废弃 */
export type ResourceMark = 'error' | 'modified' | 'deprecated';

/** 中栏空态导航（WorkbenchLauncher）派发的入口命令（打开类走右树定位，新建类走弹窗，市场开 tab） */
export type LauncherCommand =
  | 'recent'
  | 'favorite'
  | 'new-chain'
  | 'new-component'
  | 'new-directory'
  | 'system'
  | 'market'
  // 空态管理页入口卡（§8 步骤8「同步补 launcher 卡」，开对应功能 tab，先立后破防功能失踪）
  | 'admin-connection'
  | 'admin-execution'
  | 'admin-monitor'
  | 'admin-alert'
  | 'admin-settings';

/** 工作面板 tab 右键菜单命令（WorkspaceWorkPanel 派发；关闭族语义由 useWorkspaceTabs 承接，「窗口」族由宿主承接，§6.4） */
export type TabMenuCommand =
  | 'close'
  | 'close-others'
  | 'close-left'
  | 'close-right'
  | 'close-all'
  // 窗口族（§6.4）：新窗体打开 / 浏览器级全屏 / 壳内专注最大化
  | 'open-new'
  | 'toggle-full'
  | 'toggle-max';

/** 最近访问条目（跨类型；localStorage，零后端） */
export interface RecentResource {
  type: 'chain' | 'component';
  /** chain=链路主键；component=组件编码（对齐 detail 正本身份） */
  refId: string | number;
  title: string;
  /** 组件图标（链路无，前端按类型兜底） */
  icon?: string;
  time: number;
}

/**
 * 统一资源树节点形态（右抽屉树 tab）：
 * 收藏根 / 最近根 / 目录 / 未归组 / 系统根 / 系统分组
 * + 叶子：链路 / 自建组件 / 系统组件 / 收藏条目
 * —— 精选模板节已撤（2026-10-18 树瘦身，design §十二）：模板退役，探索诉求改由物料市场承担。
 */
export type ResourceNodeType =
  | 'favorite-root'
  | 'recent-root'
  | 'directory'
  | 'ungrouped'
  | 'system-root'
  | 'system-group'
  | 'chain'
  | 'component'
  | 'system-leaf'
  | 'favorite'
  | 'recent';

/** 统一资源树节点 */
export interface ResourceTreeNode {
  /** 行 id：dir:{id} / chain:{id} / cmp:{code} / sys:{code} / fav:{type}:{id} 等 */
  id: string;
  type: ResourceNodeType;
  label: string;
  /** 目录主键（directory/ungrouped 有效；ungrouped 为 null） */
  directoryId: string | number | null;
  children: ResourceTreeNode[];

  /* —— 链路 —— */
  chainId?: DatabusChainVo['id'];
  chainCode?: string;
  status?: string;

  /** 生命周期轴（行尾色点；容器取后代最差者，叶子按自身语义） */
  lifecycle?: ResourceLifecycle;
  /** 装饰轴（字母码，可并存；容器不挂，仅叶子） */
  marks?: ResourceMark[];

  /* —— 组件（自建/系统）—— */
  /** 组件 DB 行 id（自建件；系统件为 null，无 DB 行）；收藏/移动主键，故与资源 id 同宽 */
  dbId?: string | number | null;
  componentCode?: string;
  icon?: string;
  color?: string;
  source?: ComponentSource;
  disabled?: boolean;
  /** 台账合流行（组件右键编辑/删除/启停要读它；宿主据此派发） */
  row?: ComponentRegistryRow;

  /* —— 收藏条目 —— */
  favoriteType?: 'chain' | 'component';
  favoriteId?: string | number;

  /** 是否已收藏（叶子星标回显） */
  favorited?: boolean;
  /** 下辖叶子数徽标（目录/虚拟根；0 不渲染） */
  badge?: number;
  /** 悬停提示补充文案 */
  tip?: string;
}

/** 统一资源树右键菜单命令（两条旧菜单合并） */
export type ResourceMenuCommand =
  // 打开
  | 'open'
  // 链路
  | 'edit-chain'
  | 'copy-chain'
  | 'publish-chain'
  | 'offline-chain'
  | 'execute-chain'
  | 'delete-chain'
  // 组件
  | 'view-component'
  | 'edit-component'
  | 'changes-component'
  | 'toggle-component'
  | 'delete-component'
  // 分享（链路/组件共用，复制只读分享链接）
  | 'share-link'
  // 目录
  | 'add-chain'
  | 'add-component'
  | 'add-child'
  | 'rename'
  | 'remove-directory'
  // 归属移动（链路/组件通用）
  | 'move'
  // 收藏
  | 'favorite-add'
  | 'favorite-remove';

/** 右键菜单浮层状态（坐标已做视口夹取） */
export interface ResourceMenuState {
  visible: boolean;
  x: number;
  y: number;
  node: ResourceTreeNode | null;
}
