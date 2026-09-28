<template>
  <NodeToolbar
    :is-visible="isVisible"
    :position="Position.Bottom"
    :offset="10"
    class="cmp-ctx-pad"
    @mouseenter="hoverPad = true"
    @mouseleave="hoverPad = false"
  >
    <el-tooltip content="在左边插入节点" placement="bottom" :show-after="300">
      <button type="button" class="cmp-ctx-pad__btn" @click.stop="open('prepend', $event)">
        <el-icon><ArrowLeftBold /></el-icon>
      </button>
    </el-tooltip>
    <el-tooltip content="在右边插入节点" placement="bottom" :show-after="300">
      <button type="button" class="cmp-ctx-pad__btn" @click.stop="open('append', $event)">
        <el-icon><ArrowRightBold /></el-icon>
      </button>
    </el-tooltip>
    <el-tooltip content="删除节点" placement="bottom" :show-after="300">
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
import { ArrowLeftBold, ArrowRightBold, Delete } from '@element-plus/icons-vue';
import type { PickerMode } from '../../composables/useCanvasController';
import { useCanvasController } from '../../composables/useCanvasController';

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
/* ghost 图标按钮：常态无框无底无阴影，仅 hover 浮现圆形底色；24px 命中区保持不变 */
.cmp-ctx-pad__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  color: var(--el-text-color-regular);
  cursor: pointer;
  background-color: transparent;
  border: none;
  border-radius: 50%;
  transition: color 0.15s, background-color 0.15s;
}

.cmp-ctx-pad__btn:hover {
  color: var(--el-text-color-primary);
  background-color: var(--el-fill-color-light);
}

.cmp-ctx-pad__btn.is-danger {
  color: var(--el-color-danger);
}

.cmp-ctx-pad__btn.is-danger:hover {
  color: var(--el-color-danger);
  background-color: var(--el-color-danger-light-9);
}
</style>

<!-- NodeToolbar 的外壳 div 由库自身渲染、不带本组件的 scoped 标识，需用全局样式命中 -->
<style>
.cmp-ctx-pad.vue-flow__node-toolbar {
  display: flex;
  flex-direction: row;
  gap: 4px;
  /* 向上抵消 position=bottom 的 10px offset，用 padding 保住按钮视觉位置并填满间隙 */
  margin-top: -10px;
  padding: 10px 2px 2px;
}
</style>
