<template>
  <NodeToolbar
    :is-visible="isVisible"
    :position="Position.Right"
    :offset="10"
    class="cmp-ctx-pad"
    @mouseenter="hoverPad = true"
    @mouseleave="hoverPad = false"
  >
  <!-- 触发一次 HMR 全量重编译：模板与 import 已在同一版本 -->

    <el-tooltip content="上方插入节点" placement="right" :show-after="300">
      <button type="button" class="cmp-ctx-pad__btn" @click.stop="open('prepend', $event)">
        <el-icon><InsertNodeIcon dir="top" /></el-icon>
      </button>
    </el-tooltip>
    <el-tooltip content="下方插入节点" placement="right" :show-after="300">
      <button type="button" class="cmp-ctx-pad__btn" @click.stop="open('append', $event)">
        <el-icon><InsertNodeIcon dir="bottom" /></el-icon>
      </button>
    </el-tooltip>
    <el-tooltip content="删除节点" placement="right" :show-after="300">
      <button type="button" class="cmp-ctx-pad__btn is-danger" @click.stop="ctrl.requestDeleteNode(nodeId)">
        <el-icon><Delete /></el-icon>
      </button>
    </el-tooltip>
  </NodeToolbar>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { NodeToolbar } from '@vue-flow/node-toolbar';
import { Position } from '@vue-flow/core';
import { Delete } from '@element-plus/icons-vue';
import InsertNodeIcon from './InsertNodeIcon.vue';
import type { PickerMode } from '../composables/useCanvasController';
import { useCanvasController } from '../composables/useCanvasController';

defineOptions({ name: 'CmpContextPad' });

const props = defineProps<{
  nodeId: string;
  /** 鼠标是否悬浮在节点本体上（由 CmpNode 根元素 mouseenter/leave 维护） */
  hover: boolean;
  selected: boolean;
}>();

const ctrl = useCanvasController();
const hoverPad = ref(false);

// NodeToolbar 以 Teleport 渲染到视口层、与节点有 10px 间隙；
// 样式里用负 margin + 等宽 padding 把命中区桥接至节点边框，保证 hover 连续不闪烁
const isVisible = computed(() => props.selected || props.hover || hoverPad.value);

function open(mode: PickerMode, event: MouseEvent) {
  ctrl.openPicker({ x: event.clientX, y: event.clientY, mode, nodeId: props.nodeId });
}
</script>

<style scoped>
.cmp-ctx-pad__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  color: var(--el-text-color-regular);
  cursor: pointer;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 50%;
  box-shadow: 0 1px 4px rgb(0 0 0 / 12%);
  transition: color 0.15s, border-color 0.15s;
}

.cmp-ctx-pad__btn:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary);
}

.cmp-ctx-pad__btn.is-danger:hover {
  color: var(--el-color-danger);
  border-color: var(--el-color-danger);
}
</style>

<!-- NodeToolbar 的外壳 div 由库自身渲染、不带本组件的 scoped 标识，需用全局样式命中 -->
<style>
.cmp-ctx-pad.vue-flow__node-toolbar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  /* 向右抵消 position=right 的 10px offset，用 padding 保住按钮视觉位置并填满间隙 */
  margin-left: -10px;
  padding: 2px 0 2px 10px;
}
</style>
