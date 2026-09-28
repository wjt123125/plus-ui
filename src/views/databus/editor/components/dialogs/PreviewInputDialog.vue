<template>
  <el-dialog :model-value="visible" title="试运行" width="620px" append-to-body @update:model-value="emit('update:visible', $event)">
    <el-alert
      title="按当前画布生成 EL 并直接真执行（不落库）。下方 JSON 即链路入参，作为上下文文档根。"
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 10px"
    />
    <JsonCodeEditor
      :model-value="request"
      placeholder='链路入参 JSON，如 {"flag":true}'
      height="280px"
      @update:model-value="emit('update:request', $event)"
    />
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="success" :loading="loading" @click="emit('execute')">执行</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import JsonCodeEditor from '../common/JsonCodeEditor.vue';

defineProps<{
  visible: boolean;
  request: string;
  loading: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  'update:request': [value: string];
  execute: [];
}>();
</script>
