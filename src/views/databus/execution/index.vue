<!--
  执行记录路由瘦壳（2026-10-20 管理页 tab 化）：只渲染 ExecutionPane（embedded 模式）。
  保留此路由至菜单收敛（§10 步骤8）完成，期间 sys_menu 仍指向本组件，URL 保持可达。
  高度：AppMain 只有 min-height 无 definite height，故瘦壳须显式吃视口（同 views/databus/workspace/index.vue）。
-->
<template>
  <div class="exec-shell">
    <ExecutionPane embedded />
  </div>
</template>

<script setup name="DatabusExecution" lang="ts">
import ExecutionPane from '@/views/databus/workspace/panel/ExecutionPane.vue';
</script>

<style lang="scss" scoped>
.exec-shell {
  height: calc(100vh - 123px);
  display: flex;
  flex-direction: column;
  min-width: 0;
}
</style>