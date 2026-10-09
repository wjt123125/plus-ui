<!-- 大纲：纯展示组件。数据扁平化（useOutlineItems）与居中定位（locate）
     由 ChainCanvasPane 经 DrawerPort 提供，组件自身不碰模型树与 vue-flow 实例 -->
<template>
  <div class="flow-outline">
    <div class="flow-outline__list">
      <div
        v-for="item in items"
        :key="item.id"
        class="flow-outline__item"
        :class="{ 'is-active': item.id === selectedId }"
        :style="{ paddingLeft: `${8 + item.depth * 16}px` }"
        @click="emit('locate', item.id)"
      >
        <span class="flow-outline__dot" :style="{ backgroundColor: item.color }" />
        <span class="flow-outline__label">{{ item.label }}</span>
        <span class="flow-outline__sub">{{ item.sub }}</span>
      </div>
      <div v-if="items.length === 0" class="flow-outline__empty">暂无真实组件，从左侧拖入</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { OutlineItem } from '../../composables/useOutlineItems';

defineOptions({ name: 'FlowOutline' });

defineProps<{
  items: OutlineItem[];
  /** 当前选中 id（node/edge 统一） */
  selectedId: string | null;
}>();

const emit = defineEmits<{
  /** 点击大纲项：父级负责选中节点并在画布居中 */
  (e: 'locate', id: string): void;
}>();
</script>

<style scoped>
.flow-outline {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.flow-outline__list {
  flex: 1;
  padding: 4px;
  overflow-y: auto;
}

.flow-outline__item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 4px;
  cursor: pointer;
}

.flow-outline__item:hover {
  background-color: var(--el-fill-color-light);
}

.flow-outline__item.is-active {
  background-color: var(--el-color-primary-light-9);
}

.flow-outline__dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.flow-outline__label {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--el-text-color-primary);
}

.flow-outline__sub {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flow-outline__empty {
  padding: 10px 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
}
</style>
