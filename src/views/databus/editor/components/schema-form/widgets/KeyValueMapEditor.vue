<!-- KEY_VALUE_MAP：键值对行编辑（httpRequest.headers、dataPatch.patch 等）。
     键固定文本；值控件按 valueWidget/valueExprRole 构造伪 PropSchema 复用 FieldControl 分发
     （DATA+TEXT→ExprInput、DATA+JSON→ExprValue、BOOLEAN/NUMBER 同理）。
     键为空的行只保留在编辑态、不写入模型，避免产出空键污染。 -->
<template>
  <div class="kv-map">
    <div v-for="(row, i) in rows" :key="i" class="kv-map__row">
      <el-input
        :model-value="row.key"
        placeholder="键名"
        class="kv-map__key"
        @update:model-value="onKey(i, $event)"
      />
      <div class="kv-map__value">
        <FieldControl
          :field="valueField"
          :model-value="row.value"
          @update:model-value="onValue(i, $event)"
        />
      </div>
      <el-button link type="danger" :icon="Delete" @click="removeRow(i)" />
    </div>
    <el-button size="small" :icon="Plus" @click="addRow">添加一行</el-button>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { ElButton, ElInput } from 'element-plus';
import { Delete, Plus } from '@element-plus/icons-vue';
import type { ExprRole, PropSchema, WidgetKind } from '@/api/databus/component/types';
import FieldControl from '../FieldControl.vue';

defineOptions({ name: 'KeyValueMapEditor' });

const props = withDefaults(
  defineProps<{
    modelValue?: unknown;
    keyWidget?: WidgetKind | null;
    valueWidget?: WidgetKind | null;
    valueExprRole?: ExprRole | null;
  }>(),
  { keyWidget: 'TEXT', valueWidget: 'TEXT', valueExprRole: 'LITERAL' }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: unknown): void;
  (e: 'change'): void;
}>();

interface KvRow {
  key: string;
  value: unknown;
}

const rows = reactive<KvRow[]>([]);
/** 最近一次由本控件 emit 的对象序列化值，用于区分「外部真变更」与「自身回声」 */
let lastEmitted: string | null = null;

function toRows(source: unknown): KvRow[] {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return [];
  return Object.entries(source as Record<string, unknown>).map(([key, value]) => ({ key, value }));
}

watch(
  () => props.modelValue,
  (source) => {
    const incoming = JSON.stringify(source ?? {});
    if (incoming !== lastEmitted) {
      rows.splice(0, rows.length, ...toRows(source));
      lastEmitted = incoming;
    }
  },
  { immediate: true, deep: false }
);

const valueField = computed<PropSchema>(() => ({
  name: 'value',
  widget: (props.valueWidget ?? 'TEXT') as WidgetKind,
  exprRole: (props.valueExprRole ?? 'LITERAL') as ExprRole
}));

function commit() {
  const obj: Record<string, unknown> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key) obj[key] = row.value;
  }
  lastEmitted = JSON.stringify(obj);
  emit('update:modelValue', obj);
  emit('change');
}

function addRow() {
  rows.push({ key: '', value: '' });
}

function removeRow(index: number) {
  rows.splice(index, 1);
  commit();
}

function onKey(index: number, key: string) {
  rows[index].key = key;
  commit();
}

function onValue(index: number, value: unknown) {
  rows[index].value = value;
  commit();
}
</script>

<style scoped>
.kv-map__row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 6px;
}

.kv-map__key {
  width: 32%;
  flex-shrink: 0;
}

.kv-map__value {
  flex: 1;
  min-width: 0;
}
</style>
