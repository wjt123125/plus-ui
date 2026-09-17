<!-- 大纲：直接遍历 ElNode 模型树，无需从画布重建拓扑 -->
<template>
  <div class="flow-outline">
    <div class="flow-outline__list">
      <div
        v-for="item in outlineItems"
        :key="item.id"
        class="flow-outline__item"
        :class="{ 'is-active': item.id === ctrl.selectedId.value }"
        :style="{ paddingLeft: `${8 + item.depth * 16}px` }"
        @click="locate(item)"
      >
        <span class="flow-outline__dot" :style="{ backgroundColor: item.color }" />
        <span class="flow-outline__label">{{ item.label }}</span>
        <span class="flow-outline__sub">{{ item.sub }}</span>
      </div>
      <div v-if="outlineItems.length === 0" class="flow-outline__empty">暂无真实组件，从左侧拖入</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useVueFlow } from '@vue-flow/core';
import { useElTreeModelInject, type ElNode } from '../composables/useElTreeModel';
import { useCanvasController } from '../composables/useCanvasController';
import { getDef } from '../cmp-defs';

defineOptions({ name: 'FlowOutline' });

const NODE_W = 150;
const NODE_H = 56;

const { findNode, setCenter, addSelectedNodes } = useVueFlow();
const treeModel = useElTreeModelInject();
const ctrl = useCanvasController();

interface OutlineItem {
  id: string;
  label: string;
  sub: string;
  color: string;
  depth: number;
}

/** 递归遍历 ElNode 树，扁平化为带缩进层级的列表 */
function traverse(node: ElNode, depth: number, items: OutlineItem[]) {
  const def = getDef(node.type);
  if (def?.operator) {
    // 算子节点
    items.push({
      id: node.id,
      label: def.label,
      sub: node.type,
      color: def.color,
      depth
    });
    // condition 在 children 之前展示
    if (node.condition) {
      traverse(node.condition, depth + 1, items);
    }
    if (node.children) {
      // 稀疏空洞跳过；撤销快照 JSON 往返后空洞变 null，同样跳过（THEN 尾部空槽不进大纲）
      node.children.forEach((c) => c && traverse(c, depth + 1, items));
    }
  } else {
    // 业务叶子：componentCode 是注册名（查物料），cmpId 是数据空间名（右侧副标）；
    // virtual（start/end）没有 componentCode，用 type 自身查
    const leafDef = getDef(node.componentCode ?? node.type);
    items.push({
      id: node.id,
      label: leafDef?.label ?? node.componentCode ?? node.type,
      sub: node.cmpId ?? '',
      color: leafDef?.color ?? '#909399',
      depth
    });
  }
}

const outlineItems = computed<OutlineItem[]>(() => {
  const root = treeModel.root.value;
  if (!root) return [];
  const items: OutlineItem[] = [];
  traverse(root, 0, items);
  return items;
});

/** 点击大纲项：单选该节点并居中 */
function locate(item: OutlineItem) {
  ctrl.deselect();
  ctrl.select(item.id);
  const target = findNode(item.id);
  if (target) {
    addSelectedNodes([target]);
    const w = target.dimensions?.width || NODE_W;
    const h = target.dimensions?.height || NODE_H;
    setCenter(target.position.x + w / 2, target.position.y + h / 2, { duration: 300 });
  }
}
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
