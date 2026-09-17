<template>
  <div class="edge-props">
    <div v-if="!edge" class="edge-props__empty">
      <el-empty description="选中连线后配置标签" :image-size="80" />
    </div>
    <template v-else>
      <div class="edge-props__header">
        <el-tag v-if="!editable" size="small" type="info">不可编辑</el-tag>
      </div>
      <el-alert
        v-if="!editable"
        title="该连线是串行边（THEN 链路），没有分支标签可编辑。只有分支边（真/假/case/并行 等）支持自定义标签。"
        type="info"
        :closable="false"
        show-icon
      />
      <el-form
        v-else
        label-position="top"
        size="small"
        class="edge-props__form"
      >
        <el-form-item label="分支标签">
          <el-input
            v-model="inputValue"
            placeholder="留空恢复默认标签"
            clearable
            @change="onLabelChange"
          />
        </el-form-item>
        <div class="edge-props__hint">
          修改后回车或失焦生效；双击连线也可直接编辑。
        </div>
      </el-form>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Edge } from '@vue-flow/core';
import { useCanvasController } from '../composables/useCanvasController';

defineOptions({ name: 'EdgeProps' });

const props = defineProps<{ edge: Edge | null }>();

const ctrl = useCanvasController();
const inputValue = ref('');

// 只有带 branchIndex 的边（branch/jump/merge）才能改 label；
// seq 边（THEN 串行）没有 outlet 概念，属性面板只读
const editable = computed(() => {
  const data = props.edge?.data as { treeAnchor?: { branchIndex?: number } } | undefined;
  return data?.treeAnchor?.branchIndex !== undefined;
});

// edge 变化时同步 inputValue 到当前 label（reproject 后 edge 是新对象，label 可能已更新）
watch(
  () => props.edge,
  (edge) => {
    inputValue.value = (edge?.label as string | undefined) ?? '';
  },
  { immediate: true }
);

function onLabelChange() {
  if (!props.edge || !editable.value) return;
  ctrl.updateEdgeLabel(props.edge.id, inputValue.value);
}
</script>

<style scoped>
.edge-props {
  padding: 8px 12px;
}

.edge-props__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.edge-props__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.edge-props__title {
  flex: 1;
}

.edge-props__form {
  margin-top: 8px;
}

.edge-props__hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
</style>
