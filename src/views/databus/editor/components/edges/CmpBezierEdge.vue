<template>
  <g class="cmp-bezier-edge">
    <!--
      check-transition 要求单根节点：自定义边渲染在 SVG 内，
      只能用 SVG 的 g 包裹（div 放进 SVG 无法渲染），注释也必须放在 g 内部。
      命中热区由自带的透明 path 承担（interaction-width=0），便于绑定 hover
    -->
    <BaseEdge
      :id="id"
      :path="edgePath[0]"
      :marker-end="markerEnd"
      :marker-start="markerStart"
      :interaction-width="0"
    />
    <path
      class="cmp-edge-hot"
      :d="edgePath[0]"
      fill="none"
      stroke="transparent"
      stroke-width="20"
      @mouseenter="hover = true"
      @mouseleave="hover = false"
    />
    <EdgeLabelRenderer>
      <button
        type="button"
        class="cmp-edge-add"
        :class="{ 'is-visible': hover || selected || dragOverMe, 'is-dragover': dragOverMe }"
        :style="{ transform: `translate(-50%, -50%) translate(${edgePath[1]}px, ${edgePath[2]}px)` }"
        title="在连线中间插入节点"
        @click.stop="onAdd"
      >
        <el-icon><Plus /></el-icon>
      </button>
    </EdgeLabelRenderer>
  </g>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@vue-flow/core';
import { Plus } from '@element-plus/icons-vue';
import { useCanvasController } from '../../composables/useCanvasController';

defineOptions({ name: 'CmpBezierEdge' });

const props = defineProps<EdgeProps>();

const ctrl = useCanvasController();
const hover = ref(false);
// 拖业务节点经过本边时，由 useCanvasController.dragOverEdgeId 驱动显示 + 圆圈（A 范式视觉反馈）
const dragOverMe = computed(() => ctrl.dragOverEdgeId.value === props.id);

// 节点移动时 sourceX/Y 等 props 变化，路径必须响应式重算
const edgePath = computed(() =>
  getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition
  })
);

function onAdd(event: MouseEvent) {
  ctrl.openPicker({ x: event.clientX, y: event.clientY, mode: 'insertEdge', edgeId: props.id });
}
</script>

<style scoped>
.cmp-edge-add {
  position: absolute;
  z-index: 5; /* 在 edges 容器内提到最高，减少被其他 edge 元素遮挡 */
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 50%;
  box-shadow: 0 1px 4px rgb(0 0 0 / 12%);
  opacity: 0;
  pointer-events: all;
  transition:
    opacity 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease,
    background-color 0.15s ease,
    box-shadow 0.15s ease;
}

.cmp-edge-add.is-visible {
  opacity: 1;
}

.cmp-edge-add:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary);
}

/* 拖拽命中时：主色填充背景+白字+加粗阴影，避免被节点遮挡时也足够显眼 */
.cmp-edge-add.is-dragover {
  color: #fff;
  background-color: var(--el-color-primary);
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 10px rgb(64 158 255 / 45%);
}

.cmp-edge-add .el-icon {
  font-size: 14px;
}
</style>
