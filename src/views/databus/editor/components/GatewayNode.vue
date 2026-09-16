<!-- 算子网关节点（WHEN/CATCH/AND/OR/NOT 自建，或 IF/SWITCH/循环的 condition 充当）。
     形状：决策类（IF/SWITCH/循环）菱形，并行/逻辑类（WHEN/AND/OR）圆形，NOT 圆形，CATCH 菱形。
     出口 handle 按 outlets 动态生成，分支归属用 sourceHandle 表达。
-->
<template>
  <div
    class="cmp-gateway"
    :class="[shapeClass, { 'is-selected': selected }]"
    :style="{ '--gw-color': data.color }"
  >
    <Handle type="target" :position="Position.Top" />
    <div class="cmp-gateway__inner">
      <SvgIcon class="cmp-gateway__icon" :icon-class="iconName" />
      <span v-if="symbol" class="cmp-gateway__symbol">{{ symbol }}</span>
    </div>
    <div class="cmp-gateway__label">{{ data.label }}</div>
    <!-- 网关出口 handle：按 outlets 数量在底部分布 -->
    <Handle
      v-for="out in data.outlets"
      :id="out.handle"
      :key="out.handle"
      type="source"
      :position="Position.Bottom"
      :style="handleStyle(out.handle)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position, type NodeProps } from '@vue-flow/core';
import type { CmpNodeData } from '../composables/useElTreeModel';
import { getDef } from '../cmp-defs';

const props = defineProps<NodeProps<CmpNodeData>>();

const iconName = computed(() => getDef(props.data.defType)?.icon ?? '');

/** 形状 class：决策类菱形，并行/逻辑类圆形 */
const shapeClass = computed(() => {
  const k = props.data.gatewayKind ?? (props.data.isCondition ? 'decision' : '');
  if (k === 'WHEN' || k === 'AND' || k === 'OR' || k === 'NOT') return 'is-circle';
  return 'is-diamond';
});

/** 逻辑算子用字符标识: AND=+, OR=*, NOT=- */
const symbol = computed(() => {
  const k = props.data.gatewayKind;
  if (k === 'AND') return '+';
  if (k === 'OR') return '×';
  if (k === 'NOT') return '¬';
  return '';
});

/** 多 handle 沿底边均匀分布：第 i 个 handle 的 left% */
function handleStyle(handle: string): Record<string, string> {
  const outlets = props.data.outlets ?? [];
  const idx = outlets.findIndex((o) => o.handle === handle);
  const n = outlets.length || 1;
  const left = n === 1 ? 50 : (idx / (n - 1)) * 100;
  return { left: `${left}%` };
}
</script>

<style scoped>
.cmp-gateway {
  position: relative;
  width: 56px;
  height: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  --gw-color: #409eff;
}

.cmp-gateway__inner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: var(--gw-color);
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  box-shadow: 0 1px 4px rgb(0 0 0 / 15%);
}

/* 菱形：clip-path 切角 */
.cmp-gateway.is-diamond .cmp-gateway__inner {
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  border-radius: 0;
}

/* 圆形：border-radius 50% */
.cmp-gateway.is-circle .cmp-gateway__inner {
  border-radius: 50%;
}

/* 选中态：形状外发一圈同色光晕 */
.cmp-gateway.is-selected .cmp-gateway__inner {
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--gw-color) 35%, transparent),
    0 1px 4px rgb(0 0 0 / 15%);
}

.cmp-gateway__icon {
  font-size: 18px;
}

.cmp-gateway__symbol {
  font-size: 18px;
  line-height: 1;
}

.cmp-gateway__label {
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
</style>
