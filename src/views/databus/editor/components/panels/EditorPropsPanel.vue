<template>
  <div class="editor-props-panel" :class="{ 'is-collapsed': collapsed }">
    <!-- 面板顶部工具行：收起钮右对齐独占一行 -->
    <div class="editor-props-panel__header">
      <button
        type="button"
        class="editor-props-panel__fold"
        title="收起属性面板"
        @click="emit('fold')"
      >
        <el-icon><Fold /></el-icon>
      </button>
    </div>
    <el-tabs v-model="activeTab" class="editor-props-panel__tabs">
      <el-tab-pane label="属性" name="props">
        <CmpProps
          v-if="node"
          :node="node"
          @delete="emit('delete', $event)"
          @data-change="emit('dataChange')"
        />
        <EdgeProps v-else :edge="edge" />
      </el-tab-pane>
      <el-tab-pane label="EL 预览" name="el">
        <FlowElPreview />
      </el-tab-pane>
      <el-tab-pane label="大纲" name="outline">
        <FlowOutline />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { Edge, Node } from '@vue-flow/core';
import { Fold } from '@element-plus/icons-vue';
import CmpProps from './CmpProps.vue';
import EdgeProps from './EdgeProps.vue';
import FlowElPreview from './FlowElPreview.vue';
import FlowOutline from './FlowOutline.vue';
import type { CmpNodeData } from '../../composables/useElTreeModel';
import { useElPreviewController } from '../../composables/useElPreview';

const props = defineProps<{
  node: Node<CmpNodeData> | null;
  edge: Edge | null;
  collapsed: boolean;
}>();

const emit = defineEmits<{
  fold: [];
  delete: [id: string];
  dataChange: [];
}>();

const elPreview = useElPreviewController();

// 右侧栏三 Tab：属性 / EL 预览 / 大纲。选中/取消选中自动切换仅在 props↔el 之间，
// 大纲 Tab 手动切，不被覆盖。EL 预览刷新仅在 el Tab 可见时触发省请求。
const activeTab = ref<'props' | 'el' | 'outline'>('el');
watch(
  () => !!(props.node || props.edge),
  (hasSel) => {
    if (hasSel && activeTab.value === 'el') activeTab.value = 'props';
    else if (!hasSel && activeTab.value === 'props') activeTab.value = 'el';
  },
  { immediate: true }
);
watch(
  activeTab,
  (tab) => {
    elPreview.active.value = tab === 'el';
    if (tab === 'el') elPreview.refresh();
  },
  { immediate: true }
);
</script>

<style scoped>
.editor-props-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  grid-row: 2;
  grid-column: 3;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-left: 1px solid var(--el-border-color-lighter);
  transition: border-left-color 0.2s ease;
}

/* 轨道收 0 时隐掉竖边，避免画布右缘残留一根线 */
.editor-props-panel.is-collapsed {
  border-left-color: transparent;
}

/* 内容固定 300px 不参与挤压回流（折叠动画期间不重排） */
.editor-props-panel__tabs {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: var(--props-size);
  min-height: 0;
}

.editor-props-panel__tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 8px;
}

/* 页签样式与左侧物料区保持一致（12px 字号、30px 高、1px 细底线） */
.editor-props-panel__tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
}

.editor-props-panel__tabs :deep(.el-tabs__item) {
  height: 30px;
  padding: 0 10px;
  font-size: 12px;
  line-height: 30px;
}

.editor-props-panel__tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.editor-props-panel__tabs :deep(.el-tab-pane) {
  height: 100%;
}

/* 面板顶部工具行：收起钮右对齐独占一行（不与页签标题同行，与左面板结构对称） */
.editor-props-panel__header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  padding: 8px 8px 0;
}

/* 收起钮：24×24 描边小钮，与物料区折叠钮同款 */
.editor-props-panel__fold {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  background-color: transparent;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  transition: color 0.15s, border-color 0.15s;
}

.editor-props-panel__fold:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
}
</style>
