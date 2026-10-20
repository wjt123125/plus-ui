<!--
  连接管理路由瘦壳（2026-10-20 管理页 tab 化）：只渲染 ConnectionPane（embedded 模式）。
  保留此路由至菜单收敛（§10 步骤8）完成，期间 sys_menu 仍指向本组件，URL 保持可达。
  高度：AppMain 只有 min-height 无 definite height，故瘦壳须显式吃视口（同 views/databus/execution/index.vue）。
-->
<template>
  <div class="conn-shell">
    <ConnectionPane embedded />
  </div>
</template>

<script setup name="DatabusConnection" lang="ts">
import ConnectionPane from '@/views/databus/workspace/panel/ConnectionPane.vue';
</script>

<style lang="scss" scoped>
.conn-shell {
  height: calc(100vh - 123px);
  display: flex;
  flex-direction: column;
  min-width: 0;
}
</style>