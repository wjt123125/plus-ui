<!--
  告警管理路由瘦壳（2026-10-20 管理页 tab 化）：只渲染 AlertPane（告警记录）。
  保留此路由至菜单收敛（§10 步骤8）完成，期间 sys_menu 仍指向本组件，URL 保持可达。
  告警规则的 CRUD 已迁至设置 tab 的「告警规则」组（SettingsPane），不再在此路由承载。
  高度：AppMain 只有 min-height 无 definite height，故瘦壳须显式吃视口（同 views/databus/execution/index.vue）。
-->
<template>
  <!-- db-app：databus 令牌作用域根（_tokens.scss 铁律），平底色由此统一铺，同 execution/index.vue -->
  <div class="alert-shell db-app">
    <AlertPane />
  </div>
</template>

<script setup name="DatabusAlert" lang="ts">
import AlertPane from '@/views/databus/workspace/panel/AlertPane.vue';
</script>

<style lang="scss" scoped>
.alert-shell {
  height: calc(100vh - 123px);
  display: flex;
  flex-direction: column;
  min-width: 0;
}
</style>