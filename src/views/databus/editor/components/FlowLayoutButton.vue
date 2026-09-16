<!-- 自动排列按钮：dagre 一次排全图（方案 B 平级节点，无容器递归子图） -->
<template>
  <el-tooltip content="自动排列" placement="bottom">
    <el-button class="flow-tool-btn" size="small" circle :disabled="disabled" @click="onClick">
      <el-icon><MagicStick /></el-icon>
    </el-button>
  </el-tooltip>
</template>

<script setup lang="ts">
import { MagicStick } from '@element-plus/icons-vue';
import { useCanvasController } from '../composables/useCanvasController';

defineOptions({ name: 'FlowLayoutButton' });

withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false });

// autoLayout 由 CanvasController 统一注入（与 loadMock/insertNodeAt 共用同一份实现）
const ctrl = useCanvasController();

function onClick() {
  ctrl.autoLayout();
}
</script>

<!-- 节点不在本组件 DOM 子树内，过渡规则需用非 scoped 选择器 -->
<style>
.vue-flow.is-flow-layouting .vue-flow__node {
  transition: transform 0.3s ease;
}
</style>
