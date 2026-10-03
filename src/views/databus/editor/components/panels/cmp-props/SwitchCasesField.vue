<!--
  SWITCH 分支(case)名编辑表单项：未挂条件件的 SWITCH 网关表单与算子表单两处共用。
  case 名读写动作来自 provide 的 useSwitchCasesActions（落 SWITCH 算子 outletLabels）。
-->
<template>
  <el-form-item label="分支 (case)">
    <div class="cmp-cases">
      <div v-for="(name, i) in actions.caseNames.value" :key="i" class="cmp-cases__row">
        <el-input
          :model-value="name"
          size="small"
          placeholder="case 名（路由按此名命中）"
          @change="(v: string) => actions.onCaseNameChange(i, v)"
        />
        <el-button
          :icon="Delete"
          size="small"
          text
          :disabled="actions.caseNames.value.length <= 1"
          @click="actions.removeCase(i)"
        />
      </div>
      <el-button size="small" :icon="Plus" @click="actions.addCase">添加分支</el-button>
    </div>
  </el-form-item>
</template>

<script setup lang="ts">
import { Delete, Plus } from '@element-plus/icons-vue';
import { ElButton, ElFormItem, ElInput } from 'element-plus';
import { useSwitchCasesActions } from './useSwitchCases';

defineOptions({ name: 'SwitchCasesField' });

const actions = useSwitchCasesActions();
</script>

<style scoped>
.cmp-cases {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.cmp-cases__row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.cmp-cases__row :deep(.el-input) {
  flex: 1;
}
</style>
