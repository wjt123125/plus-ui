<!-- 空槽占位：虚线框。IF 假分支/CATCH 异常槽/AND/OR 第二路/空 THEN，以及
     THEN(节点+尾部空槽) 的串行空槽都会出现。拖入真实组件即填入该槽，不可手动删除。
     data.placeholderOf 指向所属算子 id。
     只有拖拽指针中心进入虚框本体（含 4px 抗抖动）时才高亮；指针在邻接边上按边处理，不抢。
-->
<template>
  <div class="cmp-placeholder" :class="{ 'is-dragover': dragOverMe }">
    <Handle type="target" :position="Position.Top" />
    <div class="cmp-placeholder__label">{{ data.label }}</div>
    <Handle type="source" :position="Position.Bottom" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position, type NodeProps } from '@vue-flow/core';
import type { CmpNodeData } from '../composables/useElTreeModel';
import { useCanvasController } from '../composables/useCanvasController';

const props = defineProps<NodeProps<CmpNodeData>>();

const ctrl = useCanvasController();
const dragOverMe = computed(() => ctrl.dragOverPlaceholderId.value === props.id);
</script>

<style scoped>
.cmp-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-width: 120px;
  min-height: 48px;
  border: 2px dashed #c0c4cc;
  border-radius: 6px;
  background: var(--el-fill-color-lighter, #f5f7fa);
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    box-shadow 0.15s ease;
}

.cmp-placeholder__label {
  font-size: 12px;
  color: #c0c4cc;
  user-select: none;
  transition: color 0.15s ease;
}

/* 拖拽命中：主色虚线框 + 淡蓝底，明确提示「松手填入此槽」，与边的 + 圆圈反馈同级显眼 */
.cmp-placeholder.is-dragover {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9, #ecf5ff);
  box-shadow: 0 0 0 3px rgb(64 158 255 / 15%);
}

.cmp-placeholder.is-dragover .cmp-placeholder__label {
  color: var(--el-color-primary);
}
</style>
