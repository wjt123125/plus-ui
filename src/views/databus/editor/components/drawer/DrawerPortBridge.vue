<!--
  抽屉名片 inject 桥：工作台宿主下右侧抽屉在 ChainCanvasPane 组件树之外，
  属性子组件（cmp-props/*、EdgeProps）仍按原契约 inject treeModel / canvasController。
  本组件用激活画布名片上的原始实例重新 provide 这两个 key；
  父级以 :key="port.uid" 强制本组件随切画布重建，保证 inject 始终指向当前激活 Pane。
-->
<template>
  <slot />
</template>

<script setup lang="ts">
import { provide } from 'vue';
import { EL_TREE_KEY } from '../../composables/useElTreeModel';
import { CANVAS_CTRL_KEY } from '../../composables/useCanvasController';
import type { DrawerPort } from '../../composables/useDrawerPort';

const props = defineProps<{
  port: DrawerPort;
}>();

provide(EL_TREE_KEY, props.port.treeModel);
provide(CANVAS_CTRL_KEY, props.port.controller);
</script>
