<!--
  standalone 监控大盘页（databus-workspace-tabs.md §6.3 写法 1 子路由）：
  /databus/standalone/monitor。复用 MonitorPane；「告警中」卡片在本壳内跳转 /monitor 同壳的 alert 页。
-->
<template>
  <div class="sa-page">
    <MonitorPane @open-alert="goAlert" />
  </div>
</template>

<script setup name="DatabusStandaloneMonitor" lang="ts">
import { useRouter } from 'vue-router';
import MonitorPane from '@/views/databus/workspace/panel/MonitorPane.vue';

const router = useRouter();

/** 独立壳内点「告警中」：跳同壳的告警记录页（工作台壳内则由 WorkspaceWorkPanel 走 emit 开 tab） */
function goAlert() {
  router.push('/databus/standalone/alert');
}
</script>

<style scoped>
.sa-page {
  position: absolute;
  inset: 0;
  min-width: 0;
}
</style>