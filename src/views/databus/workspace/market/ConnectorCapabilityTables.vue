<template>
  <section class="cct">
    <h4 class="cct__sec">操作（{{ operationRows.length }}）</h4>
    <el-table v-if="operationRows.length" :data="operationRows" size="small" border>
      <el-table-column label="操作名" prop="name" min-width="110" show-overflow-tooltip />
      <el-table-column label="标签" prop="label" min-width="100" show-overflow-tooltip />
      <el-table-column label="组件编码" prop="componentId" min-width="120" show-overflow-tooltip />
      <el-table-column label="入参" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">{{ paramNames(row) }}</template>
      </el-table-column>
      <el-table-column label="产出" min-width="110" show-overflow-tooltip>
        <template #default="{ row }">{{ row.outputs?.length ? row.outputs.join('、') : '—' }}</template>
      </el-table-column>
    </el-table>
    <p v-else class="cct__summary">{{ opsEmptyText }}</p>

    <h4 class="cct__sec">连接配置字段（{{ configRows.length }}）</h4>
    <el-table v-if="configRows.length" :data="configRows" size="small" border>
      <el-table-column label="字段名" prop="name" min-width="110" show-overflow-tooltip />
      <el-table-column label="标签" min-width="90" show-overflow-tooltip>
        <template #default="{ row }">{{ row.field.label || '—' }}</template>
      </el-table-column>
      <el-table-column label="类型" width="76">
        <template #default="{ row }">{{ row.field.type || '—' }}</template>
      </el-table-column>
      <!-- widget 为空则由 type 推断控件（类型定义里的口径），如实说明而不是猜一个填上 -->
      <el-table-column label="控件" width="116">
        <template #default="{ row }">{{ row.field.widget || '按类型推断' }}</template>
      </el-table-column>
      <el-table-column label="必填" width="58" align="center">
        <template #default="{ row }">{{ row.field.required ? '是' : '' }}</template>
      </el-table-column>
      <el-table-column label="敏感" width="58" align="center">
        <template #default="{ row }">{{ row.field.sensitive ? '是' : '' }}</template>
      </el-table-column>
      <el-table-column label="分组" width="76">
        <template #default="{ row }">{{ row.field.group || '—' }}</template>
      </el-table-column>
      <el-table-column label="显示条件" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">{{ showWhenText(row.field.showWhen) || '—' }}</template>
      </el-table-column>
    </el-table>
    <p v-else class="cct__summary">{{ configEmptyText }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ConnectorConfigField, ConnectorOperationDef, ConnectorShowWhen } from '@/api/databus/connector/types';

defineOptions({ name: 'ConnectorCapabilityTables' });

const props = defineProps<{
  /** 操作清单（manifest.operations；已装载时后端用运行态 describe() 覆盖） */
  operations?: ConnectorOperationDef[] | null;
  /** Connection 配置 schema（字段名 → 字段定义） */
  configSchema?: Record<string, ConnectorConfigField> | null;
  /** 连接器没在跑时后端给的人话原因；有值说明两张表是「取不到」而不是「没有」 */
  loadProblem?: string | null;
}>();

/** 空态文案：没装载就照实说取不到并给一次原因（原因只在这里出现一次，配置表只说「同样取不到」） */
const opsEmptyText = computed(() =>
  props.loadProblem ? `连接器没在跑，操作清单取不到：${props.loadProblem}` : '该连接器未声明操作。'
);
const configEmptyText = computed(() =>
  props.loadProblem ? '连接器没在跑，连接配置同样取不到（原因见上一行）。' : '该连接器不需要连接配置（configSchema 为空）。'
);

const operationRows = computed<ConnectorOperationDef[]>(() => props.operations ?? []);

/** configSchema 是「字段名 → 字段定义」的 Map，表格要行，故摊平（Object.entries 保留声明顺序） */
const configRows = computed<{ name: string; field: ConnectorConfigField }[]>(() =>
  Object.entries(props.configSchema ?? {}).map(([name, field]) => ({ name, field }))
);

/** 操作入参只列名字：字段细节属组件物料的表单，不在这里展开（params 同为 Map） */
function paramNames(op: ConnectorOperationDef): string {
  const names = Object.keys(op.params ?? {});
  return names.length > 0 ? names.join('、') : '—';
}

/** showWhen → 人话：eq/ne/in/notIn 同时给多条是 AND（类型定义里的口径），故用「且」串起来 */
function showWhenText(sw?: ConnectorShowWhen | null): string {
  if (!sw?.field) {
    return '';
  }
  const parts: string[] = [];
  if (sw.eq != null) {
    parts.push(`${sw.field} = ${sw.eq}`);
  }
  if (sw.ne != null) {
    parts.push(`${sw.field} ≠ ${sw.ne}`);
  }
  if (sw.in?.length) {
    parts.push(`${sw.field} ∈ [${sw.in.join(', ')}]`);
  }
  if (sw.notIn?.length) {
    parts.push(`${sw.field} ∉ [${sw.notIn.join(', ')}]`);
  }
  return parts.join(' 且 ');
}
</script>

<style lang="scss" scoped>
.cct__sec {
  margin: 18px 0 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);

  &:first-child {
    margin-top: 0;
  }
}

.cct__summary {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
</style>
