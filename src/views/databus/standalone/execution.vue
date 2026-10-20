<!--
  standalone 执行记录页（databus-workspace-tabs.md §6.3 写法 1 子路由）：
  /databus/standalone/execution（列表）与 /databus/standalone/execution/:id（单条记录）。
  复用 ExecutionPane 的 embedded 双模式（列表↔记录由 pane 内部状态切换）。
  key 绑定 :id：URL 变化时强制重建 pane（护栏④）；雪花 id 用字符串防精度丢失。
-->
<template>
  <div class="sa-page">
    <ExecutionPane :key="recKey" embedded :record-id="recordId" />
  </div>
</template>

<script setup name="DatabusStandaloneExecution" lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import ExecutionPane from '@/views/databus/workspace/panel/ExecutionPane.vue';

const route = useRoute();

/** embedded 模式记录视图主键：无 :id = 列表；有 = 单条记录（雪花 id 走字符串） */
const recordId = computed<number | string | null>(() =>
  route.params.id == null ? null : String(route.params.id)
);

const recKey = computed(() => String(route.params.id ?? ''));
</script>

<style scoped>
.sa-page {
  position: absolute;
  inset: 0;
  min-width: 0;
}
</style>