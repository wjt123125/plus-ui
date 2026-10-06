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
    <Handle type="target" :position="Position.Left" />
    <div class="cmp-gateway__inner">
      <SvgIcon class="cmp-gateway__icon" :icon-class="iconName" />
      <span v-if="symbol" class="cmp-gateway__symbol">{{ symbol }}</span>
    </div>
    <div class="cmp-gateway__label">{{ data.label }}</div>
    <!-- 网关出口 handle：按 outlets 数量在右边分布 -->
    <Handle
      v-for="out in data.outlets"
      :id="out.handle"
      :key="out.handle"
      type="source"
      :position="Position.Right"
      :style="handleStyle(out.handle)"
    />
    <!-- 布尔语义角标：只认句柄 id（true=绿✓ / false=红✕），与用户自定义别名无关——
         位置和角标才是语义锚点，连线文案可随便改，分支归属不会被误导 -->
    <span
      v-for="out in semanticOutlets"
      :key="`chip-${out.handle}`"
      class="cmp-gateway__chip"
      :class="out.handle === 'true' ? 'is-true' : 'is-false'"
      :style="chipStyle(out.handle)"
    >{{ out.handle === 'true' ? '✓' : '✕' }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position, type NodeProps } from '@vue-flow/core';
import type { CmpNodeData } from '../../composables/useElTreeModel';
import { getDef, materialTick } from '../../cmp-defs';

const props = defineProps<NodeProps<CmpNodeData>>();

// 依赖 materialTick：/options 合流改写 icon 后节点同步刷新
const iconName = computed(() => {
  materialTick.value;
  return getDef(props.data.defType)?.icon ?? '';
});

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

/** 布尔出口（仅 IF 的 true/false；循环 do、SWITCH case、AND/OR 序号出口不命中） */
const semanticOutlets = computed(() =>
  (props.data.outlets ?? []).filter((o) => o.handle === 'true' || o.handle === 'false')
);

/** 多 handle 沿右边均匀分布：第 i 个 handle 的 top% */
function handleTop(handle: string): number {
  const outlets = props.data.outlets ?? [];
  const idx = outlets.findIndex((o) => o.handle === handle);
  const n = outlets.length || 1;
  return n === 1 ? 50 : (idx / (n - 1)) * 100;
}

function handleStyle(handle: string): Record<string, string> {
  return { top: `${handleTop(handle)}%` };
}

/** 角标与对应 handle 同高，向右探出半个圆点，避免压住菱形本身 */
function chipStyle(handle: string): Record<string, string> {
  return { top: `${handleTop(handle)}%` };
}
</script>

<style scoped>
.cmp-gateway {
  position: relative;
  width: 56px;
  height: 72px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding-top: 6px;
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

/* 布尔语义角标：圆心钉在右边框的出口点上，向右探出半个圆 */
.cmp-gateway__chip {
  position: absolute;
  right: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  color: #fff;
  pointer-events: none;
  background-color: var(--el-color-info);
  border: 1.5px solid var(--el-bg-color);
  border-radius: 50%;
  box-shadow: 0 1px 2px rgb(0 0 0 / 25%);
  transform: translate(50%, -50%);
}

.cmp-gateway__chip.is-true {
  background-color: var(--el-color-success);
}

.cmp-gateway__chip.is-false {
  background-color: var(--el-color-danger);
}
</style>
