<!--
  普通算子网关（WHEN/CATCH/AND/OR/NOT/CHAIN 及 SWITCH 空菱形）：
  SWITCH case 管理、布尔操作数导航、CHAIN 子流程引用三选一特化，其余算子只编辑 tag。
  注意：已挂条件件的菱形（isConditionLeaf）不会进入本件，由叶子表单接管，
  否则条件配置会被算子 tag 截胡（投影节点同时带 operator+isCondition）。
-->
<template>
  <el-form label-position="top" size="small" class="cmp-gate__form">
    <SwitchCasesField v-if="ctx.needsCasesEdit.value" />
    <BooleanOperands v-if="ctx.isBooleanOpNode.value" />
    <!-- CHAIN 子流程：下拉选子链（值=子链 chainCode，存 ElNode.cmpId） -->
    <el-form-item v-if="ctx.isChainNode.value" label="引用子流程">
      <ChainSelect
        :model-value="chainRefCode"
        :exclude-id="editingChainId"
        openable
        placeholder="选择要引用的子流程"
        @update:model-value="onChainRefChange"
      />
      <div class="cmp-field__hint">
        运行时按子链编码在已发布链路中查找；草稿/已下线状态的子链需先发布才能被引用
      </div>
    </el-form-item>
    <el-form-item v-else label="标签 tag">
      <el-input
        v-model="tag"
        placeholder="可选，对应 EL 的 .tag(&quot;x&quot;)"
        clearable
        @change="onTagChange"
      />
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElForm, ElFormItem, ElInput } from 'element-plus';
import { useElTreeModelInject } from '../../../composables/useElTreeModel';
import ChainSelect from '../../common/ChainSelect.vue';
import BooleanOperands from './BooleanOperands.vue';
import SwitchCasesField from './SwitchCasesField.vue';
import { usePropsContext } from './usePropsContext';

defineOptions({ name: 'OperatorGateFields' });

const emit = defineEmits<{ (e: 'data-change'): void }>();

const ctx = usePropsContext();
const treeModel = useElTreeModelInject();
const route = useRoute();

const tag = ref('');

// 切节点即重建；immediate 同步算子 tag
watch(
  () => [ctx.elNode.value?.id, ctx.elNode.value?.tag] as const,
  () => {
    tag.value = ctx.elNode.value?.tag ?? '';
  },
  { immediate: true }
);

function onTagChange() {
  const n = ctx.canvasNode.value;
  if (!n) return;
  treeModel.updateOperatorTag(n.id, tag.value);
  emit('data-change');
}

/** 当前引用的子链编码 */
const chainRefCode = computed(() => ctx.elNode.value?.cmpId ?? '');

/** 当前编辑链主键（路由 query.id）：下拉据此排除自身防直接递归；实验模式无 id 不排除 */
const editingChainId = computed(() => {
  const id = route.query.id;
  return id === undefined || id === null || id === '' ? null : String(id);
});

function onChainRefChange(chainCode: string) {
  const n = ctx.elNode.value;
  if (!n) return;
  treeModel.updateChainRef(n.id, chainCode);
  emit('data-change');
}
</script>

<style scoped>
.cmp-gate__form {
  margin-top: 4px;
}

.cmp-field__hint {
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}
</style>
