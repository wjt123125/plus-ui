<!-- Schema 驱动表单：v-model 直接绑定配置【对象】（非 JSON 字符串），按 fields 顺序渲染。
     嵌套 OBJECT 字段走分组递归；required 由本表单拦截，保存/试运行前父组件可调 validate()。 -->
<template>
  <el-form
    ref="formRef"
    :model="modelValue"
    :rules="rules"
    label-position="top"
    size="small"
    class="schema-form"
    @submit.prevent
  >
    <SchemaField
      v-for="field in fields"
      :key="field.name"
      :field="field"
      :model="modelValue"
      :name-path="field.name"
      @change="emit('change')"
    />
  </el-form>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { FormInstance, FormItemRule } from 'element-plus';
import { ElForm } from 'element-plus';
import type { PropSchema } from '@/api/databus/component/types';
import SchemaField from './SchemaField.vue';

defineOptions({ name: 'SchemaForm' });

const props = withDefaults(
  defineProps<{
    fields: PropSchema[];
    modelValue: Record<string, unknown>;
  }>(),
  {}
);

const emit = defineEmits<{
  (e: 'change'): void;
}>();

const formRef = ref<FormInstance | null>(null);

/** 必填校验：null/undefined/空白串/空数组视为空；对象存在即视为已填 */
function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function readByPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
}

/** 递归收集 required 规则（键为点路径，嵌套 OBJECT 字段同样覆盖） */
const rules = computed<Record<string, FormItemRule[]>>(() => {
  const result: Record<string, FormItemRule[]> = {};
  const walk = (list: PropSchema[], prefix: string) => {
    for (const field of list) {
      const path = prefix ? `${prefix}.${field.name}` : field.name;
      if (field.required) {
        result[path] = [
          {
            required: true,
            trigger: ['blur', 'change'],
            validator: (_rule, value, callback) => {
              // 嵌套路径时 value 不一定被 el-form 正确传入，统一从根模型按路径取
              const actual = readByPath(props.modelValue, path);
              if (isEmptyValue(actual)) {
                callback(new Error(`请填写${field.label || field.name}`));
              } else {
                callback();
              }
            }
          }
        ];
      }
      if (field.fields?.length && field.widget === 'OBJECT') {
        walk(field.fields, path);
      }
    }
  };
  walk(props.fields, '');
  return result;
});

/** 父组件（CmpProps）保存画布前调用；resolve 为校验通过，reject 携带字段错误 */
async function validate(): Promise<void> {
  await formRef.value?.validate();
}

function clearValidate() {
  formRef.value?.clearValidate();
}

defineExpose({ validate, clearValidate });
</script>

<style scoped>
.schema-form {
  width: 100%;
}
</style>
