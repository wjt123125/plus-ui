<!--
  条件菱形未挂条件件时：按算子类型选择对应条件组件（IF/WHILE 布尔件、循环/SWITCH 专属件）；
  SWITCH 同时在上方维护 case 分支名。挂载后本分支消失，落到对应叶子表单。
-->
<template>
  <el-form label-position="top" size="small" class="cmp-gate__form">
    <SwitchCasesField v-if="ctx.opNode.value?.type === 'SWITCH'" />
    <el-form-item :label="`${ctx.opNode.value?.type} 条件组件`">
      <el-select
        :model-value="''"
        placeholder="选择条件组件"
        style="width: 100%"
        @change="slot.onPickCondition"
      >
        <el-option
          v-for="d in slot.condPickDefs.value"
          :key="d.type"
          :label="d.label"
          :value="d.type"
        >
          <span>{{ d.label }}</span>
          <span class="cmp-gate__opt-desc">{{ d.desc }}</span>
        </el-option>
      </el-select>
      <div class="cmp-field__hint">{{ slot.conditionSlotHint.value }}</div>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { ElForm, ElFormItem, ElOption, ElSelect } from 'element-plus';
import SwitchCasesField from './SwitchCasesField.vue';
import { useConditionSlotActions } from './useConditionSlot';
import { usePropsContext } from './usePropsContext';

defineOptions({ name: 'ConditionGateFields' });

const ctx = usePropsContext();
const slot = useConditionSlotActions();
</script>

<style scoped>
.cmp-gate__form {
  margin-top: 4px;
}

.cmp-gate__opt-desc {
  margin-left: 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.cmp-field__hint {
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}
</style>
