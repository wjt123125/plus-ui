<!-- 空槽占位：虚线框。IF 假分支/CATCH 异常槽/AND/OR 第二路为空时出现。
     拖入真实组件即替换它（client 的 replace 语义），不可手动删除。
     data.placeholderOf 指向所属算子 id。
-->
<template>
  <div class="cmp-placeholder">
    <Handle type="target" :position="Position.Top" />
    <div class="cmp-placeholder__label">{{ data.label }}</div>
    <Handle type="source" :position="Position.Bottom" />
  </div>
</template>

<script setup lang="ts">
import { Handle, Position, type NodeProps } from '@vue-flow/core';
import type { CmpNodeData } from '../cmp-tree';
defineProps<NodeProps<CmpNodeData>>();
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
}

.cmp-placeholder__label {
  font-size: 12px;
  color: #c0c4cc;
  user-select: none;
}
</style>
