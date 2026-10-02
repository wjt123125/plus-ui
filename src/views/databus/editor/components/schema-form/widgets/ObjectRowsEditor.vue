<!-- OBJECT_ROWS：List<Bean> 行编辑（boList/fields/mappings 等）。
     列＝元素 Bean 的 fields；标量列行内 FieldControl；OBJECT 列用 popover 弹层
     （行内塞分组表单太宽，如 boCreate.rewrite）；其余容器型列兜底 JSON 高级模式。
     行对象是父模型数组内同一引用，直接改属性；增删行替换数组并冒泡 change。 -->
<template>
  <div class="object-rows">
    <el-table :data="rows" size="small" border class="object-rows__table">
      <el-table-column
        v-for="col in fields"
        :key="col.name"
        :label="col.label || col.name"
        :min-width="colMinWidth(col)"
      >
        <template #default="{ row, $index }">
          <!-- 行内嵌套对象：弹层编辑（boCreate.boList[].rewrite） -->
          <el-popover
            v-if="col.widget === 'OBJECT'"
            placement="bottom-start"
            :width="340"
            trigger="click"
          >
            <template #reference>
              <el-button size="small" plain @click="ensureNested($index, col)">
                {{ nestedLabel(row[col.name]) }}
              </el-button>
            </template>
            <div class="object-rows__nested-title">{{ col.label || col.name }}</div>
            <SchemaField
              v-for="child in col.fields ?? []"
              :key="child.name"
              :field="child"
              :model="nestedModel(row, col)"
              :name-path="`${col.name}.${child.name}`"
              @change="emitChange"
            />
          </el-popover>

          <FieldControl
            v-else
            :field="col"
            :model-value="row[col.name]"
            @update:model-value="onCellUpdate($index, col.name, $event)"
          />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="56" align="center" fixed="right">
        <template #default="{ $index }">
          <el-button link type="danger" :icon="Delete" @click="removeRow($index)" />
        </template>
      </el-table-column>
      <template #empty>暂无行，点下方按钮添加</template>
    </el-table>
    <el-button class="object-rows__add" size="small" :icon="Plus" @click="addRow">添加一行</el-button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElButton, ElPopover, ElTable, ElTableColumn } from 'element-plus';
import { Delete, Plus } from '@element-plus/icons-vue';
import type { PropSchema } from '@/api/databus/component/types';
import FieldControl from '../FieldControl.vue';
import SchemaField from '../SchemaField.vue';

defineOptions({ name: 'ObjectRowsEditor' });

const props = defineProps<{
  modelValue?: unknown;
  fields: PropSchema[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: unknown): void;
  (e: 'change'): void;
}>();

const rows = computed<Record<string, unknown>[]>(() =>
  Array.isArray(props.modelValue) ? (props.modelValue as Record<string, unknown>[]) : []
);

function colMinWidth(col: PropSchema): number {
  if (col.widget === 'OBJECT') return 120;
  if (col.widget === 'TEXTAREA' || col.widget === 'JSON') return 200;
  if (col.widget === 'BOOLEAN') return 80;
  return 150;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** 弹层打开时确保嵌套对象已建（行内预建，避免子控件写冻结空对象） */
function ensureNested(index: number, col: PropSchema) {
  const row = rows.value[index];
  if (row && !isPlainObject(row[col.name])) {
    row[col.name] = {};
    emitChange();
  }
}

/** 嵌套 SchemaField 的模型；未建时给冻结空对象（渲染只读兜底，点击时 ensureNested 已预建） */
const FROZEN_EMPTY = Object.freeze({}) as Record<string, unknown>;
function nestedModel(row: Record<string, unknown>, col: PropSchema): Record<string, unknown> {
  const v = row[col.name];
  return isPlainObject(v) ? v : FROZEN_EMPTY;
}

function nestedLabel(value: unknown): string {
  if (!isPlainObject(value)) return '设置';
  return Object.keys(value).length ? '编辑策略' : '设置';
}

function commit(next: Record<string, unknown>[]) {
  emit('update:modelValue', next);
  emit('change');
}

function addRow() {
  commit([...rows.value, {}]);
}

function removeRow(index: number) {
  commit(rows.value.filter((_, i) => i !== index));
}

function onCellUpdate(index: number, name: string, value: unknown) {
  const next = rows.value.map((row, i) => {
    if (i !== index) return row;
    return { ...row, [name]: value };
  });
  commit(next);
}

function emitChange() {
  emit('change');
}
</script>

<style scoped>
.object-rows__table {
  width: 100%;
}

.object-rows__add {
  margin-top: 6px;
}

.object-rows__nested-title {
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}
</style>
