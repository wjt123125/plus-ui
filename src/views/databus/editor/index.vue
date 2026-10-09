<template>
  <!-- 全屏编辑器宿主：链路画布全部逻辑在 ChainCanvasPane（与链路工作台共用） -->
  <ChainCanvasPane host="editor" />
</template>

<script setup lang="ts">
import ChainCanvasPane from './ChainCanvasPane.vue';

defineOptions({ name: 'DatabusEditor' });
</script>
