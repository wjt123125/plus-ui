/**
 * 链路工作台（chain workbench）类型定义。
 *
 * 与组件工作台（component/workbench）同构：tab 即会话，仅存内存，离开路由即清空。
 * 链路工作台的 tab 目前只有一种形态：链路画布（canvas），与链路一一对应。
 */
import type { DatabusChainVo } from '@/api/databus/chain/types';

/** tab 形态：目前仅画布（未来可扩展「发布记录」等只读面板形态） */
export type ChainTabKind = 'canvas';

/** 链路工作台 tab 条目 */
export interface ChainTab {
  /** 唯一键：`canvas:{chainId}`（同链单例的判定依据） */
  key: string;
  /** tab 形态 */
  kind: ChainTabKind;
  /** 链路主键（19 位雪花 id 保字符串防精度丢失） */
  chainId: DatabusChainVo['id'];
  /** tab 标题 = 链路名 */
  title: string;
  /** 未保存改动标记（tab 条脏圆点） */
  dirty: boolean;
}

/** 链树节点（渲染用扁平行之前的树形中间结构） */
export interface ChainTreeNode {
  /** 行 id：`dir:{id}` / `chain:{id}` / `tpl:{id}` / `ungrouped` / `templates` */
  id: string;
  /** 节点形态：directory 目录 / chain 普通链路 / ungrouped 未归组虚拟根 /
   *  template 精选模板链路 / template-root 精选模板虚拟根 */
  type: 'directory' | 'chain' | 'ungrouped' | 'template' | 'template-root';
  /** 显示名（目录名/链路名/虚拟根固定名） */
  label: string;
  /** 目录主键（directory/ungrouped 有效；ungrouped 为 null） */
  directoryId: string | number | null;
  /** 链路主键（chain/template） */
  chainId: DatabusChainVo['id'];
  /** 链路编码（chain/template；右键「复制链路编码」用） */
  chainCode?: string;
  /** 链路状态（chain/template：0草稿 1已发布 2已下线，用于行尾状态色点；模板恒草稿不显点） */
  status?: string;
  /** 模板说明（仅 template；悬停 title 展示） */
  templateDesc?: string;
  /** 子节点（目录树 + 目录下链路；ungrouped 挂未归组链路；template-root 挂精选模板） */
  children: ChainTreeNode[];
}

/** 右键菜单命令（链树） */
export type ChainTreeMenuCommand =
  | 'add-child'
  | 'add-chain'
  | 'rename'
  | 'remove-directory'
  | 'move-chain'
  | 'open-chain'
  | 'edit-chain'
  | 'copy-chain'
  | 'publish-chain'
  | 'offline-chain'
  | 'execute-chain'
  | 'delete-chain'
  | 'use-template';

/**
 * 链路业务动作命令（树不闭环，emit 上抛 workbench/index.vue 处理：
 * 弹窗/API/tab 联动/执行终端；区别于树内自闭环的目录命令）
 */
export type ChainTreeActionCommand = Exclude<
  ChainTreeMenuCommand,
  // 树内吸收：目录 CRUD/移动/打开；add-chain 由树转 add-chain 事件（携带 directoryId）给工作台
  'add-child' | 'add-chain' | 'rename' | 'remove-directory' | 'move-chain' | 'open-chain'
>;

/** 链树右键菜单浮层状态（坐标已做视口夹取） */
export interface ChainTreeMenuState {
  visible: boolean;
  x: number;
  y: number;
  node: ChainTreeNode | null;
}
