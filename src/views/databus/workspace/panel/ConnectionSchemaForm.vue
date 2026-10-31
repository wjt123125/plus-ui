<!--
  连接器配置动态表单（方案 §8.2 / §10.3）：按 configSchema 渲染一个分组内的全部字段。
  宿主 ConnectionFormBody 按 group 分 tab，每个 tab 放一个本组件。

  复用 editor/components/schema-form/SchemaField.vue（而不是只复用 FieldControl）：
  SchemaField 已经把 el-form-item + required 星号 + description 小灰字 + showWhen 条件显示
  + KEY_VALUE_MAP / OBJECT_ROWS 容器控件全部接好了，连接表单要的正是这一套；
  不复用的是 SchemaForm.vue——它绑死 exprRole / ExprInput（`{{ }}` 表达式），对连接配置无意义。

  红线：本组件不持有 config 副本，直接在 model 上原地读写（与 SchemaField 的既有约定一致）；
  必填规则由宿主用 buildConfigRules 生成后挂到 el-form :rules，本组件只负责渲染。
-->
<template>
  <SchemaField
    v-for="item in entries"
    :key="item.name"
    :field="item.propSchema"
    :model="model"
    :name-path="`config.${item.name}`"
  />
</template>

<script setup lang="ts" name="ConnectionSchemaForm">
import { computed } from 'vue';
import SchemaField from '@/views/databus/editor/components/schema-form/SchemaField.vue';
import type { ConnectorConfigField } from '@/api/databus/connector/types';
import { BASIC_GROUP, schemaEntries, toPropSchema } from './connectionSchema';

const props = withDefaults(
  defineProps<{
    /** 连接配置对象（原地读写，宿主传 form.config） */
    model: Record<string, unknown>;
    /** 所选连接器的 configSchema */
    schema: Record<string, ConnectorConfigField>;
    /** 只渲染这个分组；不传则渲染全部 */
    group?: string;
    /** 编辑态：sensitive 字段的必填摘掉（后端不回显密码，留空即沿用旧值） */
    isEdit?: boolean;
  }>(),
  { group: '', isEdit: false }
);

/**
 * 本 tab 要渲染的字段（顺序＝schema 声明序；无 group 的字段归「基础」）。
 * 平移结果缓存在 computed 里，避免模板内联调用每次渲染都重建对象、把 SchemaField 的 props 打脏。
 */
const entries = computed(() => {
  const want = props.group || BASIC_GROUP;
  return schemaEntries(props.schema)
    .filter(([, field]) => (field.group || BASIC_GROUP) === want)
    .map(([name, field]) => ({ name, propSchema: toPropSchema(name, field, props.isEdit) }));
});
</script>
