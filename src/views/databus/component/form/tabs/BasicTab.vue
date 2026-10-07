<!-- ① 基础 Tab：编码（编辑禁改）/名称/短名/台账分类/描述 -->
<template>
  <el-tab-pane name="basic">
    <template #label>
      <TabLabel title="基础" :invalid="invalid" />
    </template>
    <el-form-item label="组件编码" prop="componentCode">
      <el-input
        v-model="form.componentCode"
        maxlength="64"
        placeholder="字母开头，字母/数字/-/_，如 myAtom"
        :disabled="isEdit"
      />
      <div v-if="isEdit" class="cf-hint">编码被链路引用，创建后不可改；换码请删除重建。</div>
    </el-form-item>
    <el-form-item label="组件名称" prop="componentName">
      <el-input v-model="form.componentName" maxlength="100" placeholder="用户可读名称，如 我的原子" />
    </el-form-item>
    <el-form-item label="短名（物料网格用，可留空）">
      <el-input v-model="form.shortName" maxlength="50" placeholder="缺省显示组件名称" />
    </el-form-item>
    <el-form-item label="台账分类" prop="category">
      <el-select v-model="form.category" placeholder="请选择分类" style="width: 100%">
        <el-option
          v-for="item in CATEGORY_OPTIONS"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        />
      </el-select>
    </el-form-item>
    <el-form-item label="描述">
      <el-input
        v-model="form.description"
        type="textarea"
        :autosize="{ minRows: 4 }"
        maxlength="500"
        show-word-limit
        placeholder="一句话说明这个组件做什么"
      />
    </el-form-item>
  </el-tab-pane>
</template>

<script setup lang="ts">
import { CATEGORY_OPTIONS } from '../../model/labels';
import type { ComponentFormModel } from '../form.types';
import TabLabel from './TabLabel.vue';

defineOptions({ name: 'BasicTab' });

defineProps<{
  form: ComponentFormModel;
  isEdit: boolean;
  invalid?: boolean;
}>();
</script>

<style lang="scss" scoped>
@use './shared.scss';
</style>
