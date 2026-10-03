<!--
  属性面板薄壳：直接读写 ElNode 模型树，不回写画布 data。
  只负责 header/不可编辑提示与五个编辑分支的装配；形态判据在 usePropsContext，
  条件槽与 SWITCH case 动作各自 provide，分支组件内聚在 cmp-props/ 目录。
-->
<template>
  <div class="cmp-props">
    <div v-if="!node" class="cmp-props__empty">
      <el-empty description="选中画布节点后配置参数" :image-size="80" />
    </div>

    <template v-else>
      <div class="cmp-props__header">
        <span class="cmp-props__title">
          <span class="cmp-props__dot" :style="{ backgroundColor: node.data.color }" />
          {{ ctx.headerLabel.value }}
        </span>
        <el-tag v-if="node.data.virtual" size="small" type="info">虚拟节点</el-tag>
        <el-tag v-else-if="ctx.isJunction.value" size="small" type="info">汇合点</el-tag>
        <el-tag v-else-if="ctx.isPlaceholder.value" size="small" type="info">空槽</el-tag>
        <el-tag v-else-if="node.data.operator" size="small" type="warning">算子</el-tag>
      </div>

      <NodeTitleField v-if="ctx.canEditTitle.value" @data-change="emit('data-change')" />

      <el-alert
        v-if="node.data.virtual"
        :title="ctx.virtualHint.value"
        type="info"
        :closable="false"
        show-icon
      />

      <!-- junction/placeholder 不可编辑 -->
      <div v-else-if="ctx.isJunction.value || ctx.isPlaceholder.value" class="cmp-props__hint-box">
        <span v-if="ctx.isJunction.value">汇合锚点是分支结构自动产生的虚拟节点，不可单独编辑。</span>
        <span v-else>拖入业务组件可替换此空槽。</span>
      </div>

      <!-- 条件菱形未挂条件件：选择对应条件组件（SWITCH 兼管 case 分支名） -->
      <ConditionGateFields
        v-else-if="showConditionGate"
        @data-change="emit('data-change')"
      />

      <!-- 普通算子网关：SWITCH case / 布尔操作数导航 / CHAIN 引用 / tag -->
      <OperatorGateFields
        v-else-if="node.data.operator && !ctx.isConditionLeaf.value"
        @data-change="emit('data-change')"
      />

      <!-- switchRoute 手写表单（cases.target 吃画布 case 名，schema 表单无法表达） -->
      <SwitchRouteFields
        v-else-if="ctx.isSwitchRouteLeaf.value"
        @data-change="emit('data-change')"
      />

      <!-- 其他业务组件 / 已挂载的条件件：数据空间 + schema 表单/JSON 双模 -->
      <SchemaLeafFields v-else-if="!ctx.isScriptLeaf.value" @data-change="emit('data-change')" />

      <!-- 脚本节点（script/booleanScript）：数据空间 + language + 脚本文本 -->
      <ScriptLeafFields v-else @data-change="emit('data-change')" />

      <div
        v-if="!ctx.isJunction.value && !ctx.isPlaceholder.value"
        class="cmp-props__footer"
      >
        <el-button size="small" type="danger" plain @click="emit('delete', node.id)">删除节点</el-button>
      </div>
    </template>

    <ReplaceConditionDialog />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Node } from '@vue-flow/core';
import { ElAlert, ElButton, ElEmpty, ElTag } from 'element-plus';
import type { CmpNodeData } from '../../composables/useElTreeModel';
import ConditionGateFields from './cmp-props/ConditionGateFields.vue';
import NodeTitleField from './cmp-props/NodeTitleField.vue';
import OperatorGateFields from './cmp-props/OperatorGateFields.vue';
import ReplaceConditionDialog from './cmp-props/ReplaceConditionDialog.vue';
import SchemaLeafFields from './cmp-props/SchemaLeafFields.vue';
import ScriptLeafFields from './cmp-props/ScriptLeafFields.vue';
import SwitchRouteFields from './cmp-props/SwitchRouteFields.vue';
import {
  createConditionSlotActions,
  provideConditionSlotActions
} from './cmp-props/useConditionSlot';
import {
  createPropsContext,
  providePropsContext
} from './cmp-props/usePropsContext';
import { createSwitchCasesActions, provideSwitchCasesActions } from './cmp-props/useSwitchCases';

const props = defineProps<{
  node: Node<CmpNodeData> | null;
}>();

const emit = defineEmits<{
  (e: 'delete', id: string): void;
  (e: 'data-change'): void;
}>();

// ── 面板上下文与共享动作：壳里各建一次，子分支组件 inject ──
const ctx = createPropsContext(computed(() => props.node));
providePropsContext(ctx);

const notifyDataChange = () => emit('data-change');
const conditionSlot = createConditionSlotActions(ctx, notifyDataChange);
provideConditionSlotActions(conditionSlot);
provideSwitchCasesActions(createSwitchCasesActions(ctx, notifyDataChange));

/** 条件菱形且当前算子有候选条件件、但还没挂条件件 → 走条件件选择分支 */
const showConditionGate = computed(
  () =>
    !!props.node?.data.isCondition &&
    conditionSlot.condPickDefs.value.length > 0 &&
    !ctx.hasCondition.value
);
</script>

<style scoped>
.cmp-props {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px;
  overflow-y: auto;
}

.cmp-props__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.cmp-props__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.cmp-props__title {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.cmp-props__dot {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.cmp-props__hint-box {
  padding: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.cmp-props__footer {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>
