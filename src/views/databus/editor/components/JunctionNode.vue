<!-- 汇合锚点：小圆点，让分支图重新收敛为单端口。
     不可手动删除（随分支结构增删）。data.junctionOf 指向所属算子 id。
     多个分支汇入用多个 target handle（按 outlets 数量分布），
     出口仅一个 source handle（汇合后单流出）。 -->
<template>
  <div class="cmp-junction">
    <Handle
      v-for="(out, i) in inlets"
      :id="out.handle"
      :key="out.handle"
      type="target"
      :position="Position.Left"
      :style="inletStyle(i)"
    />
    <div class="cmp-junction__dot" />
    <Handle type="source" :position="Position.Right" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position, type NodeProps } from '@vue-flow/core';
import type { CmpNodeData } from '../composables/useElTreeModel';

const props = defineProps<NodeProps<CmpNodeData>>();

/** 入口 handle 列表：从 data.outlets 读，无则兜底单入口（兼容旧投影） */
const inlets = computed(() => {
  const outlets = props.data?.outlets ?? [];
  return outlets.length > 0 ? outlets : [{ handle: 'in', label: '' }];
});

/** 多入口沿左边均匀分布：第 i 个 handle 的 top% */
function inletStyle(i: number): Record<string, string> {
  const n = inlets.value.length || 1;
  const top = n === 1 ? 50 : (i / (n - 1)) * 100;
  return { top: `${top}%` };
}
</script>

<style scoped>
.cmp-junction {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cmp-junction__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #909399;
  box-shadow: 0 0 0 2px #fff, 0 1px 3px rgb(0 0 0 / 20%);
}
</style>
