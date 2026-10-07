/**
 * 组件台账工作台专属类型（2026-10-07 四栏重构）。
 * 通用壳类型在 ../../workbench/workbench.types；这里只放组件页业务结构。
 */
import type { ComponentSource } from '@/api/databus/component/types';
import type { WorkbenchTab } from '../../workbench/workbench.types';
import type { ComponentRegistryRow } from '../model/registry';

/** 左栏组件树选中的导航范围；中栏网格在此范围上再做关键字过滤 */
export type TreeScope =
  | { kind: 'all' }
  | { kind: 'unhealthy' }
  | { kind: 'recent' }
  | { kind: 'group'; key: string }
  /** business 组下钻的业务域（key 为 databus_component_domain.key） */
  | { kind: 'domain'; key: string }
  | { kind: 'code'; code: string };

/**
 * 「组件库」tab 的保留 key（卡片网格宿主）。
 * 与其它 tab 一样可关闭；点组件树的目录节点时重新打开并聚焦。
 */
export const GRID_TAB_KEY = '__grid';

/** 组件页右栏 tab 类型：组件库 / 查看 / 编辑 / 代码变更 */
export type ComponentTabKind = 'grid' | 'detail' | 'form' | 'changes';

/** 新建组件 tab 的目录上下文预设（由树目录节点右键「新建组件」携带） */
export interface FormPreset {
  group?: string;
  domain?: string | null;
}

export interface ComponentTab extends WorkbenchTab {
  kind: ComponentTabKind;
  /** 组件编码（新组件保存前为空串） */
  code: string;
  /** DB 行 id（编辑/代码变更必需） */
  dbId?: number;
  /** 当前脚本版本（代码变更 tab 高亮用） */
  version?: number | null;
  /** 仅新建 tab 使用：表单初始的分组/业务域 */
  preset?: FormPreset;
}

/** 最近访问虚拟节点存储项 */
export interface RecentComponent {
  code: string;
  name: string;
  source: ComponentSource;
  time: number;
}

/** 树节点运行/发布状态；优先级 error > draft > disabled > deprecated > new > normal（§2.1） */
export type TreeNodeStatus = 'normal' | 'new' | 'deprecated' | 'disabled' | 'draft' | 'error';

/** 树节点种类：虚拟导航（全部/异常/最近）、分组目录、业务域目录、叶子组件 */
export type TreeNodeKind = 'virtual' | 'group' | 'domain' | 'leaf';

/** 组件树节点。ComponentTree 构造、CmpTreeContextMenu 消费，故放共享类型 */
export interface ComponentTreeNode {
  id: string;
  label: string;
  kind: TreeNodeKind;
  /** 叶子专属：对应台账行（右键菜单的编辑/删除/启停都要读它） */
  row?: ComponentRegistryRow;
  /** 目录专属：右键「新建组件」携带的预设 */
  group?: string;
  domain?: string;
  /** 叶子图标（台账 icon，走 iconify ph 集）与着色 */
  icon?: string;
  color?: string;
  status?: TreeNodeStatus;
  statusClass?: string;
  /** 虚拟/目录节点右侧计数徽标 */
  badge?: number;
  badgeClass?: string;
  tip?: string;
  children?: ComponentTreeNode[];
}

/** 树右键菜单状态（宿主 ComponentTree 持有，CmpTreeContextMenu 只读渲染） */
export interface TreeMenuState {
  visible: boolean;
  x: number;
  y: number;
  node?: ComponentTreeNode;
}

/** 编辑面板保存/脚本发布后的回报载荷（新增时 id 由宿主按 code 从刷新后的台账解析） */
export interface ComponentSaved {
  id?: number;
  code: string;
  name: string;
  version?: number | null;
}
