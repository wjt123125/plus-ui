<!-- 组件节点（方案 B 后仅渲染业务卡 / 虚拟起止节点；算子网关走 GatewayNode.vue） -->
<template>
  <div
    class="cmp-node"
    :class="{ 'is-selected': selected, 'is-virtual': data.virtual }"
    :style="data.virtual ? ({ '--node-color': data.color } as Record<string, string>) : {}"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <CmpContextPad v-if="!data.junctionOf && !data.placeholderOf" :node-id="id" :hover="hover" :selected="selected" />
    <Handle v-if="data.defType !== 'start'" type="target" :position="Position.Top" />
    <div class="cmp-node__icon" :style="{ backgroundColor: data.virtual ? 'transparent' : data.color }">
      <SvgIcon :icon-class="iconName" />
    </div>
    <div class="cmp-node__body">
      <div class="cmp-node__label">{{ data.label }}</div>
      <div class="cmp-node__sub">{{ data.virtual ? '' : (data.cmpId || data.defType) }}</div>
    </div>
    <Handle v-if="data.defType !== 'end'" type="source" :position="Position.Bottom" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Handle, Position, type NodeProps } from '@vue-flow/core';
import type { CmpNodeData } from '../cmp-tree';
import { getDef } from '../cmp-defs';
import CmpContextPad from './CmpContextPad.vue';

const props = defineProps<NodeProps<CmpNodeData>>();

const hover = ref(false);

const iconName = computed(() => getDef(props.data.defType)?.icon ?? '');
</script>

<style scoped>
.cmp-node {
  position: relative;
  display: flex;
  align-items: center;
  width: 150px;
  height: 56px;
  padding: 0 10px;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  box-shadow: 0 1px 4px rgb(0 0 0 / 8%);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.cmp-node.is-selected {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-7);
}

.cmp-node.is-virtual {
  width: 56px;
  height: 56px;
  padding: 0;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background-color: var(--node-color);
  border: none;
  border-radius: 50%;
  box-shadow: 0 2px 8px rgb(0 0 0 / 20%);
  color: #fff;
}

.cmp-node.is-virtual.is-selected {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--node-color) 30%, transparent), 0 2px 8px rgb(0 0 0 / 20%);
}

.cmp-node.is-virtual .cmp-node__icon {
  width: 22px;
  height: 22px;
  margin-right: 0;
  font-size: 16px;
  color: #fff;
  background: transparent;
  border-radius: 0;
}

.cmp-node.is-virtual .cmp-node__body {
  text-align: center;
  min-width: auto;
}

.cmp-node.is-virtual .cmp-node__label {
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  margin-top: -2px;
  line-height: 1;
}

.cmp-node.is-virtual .cmp-node__sub {
  display: none;
}

.cmp-node__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  margin-right: 8px;
  color: #fff;
  font-size: 16px;
  border-radius: 4px;
}

.cmp-node__body {
  min-width: 0;
}

.cmp-node__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.cmp-node__sub {
  margin-top: 2px;
  overflow: hidden;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 连接点热区与视觉反馈 */
.vue-flow__handle::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: transparent;
}

.vue-flow__handle-top::before {
  transform: translate(-50%, calc(-50% + 4px));
}

.vue-flow__handle-bottom::before {
  transform: translate(-50%, calc(-50% - 4px));
}

.vue-flow__handle::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 14px;
  height: 14px;
  border: 1.5px solid color-mix(in srgb, var(--el-color-primary) 55%, transparent);
  border-radius: 50%;
  background: transparent;
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.6);
  transition: opacity 0.12s ease, transform 0.12s ease;
  pointer-events: none;
}

.vue-flow__handle:hover::after {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}

.vue-flow__handle:hover,
.vue-flow__handle.connecting {
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary);
}

.vue-flow__handle.valid,
.vue-flow__handle.vue-flow__handle-valid {
  border-color: var(--el-color-success);
  background-color: var(--el-color-success);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--el-color-success) 25%, transparent);
}
</style>
