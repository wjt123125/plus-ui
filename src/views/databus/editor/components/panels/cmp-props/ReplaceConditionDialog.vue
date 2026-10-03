<!--
  更换条件组件弹层：候选随所属算子变化（IF/WHILE→布尔物料，循环/SWITCH→专属控制组件）。
  显隐与选中态来自 provide 的 useConditionSlotActions，叶子表单上的「更换」按钮打开本件。
-->
<template>
  <el-dialog
    v-model="visible"
    title="更换条件组件"
    width="360px"
    append-to-body
  >
    <el-radio-group v-model="slot.pendingConditionType.value" class="cmp-replace__radio-col">
      <el-radio
        v-for="d in slot.condPickDefs.value"
        :key="d.type"
        :value="d.type"
        style="display: flex; margin: 6px 0"
      >
        <span>{{ d.label }}</span>
        <span class="cmp-replace__opt-desc">{{ d.desc }}</span>
      </el-radio>
    </el-radio-group>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="slot.confirmReplaceCondition()">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElButton, ElDialog, ElRadio, ElRadioGroup } from 'element-plus';
import { useConditionSlotActions } from './useConditionSlot';

defineOptions({ name: 'ReplaceConditionDialog' });

const slot = useConditionSlotActions();

// el-dialog v-model 需要可写引用：直接桥接 provide 的 Ref<boolean>
const visible = computed({
  get: () => slot.replaceDialogVisible.value,
  set: (v: boolean) => {
    slot.replaceDialogVisible.value = v;
  }
});
</script>

<style scoped>
.cmp-replace__radio-col {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.cmp-replace__opt-desc {
  margin-left: 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
</style>
