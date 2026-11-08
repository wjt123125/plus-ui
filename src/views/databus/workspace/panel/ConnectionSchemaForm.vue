<!--
  连接器配置动态表单（方案 §8.2 / §10.3）：按 configSchema 渲染一个分组（tab）内的全部字段。

  布局契约（全部来自连接器声明的分组元数据，前端不写死）：
  - 组内栅格份数由 group.columns 决定（正整数，缺省 2；1=单列），窄屏（≤720px）自动退化为单列；
  - 字段占几份由 field.span 决定（1..columns），所以 3 份 + 1 份可以同行表达「宽字段：窄字段」。

  复用 editor/components/schema-form/SchemaField.vue（而不是只复用 FieldControl）：
  SchemaField 已经把 el-form-item + required 星号 + description + showWhen 条件显示
  + KEY_VALUE_MAP / OBJECT_ROWS 容器控件全部接好了，连接表单要的正是这一套；
  不复用的是 SchemaForm.vue——它绑死 exprRole / ExprInput（`{{ }}` 表达式），对连接配置无意义。

  红线：本组件不持有 config 副本，直接在 model 上原地读写（与 SchemaField 的既有约定一致）；
  必填规则由宿主用 buildConfigRules 生成后挂到 el-form :rules，本组件只负责渲染。
-->
<template>
  <div class="conn-fields" :style="gridStyle">
    <SchemaField
      v-for="item in entries"
      :key="item.name"
      :field="item.propSchema"
      :model="model"
      :name-path="`config.${item.name}`"
      description-as-tooltip
      :grid-span="item.span"
    />
  </div>
</template>

<script setup lang="ts" name="ConnectionSchemaForm">
import { computed } from 'vue';
import SchemaField from '@/views/databus/editor/components/schema-form/SchemaField.vue';
import type { ConnectorConfigField } from '@/api/databus/connector/types';
import { fieldsOfGroup, toPropSchema } from './connectionSchema';

const props = withDefaults(
  defineProps<{
    /** 连接配置对象（原地读写，宿主传 form.config） */
    model: Record<string, unknown>;
    /** 所选连接器的 configSchema */
    schema: Record<string, ConnectorConfigField>;
    /** 只渲染这个分组（tab 的 key）；不传则渲染全部 */
    group?: string;
    /** 组内栅格份数（来自分组元数据；缺省 2） */
    columns?: number;
    /** 编辑态：sensitive 字段的必填摘掉（后端不回显密码，留空即沿用旧值） */
    isEdit?: boolean;
  }>(),
  { group: '', columns: 2, isEdit: false }
);

/** 归一化栅格份数：只接受 1..12 的整数，其余按双列兜底 */
const cols = computed(() => {
  const n = Math.trunc(Number(props.columns));
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : 2;
});

/** 列数用真实字符串内联，不用 CSS 变量拼 repeat()：变量替换会让整条声明失效、退化成 auto 列宽 */
const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${cols.value}, minmax(0, 1fr))`
}));

/**
 * 本 tab 要渲染的字段（顺序＝schema 声明序）。
 * 平移结果缓存在 computed 里，避免模板内联调用每次渲染都重建对象、把 SchemaField 的 props 打脏。
 */
const entries = computed(() => {
  const all = props.group ? fieldsOfGroup(props.schema, props.group) : Object.entries(props.schema);
  const total = cols.value;
  return all.map(([name, field]) => {
    const declared = Math.trunc(Number(field.span ?? 1));
    const span = total === 1 ? undefined : Math.min(Math.max(declared || 1, 1), total);
    return {
      name,
      propSchema: toPropSchema(name, field, props.isEdit),
      span
    };
  });
});
</script>

<style scoped>
.conn-fields {
  display: grid;
  gap: 0 20px;
}

/* 数值控件默认居中，端口号这种短数字居中后会像被孤立在长条中间，统一左对齐 */
.conn-fields :deep(.el-input-number .el-input__inner) {
  text-align: left;
}

/* 数字字段收窄：端口 / 超时 / 池大小都是几位数，拉满整列会让输入框空得刺眼；
   宽度按内容定，是「字段宽度要反映值的长度」这条视觉语义的落地。
   带单位的数值同样是短值，一起收窄（单位后缀算在宽度里） */
.conn-fields :deep(.el-input-number),
.conn-fields :deep(.field-control__numeric) {
  max-width: 180px;
}

.conn-fields :deep(.el-form-item) {
  min-width: 0;
}

/* 窄屏一律单列：双列表单在手机/窄侧栏里会把标签和输入框挤成两行。
   内联的 repeat(N) 与 span 都要压掉，否则 span 会在单列栅格里自己撑出隐式列 */
@media (max-width: 720px) {
  .conn-fields {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  .conn-fields :deep(.el-form-item) {
    grid-column: 1 / -1 !important;
  }
}
</style>