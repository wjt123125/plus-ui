/**
 * 大纲列表：递归遍历 ElNode 模型树，扁平化为带缩进层级的列表。
 *
 * 从 FlowOutline 抽出（右侧抽屉化后，大纲数据由 ChainCanvasPane 组装进
 * DrawerPort 上报给抽屉壳，FlowOutline 退化为纯展示组件）。
 * 直接遍历 ElNode 模型树，无需从画布重建拓扑。
 */
import { computed, type ComputedRef } from 'vue';
import { getDef, materialTick } from '../cmp-defs';
import type { ElNode, ElTreeModel } from './useElTreeModel';

export interface OutlineItem {
  id: string;
  label: string;
  sub: string;
  color: string;
  depth: number;
}

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

/** 大纲行列表（依赖 materialTick：合流改写 label/color 后大纲同步刷新） */
export function useOutlineItems(treeModel: ElTreeModel): ComputedRef<OutlineItem[]> {
  return computed(() => {
    materialTick.value;
    const root = treeModel.root.value;
    if (!root) return [];
    const items: OutlineItem[] = [];
    traverse(root, 0, items);
    return items;
  });
}
