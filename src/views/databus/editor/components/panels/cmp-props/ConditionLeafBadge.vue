<!--
  已挂条件件叶子的顶部标识：所属算子 + 当前条件物料名 + 「更换条件组件」按钮。
  schema 叶子 / switchRoute / 脚本三个叶子表单共用。
-->
<template>
  <el-form-item :label="badgeLabel">
    <el-tag size="small" type="warning">{{ ctx.leafDef.value?.label ?? ctx.elNode.value?.componentCode }}</el-tag>
    <el-button size="small" text type="primary" @click="slot.openReplaceCondition()">更换条件组件</el-button>
  </el-form-item>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElButton, ElFormItem, ElTag } from 'element-plus';
import { useConditionSlotActions } from './useConditionSlot';
import { usePropsContext } from './usePropsContext';

defineOptions({ name: 'ConditionLeafBadge' });

const ctx = usePropsContext();
const slot = useConditionSlotActions();

const badgeLabel = computed(() => `${ctx.opNode.value?.type ?? ''} 条件组件`.trim());
</script>
