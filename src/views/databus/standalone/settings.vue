<!--
  standalone 设置页（databus-workspace-tabs.md §6.3 写法 1 子路由）：/databus/standalone/settings。
  复用 SettingsPane（三组：告警规则有实、通知渠道/静默期为占位空态）。
-->
<template>
  <div class="sa-page">
    <SettingsPane />
  </div>
</template>

<script setup name="DatabusStandaloneSettings" lang="ts">
import SettingsPane from '@/views/databus/workspace/panel/SettingsPane.vue';
</script>

<style scoped>
.sa-page {
  position: absolute;
  inset: 0;
  min-width: 0;
}
</style>