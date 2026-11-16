<!--
  试运行结果弹窗：仅独立编辑器窗口（host=editor，无终端）使用。
  工作台宿主改走「终端行摘要 + 结果 tab」，正文与这里共用 PreviewResultBody。
-->
<template>
  <el-dialog
    :model-value="visible"
    title="试运行结果"
    width="860px"
    append-to-body
    :close-on-click-modal="true"
    @update:model-value="emit('update:visible', $event)"
  >
    <PreviewResultBody
      :result="result"
      :resolve-step-title="resolveStepTitle"
      :request-json="requestJson"
      @open-step="(row) => emit('openStep', row)"
    />
    <template #footer>
      <el-button @click="emit('update:visible', false)">关闭</el-button>
      <el-button type="success" @click="emit('reopen')">再跑一次</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { NodeStep, PreviewRunVo } from '@/api/databus/el/types';
import PreviewResultBody from './PreviewResultBody.vue';

defineProps<{
  visible: boolean;
  result: PreviewRunVo | null;
  /** 步骤标题推断依赖当前画布模型树，由 composable 注入 */
  resolveStepTitle: (row: NodeStep) => string;
  /** 本次实际发出的入参（画布宿主持有 previewRequest） */
  requestJson?: string;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  reopen: [];
  openStep: [row: NodeStep];
}>();
</script>
