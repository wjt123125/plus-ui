<template>
  <div class="flow-el-preview">
    <div class="flow-el-preview__header">
      <span class="flow-el-preview__title">EL 预览</span>
      <el-button text size="small" :icon="CopyDocument" @click="onCopy">复制</el-button>
    </div>
    <pre class="flow-el-preview__code" :class="{ 'is-error': !!preview.error.value, 'is-loading': preview.loading.value }">
      <template v-if="preview.loading.value">生成中...</template>
      <template v-else-if="preview.error.value">{{ preview.error.value }}</template>
      <template v-else-if="preview.elStr.value">{{ preview.elStr.value }}</template>
      <template v-else>画布为空</template>
    </pre>
  </div>
</template>

<script setup lang="ts">
import { CopyDocument } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useElPreviewController } from '../composables/useElPreview';

defineOptions({ name: 'FlowElPreview' });

const preview = useElPreviewController();

async function onCopy() {
  if (!preview.elStr.value) {
    ElMessage.warning('暂无 EL 内容可复制');
    return;
  }
  try {
    await navigator.clipboard.writeText(preview.elStr.value);
    ElMessage.success('已复制到剪贴板');
  } catch {
    ElMessage.warning('复制失败，请手动选择文本');
  }
}
</script>

<style scoped>
.flow-el-preview {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color);
}

.flow-el-preview__header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.flow-el-preview__title {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
}

.flow-el-preview__code {
  flex: 1;
  margin: 0;
  padding: 12px;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  overflow: auto;
  color: var(--el-text-color-primary);
}

.flow-el-preview__code.is-error {
  color: var(--el-color-danger);
}

.flow-el-preview__code.is-loading {
  color: var(--el-text-color-secondary);
}
</style>
