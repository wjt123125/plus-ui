<!-- 单个 schema 字段：按 widget 分发容器/标量控件，处理 showWhen 条件显示与 OBJECT 嵌套分组。
     绑定方式：直接在所属层级对象 model[field.name] 上读写，修改后向 SchemaForm 冒泡 change。 -->
<template>
  <template v-if="visible">
    <!-- 嵌套对象分组：子字段递归（OBJECT 自身不占 form-item） -->
    <div v-if="field.widget === 'OBJECT'" class="schema-field__group">
      <div class="schema-field__group-title">{{ field.label || field.name }}</div>
      <SchemaField
        v-for="child in field.fields ?? []"
        :key="child.name"
        :field="child"
        :model="nestedModel"
        :name-path="`${namePath}.${child.name}`"
        @change="emitChange"
      />
      <div v-if="field.description" class="schema-field__desc">{{ field.description }}</div>
    </div>

    <el-form-item v-else :label="field.label || field.name" :prop="namePath" :required="field.required">
      <!-- 对象数组行编辑 -->
      <ObjectRowsEditor
        v-if="field.widget === 'OBJECT_ROWS'"
        :model-value="model[field.name]"
        :fields="field.fields ?? []"
        @update:model-value="updateValue"
        @change="emitChange"
      />

      <!-- Map 键值对编辑 -->
      <KeyValueMapEditor
        v-else-if="field.widget === 'KEY_VALUE_MAP'"
        :model-value="model[field.name]"
        :key-widget="field.keyWidget"
        :value-widget="field.valueWidget"
        :value-expr-role="field.valueExprRole"
        @update:model-value="updateValue"
        @change="emitChange"
      />

      <!-- 标量控件统一走 FieldControl -->
      <FieldControl v-else :field="field" :model-value="model[field.name]" @update:model-value="updateValue" />

      <div v-if="field.description" class="schema-field__desc">{{ field.description }}</div>
    </el-form-item>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElFormItem } from 'element-plus';
import type { PropSchema, PropShowWhen } from '@/api/databus/component/types';
import FieldControl from './FieldControl.vue';
import ObjectRowsEditor from './widgets/ObjectRowsEditor.vue';
import KeyValueMapEditor from './widgets/KeyValueMapEditor.vue';

defineOptions({ name: 'SchemaField' });

const props = withDefaults(
  defineProps<{
    field: PropSchema;
    /** 本字段所属层级的配置对象 */
    model: Record<string, unknown>;
    /** el-form 校验路径（点路径，根字段名起步） */
    namePath?: string;
  }>(),
  { namePath: '' }
);

const emit = defineEmits<{
  (e: 'change'): void;
}>();

/** 校验/嵌套路径（根层级即字段名） */
const namePath = computed(() => props.namePath || props.field.name);

function updateValue(value: unknown) {
  props.model[props.field.name] = value;
  emitChange();
}

function emitChange() {
  emit('change');
}

/** 只读空对象兜底；正常路径下 OBJECT 子对象由 CmpProps 在节点同步时预初始化 */
const EMPTY_OBJECT = Object.freeze({}) as Record<string, unknown>;

/** 嵌套对象模型（只读计算，不在此处写父模型） */
const nestedModel = computed<Record<string, unknown>>(() => {
  const v = props.model[props.field.name];
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return EMPTY_OBJECT;
});

// ── showWhen：规则相对当前层级对象求值，多条 AND ──

function readByPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
}

function matchRule(rule: PropShowWhen): boolean {
  const actual = readByPath(props.model, rule.field);
  if (rule.eq != null) return String(actual) === rule.eq;
  if (rule.ne != null) return String(actual) !== rule.ne;
  if (rule.in?.length) return rule.in.includes(String(actual));
  if (rule.notIn?.length) return !rule.notIn.includes(String(actual));
  return true;
}

const visible = computed(() => {
  const rules = props.field.showWhen;
  if (!rules?.length) return true;
  return rules.every(matchRule);
});
</script>

<style scoped>
.schema-field__desc {
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.schema-field__group {
  width: 100%;
  margin-bottom: 8px;
  padding: 8px 8px 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}

.schema-field__group-title {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}
</style>
