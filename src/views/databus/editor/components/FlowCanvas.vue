<template>
  <div class="flow-canvas" @drop.prevent="onDrop" @dragover.prevent="onDragOver" @dragleave.prevent="onDragLeave">
    <VueFlow
      :nodes="nodes"
      :edges="edges"
      :node-types="nodeTypes"
      :edge-types="edgeTypes"
      :default-edge-options="defaultEdgeOptions"
      :connection-line-options="{ type: ConnectionLineType.Bezier, style: {} }"
      :connection-mode="ConnectionMode.Loose"
      :nodes-draggable="true"
      :nodes-connectable="true"
      :elements-selectable="true"
      :edges-updatable="true"
      :connection-radius="24"
      :edge-updater-radius="14"
      :node-drag-threshold="6"
      fit-view-on-init
      :min-zoom="0.2"
      :max-zoom="2"
      :delete-key-code="null"
    >
      <Background :gap="20" :size="1.5" color="#cdd0d6" variant="dots" />
      <FlowViewportControls />
      <MiniMap pannable zoomable :width="140" :height="90" :node-color="miniMapNodeColor" />
      <FlowSidePanel />
      <CmpPickerPopover />
      <CmpContextMenu />
    </VueFlow>
  </div>
</template>

<script setup lang="ts">
import { markRaw } from 'vue';
import {
  ConnectionLineType,
  ConnectionMode,
  MarkerType,
  VueFlow,
  useVueFlow,
  type Connection,
  type Edge,
  type Node
} from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { MiniMap } from '@vue-flow/minimap';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/minimap/dist/style.css';
import CmpNode from './CmpNode.vue';
import CmpBezierEdge from './edges/CmpBezierEdge.vue';
import FlowViewportControls from './FlowViewportControls.vue';
import FlowSidePanel from './FlowSidePanel.vue';
import CmpPickerPopover from './CmpPickerPopover.vue';
import CmpContextMenu from './CmpContextMenu.vue';
import GatewayNode from './GatewayNode.vue';
import JunctionNode from './JunctionNode.vue';
import PlaceholderNode from './PlaceholderNode.vue';
import { DND_MIME } from '../cmp-defs';
import { useCanvasController } from '../composables/useCanvasController';
import { NODE_H, NODE_W, type CmpNodeData } from '../composables/useElTreeModel';

defineOptions({ name: 'FlowCanvas' });

// 初始 nodes/edges 仅作为 VueFlow 首屏渲染的数据源；
// 运行时状态统一由父级 useVueFlow() 创建的 store 管理，本组件通过注入拿到同一实例
defineProps<{
  nodes: Node<CmpNodeData>[];
  edges: Edge[];
}>();

const emit = defineEmits<{
  (e: 'select', id: string | null): void;
  (e: 'drop-node', payload: { type: string; x: number; y: number }): void;
}>();

// 节点类型注册：业务节点 cmp 与 gateway/junction/placeholder 三种结构节点平级
const nodeTypes = markRaw({
  cmp: CmpNode,
  gateway: GatewayNode,
  junction: JunctionNode,
  placeholder: PlaceholderNode
});
const edgeTypes = markRaw({ cmp: CmpBezierEdge });

const defaultEdgeOptions = {
  type: 'cmp',
  markerEnd: MarkerType.ArrowClosed,
  style: { strokeWidth: 1.5 }
};

const {
  screenToFlowCoordinate,
  findEdge,
  addEdges,
  getEdges,
  onNodeClick,
  onPaneClick,
  onConnect,
  onEdgeUpdate,
  onEdgeUpdateStart,
  onEdgeUpdateEnd
} = useVueFlow();

// 拖拽过程中的落点高亮（边 + 圆圈 / 占位符槽位高亮），与 insertNodeAt 共用 resolveDropTarget
const ctrl = useCanvasController();

// 重连期间排除旧边自身，避免被线性校验误判为端点占用
let reconnectingEdgeId: string | null = null;
onEdgeUpdateStart(({ edge }) => {
  reconnectingEdgeId = edge.id;
});
onEdgeUpdateEnd(() => {
  reconnectingEdgeId = null;
});

// 官方模式：action 改内部 state，store 自动同步
onConnect((connection) => {
  if (isValidConnection(connection)) {
    addEdges([{ ...connection, ...defaultEdgeOptions }]);
  }
});

// 边端点重连：直接改 GraphEdge 响应式属性（官方 Updating Edge Data 方式）
onEdgeUpdate(({ edge, connection }) => {
  const gEdge = findEdge(edge.id);
  if (!gEdge) {
    return;
  }
  gEdge.source = connection.source;
  gEdge.target = connection.target;
  gEdge.sourceHandle = connection.sourceHandle ?? null;
  gEdge.targetHandle = connection.targetHandle ?? null;
});

function miniMapNodeColor(node: Node) {
  return (node.data as CmpNodeData | undefined)?.color ?? '#c0c4cc';
}

function onDragOver(event: DragEvent) {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy';
  }
  // 把指针 flow 坐标按 NODE_W/NODE_H 减半，得到新节点左上角，交给统一落点裁决。
  // 与 onDrop 坐标换算一致，保证拖拽时高亮的目标（边/占位符），与松手后 insertNodeAt 实际生效的目标是同一个。
  const position = screenToFlowCoordinate({ x: event.clientX, y: event.clientY });
  ctrl.setDragOverTarget(position.x - NODE_W / 2, position.y - NODE_H / 2);
}

function onDragLeave() {
  ctrl.clearDragOverTarget();
}

function onDrop(event: DragEvent) {
  ctrl.clearDragOverTarget();
  const type = event.dataTransfer?.getData(DND_MIME);
  if (!type) {
    return;
  }
  const position = screenToFlowCoordinate({ x: event.clientX, y: event.clientY });
  // 与 onDragOver 一致：减 NODE_W/2、NODE_H/2 得到新节点左上角，交给 insertNodeAt 命中检测
  emit('drop-node', { type, x: position.x - NODE_W / 2, y: position.y - NODE_H / 2 });
}

/**
 * 手连线合法性：
 * - 不允许自连；
 * - 每个出口（source + sourceHandle）至多一条出边、每个入口至多一条入边——
 *   网关节点的每个分支 handle 各占一个槽位，因此分支扇出不受限，只禁止同一槽位重复接线；
 * - 重连过程中排除旧边自身，否则旧边会把新位置误判成槽位已占用。
 */
function isValidConnection(conn: Connection): boolean {
  return !!(
    conn.source &&
    conn.target &&
    conn.source !== conn.target &&
    !getEdges.value.some(
      (e) =>
        e.id !== reconnectingEdgeId &&
        ((e.source === conn.source && e.sourceHandle === conn.sourceHandle) ||
          (e.target === conn.target && e.targetHandle === conn.targetHandle))
    )
  );
}

onNodeClick(({ node }) => emit('select', node.id));
onPaneClick(() => emit('select', null));
</script>

<style scoped>
.flow-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
}
</style>
