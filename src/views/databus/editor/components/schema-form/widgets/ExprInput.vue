<!-- DATA 角色单行输入：常量或 {{ $.路径 }} 表达式，右侧 { } 按钮在光标处插入表达式占位 -->
<template>
  <el-input
    ref="inputRef"
    :model-value="modelValue ?? ''"
    :placeholder="placeholder"
    clearable
    @update:model-value="onInput"
    @clear="onInput('')"
  >
    <template #append>
      <el-button title="插入表达式 {{ $.路径 }}" @click="insertExpr">{ }</el-button>
    </template>
  </el-input>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElButton, ElInput } from 'element-plus';

defineOptions({ name: 'ExprInput' });

const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    placeholder?: string;
  }>(),
  { modelValue: '', placeholder: "常量 或 {{ $.路径 }}" }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const inputRef = ref<InstanceType<typeof ElInput> | null>(null);

const EXPR_TEMPLATE = '{{ $.路径 }}';
/** 插入后选中「路径」两字，便于直接替换 */
const SELECT_START = 4;
const SELECT_END = 6;

function onInput(value: string) {
  emit('update:modelValue', value);
}

function nativeInput(): HTMLInputElement | null {
  const root = (inputRef.value?.$el ?? null) as HTMLElement | null;
  return root?.querySelector('input') ?? null;
}

function insertExpr() {
  const current = props.modelValue ?? '';
  const el = nativeInput();
  const start = el?.selectionStart ?? current.length;
  const end = el?.selectionEnd ?? current.length;
  const next = current.slice(0, start) + EXPR_TEMPLATE + current.slice(end);
  emit('update:modelValue', next);
  // 等输入框回写后选中占位符中的「路径」
  requestAnimationFrame(() => {
    const target = nativeInput();
    if (!target) return;
    target.focus();
    target.setSelectionRange(start + SELECT_START, start + SELECT_END);
  });
}
</script>
