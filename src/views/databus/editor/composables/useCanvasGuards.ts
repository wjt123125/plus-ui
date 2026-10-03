import type { ComputedRef } from 'vue';
import type { Edge, Node } from '@vue-flow/core';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { CmpNodeData, ElTreeModel } from './useElTreeModel';

/**
 * 画布操作前置校验与清空：保存链路 / 生成 EL / 试运行三个动作共用同一套闸门，
 * 避免各入口各写一份「画布非空 + 数据空间名合法」检查。
 */
export interface CanvasGuardsStore {
  treeModel: ElTreeModel;
  getNodes: ComputedRef<Node<CmpNodeData>[]>;
  setNodes: (nodes: Node<CmpNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  /** 选中/取消选中节点（校验失败时定位问题组件，委托画布控制器） */
  select: (id: string | null) => void;
}

export function useCanvasGuards(store: CanvasGuardsStore) {
  const { treeModel, getNodes, setNodes, setEdges, select } = store;

  async function resetCanvas() {
    try {
      await ElMessageBox.confirm('清空将撤销当前画布上的全部组件与连线，确定继续？', '清空画布', {
        type: 'warning'
      });
    } catch {
      return;
    }
    treeModel.loadFromCmpProperty(null);
    const { nodes, edges } = treeModel.project();
    setNodes(nodes);
    setEdges(edges);
    select(null);
  }

  /** 画布上至少有一个真实（非虚拟）节点 */
  function ensureCanvasHasNodes(): boolean {
    const realNodes = getNodes.value.filter((n) => !(n.data as CmpNodeData).virtual);
    if (realNodes.length === 0) {
      ElMessage.warning('画布上还没有真实组件，先从左侧拖入组件');
      return false;
    }
    return true;
  }

  /** CHAIN 子链已引用 + 业务叶子数据空间名非空且唯一；有问题则选中并提示 */
  function ensureDataSpacesValid(): boolean {
    const result = treeModel.validateDataSpaces();
    if (result.ok === false) {
      select(result.nodeId);
      if (result.reason === 'chain-empty') {
        ElMessage.error(`「${result.label}」还没有选择要引用的子流程`);
      } else if (result.reason === 'empty') {
        ElMessage.error(`「${result.label}」的数据空间名不能为空`);
      } else {
        ElMessage.error(`数据空间名「${result.name}」重复，画布内必须唯一`);
      }
      return false;
    }
    return true;
  }

  return { resetCanvas, ensureCanvasHasNodes, ensureDataSpacesValid };
}
