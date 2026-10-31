<!--
  监控大盘路由瘦壳（2026-10-20 管理页 tab 化）：只渲染 MonitorPane。
  保留此路由至菜单收敛（§10 步骤8）完成，期间 sys_menu 仍指向本组件，URL 保持可达。
  壳可用路由：monitor「告警中」卡片在工作台壳下开 alert-record tab（emit），在路由壳下跳告警记录页。
  高度：AppMain 只有 min-height 无 definite height，故瘦壳须显式吃视口（同 views/databus/execution/index.vue）。
-->
<template>
  <div class="monitor-shell db-app">
    <MonitorPane @open-alert="goAlert" />
  </div>
</template>

<script setup name="DatabusMonitor" lang="ts">
import { useRouter } from 'vue-router';
import MonitorPane from '@/views/databus/workspace/panel/MonitorPane.vue';

const router = useRouter();

/** 路由壳宿主点「告警中」卡片：跳转告警记录页（工作台壳内则走 emit，见 WorkspaceWorkPanel 分发） */
function goAlert() {
  router.push('/databus/alert');
}
</script>

<style lang="scss" scoped>
.monitor-shell {
  height: calc(100vh - 123px);
  display: flex;
  flex-direction: column;
  min-width: 0;
}
</style>