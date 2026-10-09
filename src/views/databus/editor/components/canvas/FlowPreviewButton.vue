<!-- 试运行浮钮：右上浮层唯一的主操作（IDE 化去顶栏后，保存走 Ctrl+S/右键菜单，不设按钮） -->
<template>
  <el-tooltip content="试运行" placement="bottom">
    <el-button
      class="flow-tool-btn"
      type="success"
      size="small"
      circle
      :loading="act.previewRunning.value"
      @click="act.preview()"
    >
      <el-icon><VideoPlay /></el-icon>
    </el-button>
  </el-tooltip>
</template>

<script setup lang="ts">
import { VideoPlay } from '@element-plus/icons-vue';
import { useEditorActions } from '../../composables/useEditorActions';

defineOptions({ name: 'FlowPreviewButton' });

const act = useEditorActions();
</script>
