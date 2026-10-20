<!--
  standalone 连接页（databus-workspace-tabs.md §6.3 写法 1 子路由）：
  /databus/standalone/connection（列表）与 /databus/standalone/connection/:id（单条/新建= new）。
  复用 ConnectionPane 的 embedded 双模式（列表↔对象由 pane 内部状态切换）。
  key 绑定 :id：URL 变化（前进/后退）时强制重建 pane，读最新 param。
-->
<template>
  <div class="sa-page">
    <ConnectionPane :key="connKey" embedded :form-id="formId" />
  </div>
</template>

<script setup name="DatabusStandaloneConnection" lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import ConnectionPane from '@/views/databus/workspace/panel/ConnectionPane.vue';

const route = useRoute();

const idParam = route.params.id;
/** embedded 模式对象视图的激活主键：无 :id = 列表；'new' = 新建；数值 = 编辑态连接 */
const formId = computed<number | 'new' | undefined>(() => {
  if (idParam == null) return undefined;
  const s = String(idParam);
  return s === 'new' ? 'new' : Number(s);
});

/** :id 变化强制重建 pane（护栏④：/:id 变参时不在原实例上抹残留） */
const connKey = computed(() => String(route.params.id ?? ''));
</script>

<style scoped>
.sa-page {
  position: absolute;
  inset: 0;
  min-width: 0;
}
</style>