<!--
  standalone 告警记录页（databus-workspace-tabs.md §6.3 写法 1 子路由）：/databus/standalone/alert。
  复用 AlertPane（告警记录）；告警规则管理在工作台壳 / settings 独立页承载，与此页同源可互跳。
-->
<template>
  <div class="sa-page">
    <AlertPane />
  </div>
</template>

<script setup name="DatabusStandaloneAlert" lang="ts">
import AlertPane from '@/views/databus/workspace/panel/AlertPane.vue';
</script>

<style scoped>
.sa-page {
  position: absolute;
  inset: 0;
  min-width: 0;
}
</style>