<!--
  通用业务叶子（含 condition/forLoop/iteratorLoop 等已挂条件件）：
  数据空间 + schema 表单/JSON 高级模式双模；无 schema 的物料维持单一 JSON 编辑器。
  坏 JSON 不覆盖表单模型：切回表单显示上次有效内容。
-->
<template>
  <el-form label-position="top" size="small" class="cmp-leaf__form">
    <ConditionLeafBadge v-if="ctx.isConditionLeaf.value" />
    <DataSpaceField
      placeholder="如 httpRequest1（字母开头，字母数字下划线）"
      @data-change="emit('data-change')"
    />
    <!-- schema 物料：表单模式 / JSON 高级模式双栏；无 schema 的物料维持单一 JSON 编辑器 -->
    <el-form-item v-if="schemaAvailable" label="配置方式">
      <el-radio-group v-model="editMode" size="small" @change="onModeChange">
        <el-radio value="form">表单模式</el-radio>
        <el-radio value="json">JSON 高级模式</el-radio>
      </el-radio-group>
    </el-form-item>
    <SchemaForm
      v-if="schemaAvailable && editMode === 'form'"
      :fields="schemaFields"
      :model-value="formModel"
      @change="onFormChange"
    />
    <el-form-item v-if="!schemaAvailable || editMode === 'json'" label="组件配置 data（JSON）">
      <JsonCodeEditor
        v-model="dataStr"
        :placeholder="jsonPlaceholder"
        :fill-placeholder="!!activeOption?.dataExample"
        height="280px"
        @blur="onDataChange"
      />
      <div v-if="schemaAvailable && jsonInvalid" class="cmp-field__hint cmp-field__hint--danger">
        JSON 不合法，切回表单模式将显示上次有效内容（不会用坏 JSON 覆盖表单）
      </div>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElForm, ElFormItem, ElMessage, ElRadio, ElRadioGroup } from 'element-plus';
import type { PropSchema } from '@/api/databus/component/types';
import { useElTreeModelInject } from '../../../composables/useElTreeModel';
import { useComponentOptions } from '../../../composables/useComponentOptions';
import JsonCodeEditor from '../../common/JsonCodeEditor.vue';
import SchemaForm from '../../schema-form/SchemaForm.vue';
import ConditionLeafBadge from './ConditionLeafBadge.vue';
import DataSpaceField from './DataSpaceField.vue';
import { usePropsContext } from './usePropsContext';

defineOptions({ name: 'SchemaLeafFields' });

const emit = defineEmits<{ (e: 'data-change'): void }>();

const ctx = usePropsContext();
const treeModel = useElTreeModelInject();

const dataStr = ref('');
const formModel = ref<Record<string, unknown>>({});
const editMode = ref<'form' | 'json'>('form');
const jsonInvalid = ref(false);

const { optionMap, ensureOptions } = useComponentOptions();

const activeOption = computed(() => {
  const code = ctx.elNode.value?.componentCode;
  return code ? optionMap.value.get(code) : undefined;
});

const schemaAvailable = computed(
  () =>
    !ctx.isSwitchRouteLeaf.value &&
    activeOption.value?.editor === 'form' &&
    (activeOption.value?.schema?.fields?.length ?? 0) > 0
);

const schemaFields = computed<PropSchema[]>(() => activeOption.value?.schema?.fields ?? []);

// JSON 高级模式占位：物料注解 dataExample 下发，parse 后 2 空格美化；
// 未声明或非合法 JSON 时回退原文案/通用文案
const jsonPlaceholder = computed(() => {
  const raw = activeOption.value?.dataExample;
  if (!raw) return '组件配置 JSON';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 按 schema 预建 OBJECT 子对象（空对象等价子字段全缺省，Jackson 反序列化无差异）；
 *  避免在渲染 computed 里写模型，也保证嵌套表单始终拿到可写对象 */
function ensureNestedObjects(model: Record<string, unknown>, fields: PropSchema[]) {
  for (const field of fields) {
    if (field.widget === 'OBJECT' && field.fields?.length) {
      if (!isPlainObject(model[field.name])) {
        model[field.name] = {};
      }
      ensureNestedObjects(model[field.name] as Record<string, unknown>, field.fields);
    }
  }
}

/** 灌入新表单模型：先按 schema 预建 OBJECT 子对象 */
function applyFormModel(obj: Record<string, unknown>) {
  ensureNestedObjects(obj, schemaFields.value);
  formModel.value = obj;
  jsonInvalid.value = false;
}

/** 用叶子 data 同步表单模型：合法 JSON 对象进表单模式；坏/非对象进 JSON 模式且不覆盖表单模型 */
function syncSchemaForm(data?: string) {
  if (!schemaAvailable.value) return;
  if (!data || !data.trim()) {
    applyFormModel({});
    editMode.value = 'form';
    return;
  }
  try {
    const obj = JSON.parse(data);
    if (isPlainObject(obj)) {
      applyFormModel(obj);
      editMode.value = 'form';
      return;
    }
  } catch {
    // 坏 JSON：保留旧 formModel，落到 JSON 模式修
  }
  editMode.value = 'json';
  jsonInvalid.value = true;
}

// 切节点：同步 dataStr 并由 syncSchemaForm 决定落表单还是 JSON 模式
watch(
  () => ctx.elNode.value?.id,
  () => {
    dataStr.value = ctx.elNode.value?.data ?? '';
    jsonInvalid.value = false;
    syncSchemaForm(ctx.elNode.value?.data);
  },
  { immediate: true }
);

// 同节点 data 变化（JSON 编辑落库/填入示例/外部撤销重做）：只同步文本，模式保持不动
watch(() => ctx.elNode.value?.data, (data) => {
  dataStr.value = data ?? '';
});

// 选项异步加载完成后若当前正停在 schema 物料节点，补一次同步
watch(schemaAvailable, (available) => {
  if (available) {
    syncSchemaForm(ctx.elNode.value?.data);
  }
});

onMounted(() => {
  // schema 组件物料选项（带模块级缓存，失败内部静默可重试）
  void ensureOptions();
});

/** JSON 模式改动（blur）：解析成功才覆盖表单模型；失败保留并标记，不阻断写回 ElNode */
function syncModelFromJsonText() {
  const text = dataStr.value;
  if (!text.trim()) {
    applyFormModel({});
    return;
  }
  try {
    const obj = JSON.parse(text);
    if (isPlainObject(obj)) {
      applyFormModel(obj);
      return;
    }
  } catch {
    // 坏 JSON 不覆盖 formModel
  }
  jsonInvalid.value = true;
}

/** 编辑组件配置 JSON */
function onDataChange() {
  const n = ctx.elNode.value;
  if (!n) return;
  treeModel.updateLeafData(n.id, { data: dataStr.value });
  // schema 物料：JSON 模式是表单模型的高级入口，合法才回灌表单，坏 JSON 保留旧表单内容
  if (schemaAvailable.value) {
    syncModelFromJsonText();
  }
  emit('data-change');
}

/** 表单改动：对象序列化为 JSON 串，写回 ElNode.data 单一通道 */
function onFormChange() {
  const n = ctx.elNode.value;
  if (!n) return;
  const json = JSON.stringify(formModel.value);
  dataStr.value = json;
  jsonInvalid.value = false;
  treeModel.updateLeafData(n.id, { data: json });
  emit('data-change');
}

function onModeChange(next: string | number | boolean) {
  if (next === 'form' && jsonInvalid.value) {
    ElMessage.warning('JSON 有语法错误，表单显示上次有效内容');
  }
}
</script>

<style scoped>
.cmp-leaf__form {
  margin-top: 4px;
}

.cmp-field__hint {
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.cmp-field__hint--danger {
  color: var(--el-color-danger);
}
</style>
