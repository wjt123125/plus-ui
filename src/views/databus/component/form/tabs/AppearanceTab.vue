<!-- ② 外观 Tab：面板分组/图标/颜色/排序/标签 -->
<template>
  <el-tab-pane name="appearance">
    <template #label>
      <TabLabel title="外观" :invalid="invalid" />
    </template>
    <el-form-item label="面板分组">
      <el-select v-model="form.groupName" placeholder="未分组" clearable style="width: 100%">
        <el-option
          v-for="g in GROUP_OPTIONS"
          :key="g.value"
          :label="g.label"
          :value="g.value"
        />
      </el-select>
    </el-form-item>
    <el-form-item label="图标（可搜索）">
      <icon-select v-model="iconValue" width="100%" />
    </el-form-item>
    <el-form-item label="面板颜色">
      <div class="cf-color">
        <el-color-picker v-model="form.color" color-format="hex" />
        <button
          v-for="c in COLOR_PRESETS"
          :key="c"
          type="button"
          class="cf-color__swatch"
          :style="{ backgroundColor: c }"
          :title="c"
          @click="form.color = c"
        />
        <el-button link type="info" size="small" @click="form.color = ''">清空</el-button>
      </div>
    </el-form-item>
    <el-form-item label="排序（数值越小越靠前）">
      <el-input
        :model-value="form.sort == null ? '' : String(form.sort)"
        placeholder="100"
        @update:model-value="handleSortUpdate"
      />
    </el-form-item>
    <el-form-item label="标签（可输入新建，回车添加）">
      <el-select
        v-model="form.tags"
        multiple
        filterable
        allow-create
        default-first-option
        collapse-tags
        collapse-tags-tooltip
        placeholder="如 HTTP、MES、回写"
        style="width: 100%"
      >
        <el-option v-for="t in tagSuggestions" :key="t" :label="t" :value="t" />
      </el-select>
    </el-form-item>
  </el-tab-pane>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { GROUP_OPTIONS } from '../../model/labels';
import type { ComponentFormModel } from '../form.types';
import TabLabel from './TabLabel.vue';

defineOptions({ name: 'AppearanceTab' });

const COLOR_PRESETS = [
  '#409eff',
  '#67c23a',
  '#e6a23c',
  '#f56c6c',
  '#909399',
  '#9b59b6',
  '#1abc9c',
  '#165dff'
];

const props = defineProps<{
  form: ComponentFormModel;
  tagSuggestions: string[];
  invalid?: boolean;
}>();

/** icon-select 要求 string 入参，空值归一为空串 */
const iconValue = computed({
  get: () => props.form.icon ?? '',
  set: (v: string) => {
    props.form.icon = v || null;
  }
});

/** 排序输入：空串/非数字归 undefined，让后端兜底默认值 */
function handleSortUpdate(value: string) {
  if (value === '') {
    props.form.sort = undefined;
    return;
  }
  const num = Number(value);
  props.form.sort = Number.isNaN(num) ? undefined : num;
}
</script>

<style lang="scss" scoped>
.cf-color {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  &__swatch {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    cursor: pointer;
    padding: 0;
    transition: transform 0.15s;

    &:hover {
      transform: scale(1.12);
    }
  }
}
</style>
