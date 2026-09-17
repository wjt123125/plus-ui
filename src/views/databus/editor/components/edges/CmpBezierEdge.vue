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
      @mouseenter="onHoverEnter"
      @mouseleave="onHoverLeave"
      @dblclick="onDblClick"
    />
    <EdgeLabelRenderer>
      <span
        v-if="label && !editing"
        class="cmp-edge-label"
        :style="{ transform: `translate(-50%, -50%) translate(${edgePath[1]}px, ${edgePath[2] - 16}px)` }"
      >{{ label }}</span>
      <input
        v-if="editing"
        ref="inputRef"
        v-model="inputValue"
        class="cmp-edge-input"
        :style="{ transform: `translate(-50%, -50%) translate(${edgePath[1]}px, ${edgePath[2] - 16}px)` }"
        type="text"
        @keydown.enter="confirmEdit"
        @keydown.esc.prevent="cancelEdit"
        @blur="confirmEdit"
      >
      <button
        type="button"
        class="cmp-edge-add"
        :class="{
          'is-visible': hover || selected || dragOverMe || pickerOpenForMe,
          'is-active': pickerOpenForMe,
          'is-dragover': dragOverMe
        }"
        :style="{ transform: `translate(-50%, -50%) translate(${edgePath[1]}px, ${edgePath[2]}px)` }"
        title="在连线中间插入节点"
        @click.stop="onAdd"
        @mouseenter="onHoverEnter"
        @mouseleave="onHoverLeave"
      >
        <el-icon><Plus /></el-icon>
      </button>
    </EdgeLabelRenderer>
  </g>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@vue-flow/core';
import { Plus } from '@element-plus/icons-vue';
import { useCanvasController } from '../../composables/useCanvasController';

defineOptions({ name: 'CmpBezierEdge' });

const props = defineProps<EdgeProps>();

const ctrl = useCanvasController();
const hover = ref(false);
// 双击 inline 编辑 label：进入编辑态时 label span 切换为 input，
// 回车/失焦确认（空字符串 = 恢复默认 label），ESC 取消
const editing = ref(false);
const inputValue = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
// 拖业务节点经过本边时，由 useCanvasController.dragOverEdgeId 驱动显示 + 圆圈
const dragOverMe = computed(() => ctrl.dragOverEdgeId.value === props.id);
// 本边的「线上插入」物料面板打开期间圆圈保持常亮：面板遮罩会盖住画布、立刻打断 hover，
// 若圆圈随之消失，面板就失去了「我是从这条线唤起的」锚点，体感脱节
const pickerOpenForMe = computed(
  () => ctrl.picker.visible && ctrl.picker.mode === 'insertEdge' && ctrl.picker.edgeId === props.id
);

// 热区 path 与 + 按钮是两个叠放的元素（按钮在 EdgeLabelRenderer 层，会盖住中点处的热区）。
// 鼠标从热区移到按钮的瞬间会先触发 path 的 mouseleave，若立即隐藏按钮，pointer-events 一断，
// 命中目标又掉回热区、mouseenter 再触发，形成闪烁。故离开时延迟一小段时间再收起，
// 进入按钮则立刻取消该计时，hover 状态在两者之间无缝衔接。
let hoverOffTimer: ReturnType<typeof setTimeout> | undefined;
function onHoverEnter() {
  clearTimeout(hoverOffTimer);
  hover.value = true;
}
function onHoverLeave() {
  clearTimeout(hoverOffTimer);
  hoverOffTimer = setTimeout(() => {
    hover.value = false;
  }, 120);
}
onBeforeUnmount(() => clearTimeout(hoverOffTimer));

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

// 只有带 branchIndex 的边（branch/jump/merge）才能改 label；
// seq 边（THEN 串行）没有 outlet 概念，双击静默忽略
const isEditableEdge = computed(() => {
  const data = props.data as { treeAnchor?: { branchIndex?: number } } | undefined;
  return data?.treeAnchor?.branchIndex !== undefined;
});

function onDblClick() {
  if (!isEditableEdge.value) return;
  inputValue.value = (props.label as string | undefined) ?? '';
  editing.value = true;
  nextTick(() => {
    inputRef.value?.focus();
    inputRef.value?.select();
  });
}

function confirmEdit() {
  if (!editing.value) return;
  editing.value = false;
  ctrl.updateEdgeLabel(props.id as string, inputValue.value);
}

function cancelEdit() {
  editing.value = false;
}
</script>

<style scoped>
.cmp-edge-label {
  position: absolute;
  z-index: 4;
  padding: 1px 6px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--el-text-color-regular);
  white-space: nowrap;
  pointer-events: none;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 3px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 8%);
}

/* 双击 inline 编辑 label 时的输入框：主色描边 + 轻光晕，z-index 高于 label 和 + 按钮 */
.cmp-edge-input {
  position: absolute;
  z-index: 6;
  width: 120px;
  padding: 1px 6px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--el-text-color-regular);
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-color-primary);
  border-radius: 3px;
  box-shadow: 0 0 0 3px rgb(64 158 255 / 18%);
  outline: none;
}

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
  /* 未显示时必须彻底不接收点击：否则透明按钮叠在边中点，用户点线条会直接命中它弹出选择面板，
     此时圆圈还没淡入、视觉上毫无提示（即「+ 没出现面板先出现」的误触）。is-visible 时才放开。 */
  opacity: 0;
  pointer-events: none;
  transition:
    color 0.15s ease,
    border-color 0.15s ease,
    background-color 0.15s ease,
    box-shadow 0.15s ease;
}

/* 显示/隐藏不做淡入：pointer-events 在类名加上的同一帧放开，圆圈必须同帧可见，
   否则又会出现「能点到但还没看见」的时间差 */
.cmp-edge-add.is-visible {
  opacity: 1;
  pointer-events: all;
}

.cmp-edge-add:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary);
}

/* 物料面板由本边唤起：主色描边 + 轻光晕，标明「面板正在操作这条线」 */
.cmp-edge-add.is-active {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 3px rgb(64 158 255 / 18%);
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
