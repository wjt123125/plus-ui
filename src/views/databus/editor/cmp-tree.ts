/**
 * cmp-tree.ts —— 画布模型与 CmpProperty 之间的双向适配层（方案 B 薄包装）。
 *
 * 方案 B 后，本文件退化为 useElTreeModel 的转发层：
 * - CmpNodeData：从 useElTreeModel 重新导出（字段已调整：去 container/collapsed/slot，加 gatewayKind/outlets/isCondition/junctionOf/placeholderOf）
 * - fromCmpProperty：两段式 = parseCmpProperty（CmpProperty→ElNode）+ projectToGraph（ElNode→nodes/edges）
 * - toCmpProperty：直接委托 serializeToCmpProperty（ElNode→CmpProperty），不读画布
 * - emptyCanvas：保留，给 index.vue 初始空白画布
 *
 * 外部调用点（index.vue、useElPreview.ts 等）签名保持不变，降低迁移波及面。
 *
 * 详见 docs/wiki/databus-canvas-gateway-migration.md。
 */

import type { Edge, Node } from '@vue-flow/core';
import type { CmpProperty } from '@/api/databus/el/types';
import { getDef } from './cmp-defs';
import {
  parseCmpProperty,
  serializeToCmpProperty,
  projectToGraph,
  START_X,
  START_Y,
  NODE_W,
  NODE_H,
  type CmpNodeData,
  type ElNode
} from './composables/useElTreeModel';

// 重新导出，供既有 11 处引用方继续用 cmp-tree 作 import 源
export { type CmpNodeData, type ElNode };

// 节点尺寸常量重新导出（FlowLayoutButton/CmpNode 等可能引用）
export { NODE_W, NODE_H, START_X, START_Y };

/**
 * CmpProperty 树 → 画布平级节点（网关范式）。
 *
 * 两段式：
 * 1. parseCmpProperty：CmpProperty → ElNode 树（唯一数据源）
 * 2. projectToGraph：ElNode 树 → 平级 nodes + edges（网关/锚点/占位）
 *
 * 与旧版（容器范式）的差异：
 * - 不再有 parentNode/extent/expandParent
 * - 算子是平级小网关节点（IF/SWITCH 菱形、WHEN/AND/OR 圆形），不是大盒子
 * - 分支归属用 sourceHandle 表达，不再靠 slot 命中检测
 * - 坐标初始给 cursor 默认值，dagre 一键重排
 */
export function fromCmpProperty(
  root: CmpProperty | null | undefined
): { nodes: Node<CmpNodeData>[]; edges: Edge[] } {
  const elNode = parseCmpProperty(root);
  const positionCache = new Map<string, { x: number; y: number }>();
  return projectToGraph(elNode, positionCache);
}

/**
 * 画布 → CmpProperty 树。
 *
 * 方案 B：直接序列化模型树，不读画布 nodes/edges。
 * 这里保留 (nodes, edges) 签名仅为兼容既有调用点（useElPreview/index.vue），
 * 内部完全忽略，直接走 useElTreeModel 的状态。
 *
 * 注意：方案 B 下，真正的数据源是 useElTreeModel().root；
 * 调用方若要拿到正确的 CmpProperty，应改为从 useElTreeModel.toCmpProperty() 取。
 * 本函数在迁移过渡期仍可用——只要调用方在调用前先调 useElTreeModel.loadFromCmpProperty
 * 或 useElTreeModel.root 已是最新树（编辑动作改的就是它）。
 *
 * 迁移完成、所有编辑动作切换到改树后，调用方应直接用 useElTreeModel.toCmpProperty()。
 */
export function toCmpProperty(
  _nodes: Node<CmpNodeData>[],
  _edges: Edge[]
): CmpProperty | null {
  // 方案 B 薄层：直接从全局单例取树。
  // useElTreeModel 是 composable，状态挂在 useVueFlow 之外的全局 store（见 useElTreeModelGlobal）。
  // 这里转发到全局单例的 serialize。
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  return serializeFromGlobal();
}

// 全局 ElNode 树单例（迁移过渡期用，M2 编辑动作切换后由 useCanvasController 持有）
// 这样 toCmpProperty 仍能读到最新树，无需改 useElPreview/index.vue 调用签名。
let globalElRoot: ElNode | null = null;
export function setGlobalElRoot(root: ElNode | null) {
  globalElRoot = root;
}
function serializeFromGlobal(): CmpProperty | null {
  return serializeToCmpProperty(globalElRoot);
}

/**
 * 空白画布：仅 start 虚拟节点。
 */
export function emptyCanvas(): { nodes: Node<CmpNodeData>[]; edges: Edge[] } {
  const def = getDef('start')!;
  const startNode: Node<CmpNodeData> = {
    id: 'start',
    type: 'cmp',
    position: { x: START_X, y: START_Y },
    data: {
      defType: 'start',
      cmpId: 'start',
      tag: '',
      data: '',
      label: def.label,
      color: def.color,
      virtual: true
    },
    style: { width: `${NODE_W}px` },
    deletable: false
  };
  return { nodes: [startNode], edges: [] };
}

// 保留 NODE_H 供 mock-presets 引用（原 cmp-tree 有此常量）
export const NODE_HEIGHT = NODE_H;
