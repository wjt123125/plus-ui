<!-- JSON + DATA 混合值控件（setValue.value 类字段，设计稿 §6.4）：
     字符串态走 ExprInput（常量 / {{ }} 表达式，覆盖 80% 配置）；
     数字/布尔/对象/数组等复杂类型 v1 不在表单内编辑，提示去 JSON 高级模式，避免误转型。 -->
<template>
  <div class="expr-value">
    <ExprInput
      v-if="isString"
      :model-value="(modelValue as string | null) ?? ''"
      :placeholder="placeholder || defaultPlaceholder"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <el-input v-else :model-value="complexPreview" readonly placeholder="（空）">
      <template #append>
        <span class="expr-value__tag">复杂类型</span>
      </template>
    </el-input>
    <div v-if="!isString && modelValue != null" class="expr-value__hint">
      当前值为数字/布尔/对象/数组，表单模式不直接编辑，避免类型误转；请切到 JSON 高级模式修改
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElInput } from 'element-plus';
import ExprInput from './ExprInput.vue';

defineOptions({ name: 'ExprValueEditor' });

// 不用 withDefaults：modelValue 是 unknown，字符串默认值会把 prop 类型收窄成 string
const props = defineProps<{
  modelValue?: unknown;
  placeholder?: string;
}>();

const defaultPlaceholder = '常量 或 {{ $.入参路径 }}';

const emit = defineEmits<{
  (e: 'update:modelValue', value: unknown): void;
}>();

const isString = computed(() => typeof props.modelValue === 'string');

const complexPreview = computed(() => {
  const v = props.modelValue;
  if (v == null) return '';
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
});
</script>

<style scoped>
.expr-value__hint {
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.expr-value__tag {
  font-size: 11px;
  color: var(--el-color-warning);
}
</style>
