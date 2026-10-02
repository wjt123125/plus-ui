<template>
  <div class="field-control">
      <!-- 单根容器：本组件在 <transition> 内被切换渲染，模板只能有一个根元素。
       纯控件分发（无 label/form-item/showWhen），SchemaField 表单字段与
       ObjectRowsEditor 行内单元格共用；OBJECT/OBJECT_ROWS/KEY_VALUE_MAP 走兜底只读输入。 -->
    <!-- 文本类：DATA → ExprInput，TARGET → PathInput，其余普通输入 -->
    <ExprInput
      v-if="field.widget === 'TEXT' && field.exprRole === 'DATA'"
      :model-value="stringValue"
      :placeholder="field.placeholder ?? undefined"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <PathInput
      v-else-if="field.widget === 'TEXT' && field.exprRole === 'TARGET'"
      :model-value="stringValue"
      :placeholder="field.placeholder ?? undefined"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <el-input
      v-else-if="field.widget === 'TEXT'"
      :model-value="stringValue"
      :placeholder="field.placeholder ?? undefined"
      clearable
      @update:model-value="emit('update:modelValue', $event)"
    />

    <ConnectionSelect
      v-else-if="field.widget === 'CONNECTION_SELECT'"
      :model-value="stringValue"
      :placeholder="field.placeholder ?? undefined"
      @update:model-value="emit('update:modelValue', $event)"
    />

    <el-input
      v-else-if="field.widget === 'PASSWORD'"
      :model-value="stringValue"
      :placeholder="field.placeholder ?? undefined"
      type="password"
      show-password
      clearable
      @update:model-value="emit('update:modelValue', $event)"
    />

    <el-input
      v-else-if="field.widget === 'TEXTAREA'"
      :model-value="stringValue"
      :placeholder="field.placeholder ?? undefined"
      type="textarea"
      :rows="4"
      @update:model-value="emit('update:modelValue', $event)"
    />

    <!-- JSON：DATA → ExprValueEditor；其余多行 JSON 文本（坏文本按字符串保留，不拦） -->
    <ExprValueEditor
      v-else-if="field.widget === 'JSON' && field.exprRole === 'DATA'"
      :model-value="modelValue"
      :placeholder="field.placeholder ?? undefined"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <el-input
      v-else-if="field.widget === 'JSON'"
      :model-value="jsonText"
      :placeholder="field.placeholder ?? undefined"
      type="textarea"
      :rows="4"
      @update:model-value="updateJsonText"
    />

    <el-switch
      v-else-if="field.widget === 'BOOLEAN'"
      :model-value="booleanValue"
      @update:model-value="emit('update:modelValue', $event)"
    />

    <el-input-number
      v-else-if="field.widget === 'NUMBER'"
      :model-value="numberValue"
      :controls="false"
      style="width: 100%"
      @update:model-value="emit('update:modelValue', $event)"
    />

    <el-select
      v-else-if="field.widget === 'SELECT'"
      :model-value="modelValue ?? ''"
      :placeholder="field.placeholder ?? '请选择'"
      clearable
      style="width: 100%"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <el-option
        v-for="opt in field.options ?? []"
        :key="opt.value"
        :label="opt.label"
        :value="opt.value"
      />
    </el-select>

    <!-- MULTISELECT：有固定候选走多选；无候选（List<String> 标签串）filterable+allow-create 自由输入 -->
    <el-select
      v-else-if="field.widget === 'MULTISELECT'"
      :model-value="arrayValue"
      multiple
      filterable
      allow-create
      default-first-option
      :placeholder="field.placeholder ?? '输入后回车添加'"
      style="width: 100%"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <el-option
        v-for="opt in field.options ?? []"
        :key="opt.value"
        :label="opt.label"
        :value="opt.value"
      />
    </el-select>

    <!-- 容器控件不进单元格；兜底 -->
    <el-input v-else :model-value="''" readonly placeholder="该控件请在表单层配置或使用 JSON 高级模式" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElInput, ElOption, ElSelect, ElSwitch, ElInputNumber } from 'element-plus';
import type { PropSchema } from '@/api/databus/component/types';
import ExprInput from './widgets/ExprInput.vue';
import PathInput from './widgets/PathInput.vue';
import ExprValueEditor from './widgets/ExprValueEditor.vue';
import ConnectionSelect from './widgets/ConnectionSelect.vue';

defineOptions({ name: 'FieldControl' });

const props = defineProps<{
  field: PropSchema;
  modelValue?: unknown;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: unknown): void;
}>();

const stringValue = computed(() => {
  const v = props.modelValue;
  return v == null ? '' : String(v);
});

const booleanValue = computed(() => props.modelValue === true);

const numberValue = computed(() => {
  const v = props.modelValue;
  return typeof v === 'number' ? v : undefined;
});

const arrayValue = computed<string[]>(() => {
  const v = props.modelValue;
  return Array.isArray(v) ? (v as unknown[]).map((item) => String(item)) : [];
});

/** 非 DATA 的 JSON 字段：对象态文本化；坏文本按原始字符串保留 */
const jsonText = computed(() => {
  const v = props.modelValue;
  if (v == null) return '';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
});

function updateJsonText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    emit('update:modelValue', undefined);
    return;
  }
  try {
    emit('update:modelValue', JSON.parse(trimmed));
  } catch {
    emit('update:modelValue', text);
  }
}
</script>

<style scoped>
.field-control {
  width: 100%;
}
</style>
