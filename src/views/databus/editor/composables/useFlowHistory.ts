/**
 * 画布撤销/重做历史栈：快照内容是 ElNode 模型树（画布只是投影，不入栈）。
 *
 * - snapshot() 调 treeModel.snapshot() 深拷贝 root
 * - apply(snap) 调 treeModel.replaceTree + project + setNodes/setEdges
 * - 结构变更由控制器在编辑动作完成后显式调 push()（不订阅 onNodesChange）
 * - 节点拖拽只回写 cachedPosition 坐标缓存，不改树结构，不入栈
 */
import { computed, nextTick, ref, type ComputedRef, type Ref } from 'vue';
import type { Edge, Node } from '@vue-flow/core';
import type { ElNode, ElTreeModel, CmpNodeData } from './useElTreeModel';
import { cloneElNode } from './useElTreeModel';

export interface UseFlowHistoryOptions {
  /** 历史栈最大长度，超过后丢弃最早快照，默认 50 */
  max?: number;
  /** 连续变更合并窗口（ms），默认 200 */
  debounce?: number;
}

/**
 * useFlowHistory 依赖的能力子集。
 * - treeModel: 模型树状态 + 投影
 * - setNodes/setEdges: 写回 Vue Flow store（投影结果）
 * - getNodes: 读当前画布选中态（重投影时恢复 selected）
 */
export interface FlowHistoryStore {
  treeModel: ElTreeModel;
  getNodes: ComputedRef<Node<CmpNodeData>[]>;
  setNodes: (nodes: Node<CmpNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  /** 可选：undo/redo 后自动触发 dagre 重排（结构变更会改变拓扑，坐标缓存可能过时） */
  autoLayout?: () => void;
}

export function useFlowHistory(store: FlowHistoryStore, options: UseFlowHistoryOptions = {}) {
  const max = options.max ?? 50;
  const debounceMs = options.debounce ?? 200;

  // ref([]) 不带泛型绕开 TS2589
  const past = ref([]) as Ref<(ElNode | null)[]>;
  const future = ref([]) as Ref<(ElNode | null)[]>;

  let isRestoring = false;
  let committedOnce = false;
  let lastSnapshot: ElNode | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function snapshot(): ElNode | null {
    return store.treeModel.snapshot();
  }

  function isSame(a: ElNode | null, b: ElNode | null): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function apply(snap: ElNode | null) {
    isRestoring = true;
    const cloned = cloneElNode(snap);
    store.treeModel.replaceTree(cloned);
    // undo/redo 不保留选中态：整体重投影后清空选中
    const { nodes, edges } = store.treeModel.project(new Set());
    store.setNodes(nodes);
    store.setEdges(edges);
    lastSnapshot = cloneElNode(cloned);
    // 结构变更的 undo/redo 会改变拓扑，dagre 重排把坐标缓存对齐新结构
    store.autoLayout?.();
    nextTick(() => {
      isRestoring = false;
    });
  }

  function commit() {
    if (isRestoring) return;
    const current = snapshot();
    if (!committedOnce) {
      committedOnce = true;
      lastSnapshot = current;
      return;
    }
    if (isSame(lastSnapshot, current)) {
      return;
    }
    past.value.push(lastSnapshot);
    if (past.value.length > max) past.value.shift();
    lastSnapshot = current;
    future.value = [];
  }

  /** 入栈（防抖）。控制器在编辑动作完成后显式调用。 */
  function push() {
    clearTimeout(timer);
    timer = setTimeout(commit, debounceMs);
  }

  function undo() {
    if (past.value.length === 0) return;
    clearTimeout(timer);
    const prev = past.value.pop()!;
    future.value.push(snapshot());
    apply(prev);
  }

  function redo() {
    if (future.value.length === 0) return;
    clearTimeout(timer);
    const next = future.value.pop()!;
    past.value.push(snapshot());
    apply(next);
  }

  const canUndo = computed(() => past.value.length > 0);
  const canRedo = computed(() => future.value.length > 0);

  function reset() {
    clearTimeout(timer);
    past.value = [];
    future.value = [];
    lastSnapshot = snapshot();
    committedOnce = true;
  }

  /** 画布相对上次 reset 基线是否有改动（结构/属性变更，不含纯位置拖拽）。 */
  function isDirty(): boolean {
    return !isSame(lastSnapshot, snapshot());
  }

  return { undo, redo, canUndo, canRedo, reset, push, isDirty };
}
