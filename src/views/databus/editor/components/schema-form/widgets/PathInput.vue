<!-- TARGET 角色：裸 JSONPath 输入（不求值）；v1 即带 $. 提示的单行输入，后续可接路径选择器 -->
<template>
  <el-input
    :model-value="modelValue ?? ''"
    :placeholder="placeholder"
    clearable
    @update:model-value="onInput"
    @clear="onInput('')"
  />
</template>

<script setup lang="ts">
import { ElInput } from 'element-plus';

defineOptions({ name: 'PathInput' });

withDefaults(
  defineProps<{
    modelValue?: string | null;
    placeholder?: string;
  }>(),
  { modelValue: '', placeholder: '$.数据空间.path' }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

function onInput(value: string) {
  emit('update:modelValue', value);
}
</script>
