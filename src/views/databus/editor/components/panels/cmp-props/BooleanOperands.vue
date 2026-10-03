<!--
  AND/OR/NOT 只读操作数导航：按槽位基数列操作数摘要（如 $.code = 200），
  空槽显虚线提示；点有内容的操作数选中并居中跳到那颗条件豆子；
  并暴露基数约束（NOT=1、AND/OR≥2）。编辑动作仍在画布槽位完成。
-->
<template>
  <el-form-item label="操作数">
    <div class="cmp-operands">
      <button
        v-for="(op, i) in operands"
        :key="i"
        type="button"
        class="cmp-operand"
        :class="{ 'is-empty': !op.node, 'is-clickable': !!op.node }"
        @click="op.node && onJump(op.node.id)"
      >
        <span class="cmp-operand__idx">{{ i + 1 }}</span>
        <span class="cmp-operand__text">
          {{ op.node ? op.summary : `空槽位：拖入${slotLabel}条件件` }}
        </span>
        <el-icon v-if="op.node" class="cmp-operand__arrow"><ArrowRight /></el-icon>
      </button>
    </div>
    <div v-if="arityHint" class="cmp-field__hint cmp-field__hint--danger">
      {{ arityHint }}
    </div>
    <div v-else class="cmp-field__hint">点击操作数可跳到对应条件件；增删在画布槽位上操作</div>
  </el-form-item>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ArrowRight } from '@element-plus/icons-vue';
import { useVueFlow } from '@vue-flow/core';
import { ElFormItem, ElIcon } from 'element-plus';
import { summarizeCondition, type ElNode } from '../../../composables/useElTreeModel';
import { useCanvasController } from '../../../composables/useCanvasController';
import { BOOLEAN_OP_ARITY } from './constants';
import { usePropsContext } from './usePropsContext';

defineOptions({ name: 'BooleanOperands' });

const ctx = usePropsContext();
const ctrl = useCanvasController();

interface BooleanOperand {
  node: ElNode | null;
  summary: string;
}

/** 空槽位提示里的归属文案 */
const slotLabel = computed(() => ctx.elNode.value?.type ?? '');

/** 按槽位基数列出操作数（不足补空槽）；摘要复用 IF 出口的 summarizeCondition */
const operands = computed<BooleanOperand[]>(() => {
  const n = ctx.elNode.value;
  if (!n || !ctx.isBooleanOpNode.value) return [];
  const arity = BOOLEAN_OP_ARITY[n.type] ?? 0;
  return Array.from({ length: arity }, (_, i) => {
    const child = n.children?.[i] ?? null;
    return { node: child, summary: child ? summarizeCondition(child) : '' };
  });
});

/** 基数违规提示：NOT 超 1 个（异常插入护栏缺失时可能发生）、AND/OR 不足 2 个 */
const arityHint = computed(() => {
  const n = ctx.elNode.value;
  if (!n || !ctx.isBooleanOpNode.value) return '';
  const filled = (n.children ?? []).filter((c) => !!c).length;
  if (n.type === 'NOT') {
    return filled > 1 ? `NOT 只能挂 1 个操作数，当前挂了 ${filled} 个` : '';
  }
  return filled < 2 ? `至少需要 2 个操作数，当前已挂 ${filled} 个` : '';
});

/** 点操作数：选中并居中跳到那颗条件豆子（与大纲定位同款：单选 + addSelectedNodes + setCenter） */
const { findNode: findCanvasNode, addSelectedNodes, setCenter } = useVueFlow();

function onJump(nodeId: string) {
  ctrl.deselect();
  ctrl.select(nodeId);
  const target = findCanvasNode(nodeId);
  if (target) {
    addSelectedNodes([target]);
    const w = target.dimensions?.width || 150;
    const h = target.dimensions?.height || 56;
    setCenter(target.position.x + w / 2, target.position.y + h / 2, { duration: 300 });
  }
}
</script>

<style scoped>
.cmp-operands {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

/* 操作数导航行：序号徽标 + 摘要 + 跳转箭头；空槽位灰显不可点 */
.cmp-operand {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 6px 8px;
  font-size: 12px;
  text-align: left;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}

.cmp-operand.is-clickable {
  cursor: pointer;
}

.cmp-operand.is-clickable:hover {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
}

.cmp-operand.is-empty {
  color: var(--el-text-color-secondary);
  border-style: dashed;
}

.cmp-operand__idx {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  font-size: 11px;
  color: #fff;
  background: var(--el-color-primary);
  border-radius: 50%;
}

.cmp-operand.is-empty .cmp-operand__idx {
  background: var(--el-text-color-disabled);
}

.cmp-operand__text {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.cmp-operand__arrow {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}

.cmp-field__hint {
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.cmp-field__hint--danger {
  color: var(--el-color-danger);
}
</style>
