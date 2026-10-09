/**
 * 右侧抽屉「名片」端口。
 *
 * 右侧抽屉（EditorDrawer）已从 ChainCanvasPane 内部提升为工作台/外壳级单例：
 * 它处在每个画布 Pane 的组件树之外，inject 不到任何 Pane provide 的
 * treeModel / elPreview / vue-flow 实例。因此由**当前激活的 Pane**把一张
 * 「名片」（DrawerPort）上报到本模块的单例 activePort，抽屉只读激活 Pane 的数据。
 *
 * - 不要 Map/登记处：同时刻只有一个激活画布，watch(active) 上报即可，
 *   关 tab 时新激活的 Pane 自动补位，全部关光则为 null。
 * - 大纲的「点项居中定位」由 Pane 闭包持有自身 vue-flow 实例实现，抽屉不碰画布引擎。
 * - 全屏 editor 宿主只有一个 Pane，不经单例，由 Pane 直接把 port 传给抽屉。
 */
import type { Ref, ShallowRef } from 'vue';
import { shallowRef } from 'vue';
import type { Edge, Node } from '@vue-flow/core';
import type { CmpNodeData, ElTreeModel } from './useElTreeModel';
import type { CanvasController } from './useCanvasController';
import type { ElPreviewController } from './useElPreview';
import type { OutlineItem } from './useOutlineItems';

export interface DrawerOutlinePort {
  items: Ref<OutlineItem[]>;
  /** 当前选中 id（node/edge 统一），用于大纲高亮 */
  selectedId: Ref<string | null>;
  /** 点击大纲项：选中并在画布居中（Pane 内闭包，持有自身 vue-flow 实例） */
  locate: (id: string) => void;
}

export interface DrawerPort {
  /** Pane 内唯一序号：切换画布时强制桥接子树重建，inject 到新画布的实例 */
  uid: number;
  /** 供抽屉内属性子组件（cmp-props/*）桥接 inject */
  treeModel: ElTreeModel;
  /** 供 EdgeProps / 属性子组件桥接 inject（视图操作已收口在控制器，不直透 vue-flow） */
  controller: CanvasController;
  selectedNode: Ref<Node<CmpNodeData> | null>;
  selectedEdge: Ref<Edge | null>;
  /** 删除选中/指定节点（CmpProps 删除钮） */
  deleteNode: (id: string) => void;
  /** 属性表单改参：重投影 + 入栈 + EL 预览刷新 */
  commit: () => void;
  elPreview: ElPreviewController;
  outline: DrawerOutlinePort;
}

/** 名片序号：每个 Pane 组 port 时取一个，模块级自增（刷新页面归零无副作用） */
let portSeq = 0;
export function nextDrawerPortUid(): number {
  portSeq += 1;
  return portSeq;
}

/** 模块级单例：当前激活画布上报的名片（无画布时为 null，抽屉显示空态） */
const activePort: ShallowRef<DrawerPort | null> = shallowRef(null);

/** 激活 Pane 上报/清除名片（唯一写入入口） */
export function setActiveDrawerPort(port: DrawerPort | null): void {
  activePort.value = port;
}

/** 工作台抽屉壳读取当前激活名片（按约定只读，勿在组件内替换） */
export function useActiveDrawerPort(): ShallowRef<DrawerPort | null> {
  return activePort;
}
