<template>
  <Panel position="top-right" class="flow-side-panel">
    <div class="flow-side-panel__body">
      <div class="flow-side-panel__buttons">
        <FlowLayoutButton />
      </div>
    </div>
  </Panel>
</template>

<script setup lang="ts">
import { Panel } from '@vue-flow/core';
import FlowLayoutButton from './FlowLayoutButton.vue';

defineOptions({ name: 'FlowSidePanel' });
</script>

<style scoped>
/* 右缘让位：属性面板收起后的展开钮（26px，right:12）排在最右，
   本面板（自动排列圆钮 24px）左移让出 46px = 12 + 26 + 8 间隔，中线对齐 */
.flow-side-panel.vue-flow__panel {
  margin-right: 46px;
}

.flow-side-panel__body {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

/* 横向工具组；Element Plus 全局 .el-button + .el-button { margin-left: 12px }
   在 flex 容器里会把第二颗圆钮顶偏，必须归零，间距统一交给 gap */
.flow-side-panel__buttons {
  display: flex;
  flex-direction: row;
  gap: 8px;
}

/* :deep 穿透到子组件 FlowLayoutButton 根节点上的 el-button（scoped attr 不保证落到孙级） */
.flow-side-panel__buttons :deep(.el-button + .el-button) {
  margin-left: 0;
}
</style>
