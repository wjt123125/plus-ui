<!--
  组件配置 schema 只读递归树：详情抽屉里展示 /options 下发的 fields。
  OBJECT / OBJECT_ROWS 的子字段递归自渲染；KEY_VALUE_MAP 展示键/值控件声明。
-->
<template>
  <div class="sft" :class="{ 'sft--nested': depth > 0 }">
    <div v-for="field in fields" :key="field.name" class="sft-item">
      <div class="sft-row">
        <span class="sft-label">
          <em v-if="field.required" class="sft-required">*</em>
          {{ field.label || field.name }}
        </span>
        <el-tag size="small" effect="plain" round>{{ widgetLabel(field.widget) }}</el-tag>
        <el-tag v-if="field.exprRole === 'DATA'" size="small" type="warning" effect="plain">数据值</el-tag>
        <el-tag v-else-if="field.exprRole === 'TARGET'" size="small" type="success" effect="plain">
          写入路径
        </el-tag>
        <span class="sft-name">{{ field.name }}</span>
      </div>
      <div v-if="field.description" class="sft-desc">{{ field.description }}</div>
      <div v-if="field.placeholder" class="sft-desc">占位提示：{{ field.placeholder }}</div>
      <div v-if="field.options && field.options.length" class="sft-options">
        <span class="sft-options-label">候选</span>
        <el-tag
          v-for="opt in field.options"
          :key="opt.value"
          size="small"
          type="info"
          effect="plain"
        >
          {{ opt.label }}（{{ opt.value }}）
        </el-tag>
      </div>
      <div v-if="field.showWhen && field.showWhen.length" class="sft-when">
        <span v-for="(cond, idx) in field.showWhen" :key="idx" class="sft-when-item">
          当 {{ cond.field }} {{ showWhenText(cond) }}
        </span>
      </div>
      <div v-if="field.widget === 'KEY_VALUE_MAP'" class="sft-kv">
        键：{{ widgetLabel(field.keyWidget) }} ｜ 值：{{ widgetLabel(field.valueWidget) }}
        <el-tag v-if="field.valueExprRole === 'DATA'" size="small" type="warning" effect="plain">
          值为数据表达式
        </el-tag>
      </div>
      <div v-if="field.fields && field.fields.length" class="sft-children">
        <div class="sft-children-title">{{ nestedTitle(field.widget) }}</div>
        <SchemaFieldTree :fields="field.fields" :depth="depth + 1" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { widgetLabel } from './component-labels';
import type { PropShowWhen, PropSchema, WidgetKind } from '@/api/databus/component/types';

// SFC 按文件名在模板内递归自引用（script setup 原生支持，无需自导入）
defineOptions({ name: 'SchemaFieldTree' });

withDefaults(
  defineProps<{
    fields?: PropSchema[] | null;
    depth?: number;
  }>(),
  { fields: () => [], depth: 0 }
);

/** showWhen 单条件文本（eq/ne/in/notIn 四选一，后端保证） */
function showWhenText(cond: PropShowWhen): string {
  if (cond.eq != null) {
    return `= ${cond.eq}`;
  }
  if (cond.ne != null) {
    return `≠ ${cond.ne}`;
  }
  if (cond.in && cond.in.length) {
    return `∈ [${cond.in.join(' / ')}]`;
  }
  if (cond.notIn && cond.notIn.length) {
    return `∉ [${cond.notIn.join(' / ')}]`;
  }
  return '条件显隐';
}

function nestedTitle(widget: WidgetKind): string {
  if (widget === 'OBJECT') {
    return '对象字段';
  }
  if (widget === 'OBJECT_ROWS') {
    return '每行对象字段';
  }
  return '子字段';
}
</script>

<style lang="scss" scoped>
.sft {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sft--nested {
  margin-top: 8px;
  padding-left: 12px;
  border-left: 2px solid var(--el-border-color-lighter, #ebeef5);
}

.sft-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sft-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.sft-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary, #1d2129);
}

.sft-required {
  color: var(--el-color-danger, #f56c6c);
  font-style: normal;
  margin-right: 2px;
}

.sft-name {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.sft-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.sft-options,
.sft-when,
.sft-kv {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.sft-options-label,
.sft-when-item {
  flex-shrink: 0;
}

.sft-when-item {
  padding: 1px 8px;
  border-radius: 9999px;
  background: var(--el-fill-color-light, #f5f7fa);
}

.sft-children {
  margin-top: 2px;
}

.sft-children-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 2px;
}
</style>
