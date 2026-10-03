/**
 * 属性面板只读上下文：画布节点 → ElNode 树定位与全部形态判据。
 * 壳里 createPropsContext 一次并 provide，五个分支字段组件 inject 共用，
 * 避免各子件重复 findNode/重复推导，也不新增全局单例（随面板生命周期）。
 */
import { inject, provide, computed, type ComputedRef } from 'vue';
import type { Node } from '@vue-flow/core';
import { getDef } from '../../../cmp-defs';
import {
  useElTreeModelInject,
  type CmpNodeData,
  type ElNode
} from '../../../composables/useElTreeModel';
import { BOOLEAN_OP_ARITY } from './constants';

const CMP_PROPS_CTX_KEY = Symbol('cmp-props-context');

export interface CmpPropsContext {
  /** 当前选中的画布节点 */
  canvasNode: ComputedRef<Node<CmpNodeData> | null>;
  /** 当前画布节点对应的树节点（可能是业务叶子、condition 叶子或算子自身） */
  elNode: ComputedRef<ElNode | null>;
  /** 业务叶子的物料定义 */
  leafDef: ComputedRef<ReturnType<typeof getDef>>;
  isJunction: ComputedRef<boolean>;
  isPlaceholder: ComputedRef<boolean>;
  virtualHint: ComputedRef<string>;
  /** 当前选中节点是否脚本叶子（script/booleanScript） */
  isScriptLeaf: ComputedRef<boolean>;
  /** 当前选中的是已挂载条件件（condition 叶子充当网关） */
  isConditionLeaf: ComputedRef<boolean>;
  /** 条件网关所属算子节点（condition 叶子的 parent，或算子自身） */
  opNode: ComputedRef<ElNode | null>;
  /** 条件菱形是否还没挂条件件（网关仍由算子自身充当） */
  hasCondition: ComputedRef<boolean>;
  headerLabel: ComputedRef<string>;
  /** SWITCH 的 case 管理在 SWITCH 算子/其 condition 网关上编辑 */
  needsCasesEdit: ComputedRef<boolean>;
  /** 当前编辑界面归属的 SWITCH 算子树节点 id（case 名读写都落它的 outletLabels） */
  switchModelId: ComputedRef<string | null>;
  /** switchRoute 手写表单（cases.target 吃画布 case 名）；其余叶子走 schema/JSON */
  isSwitchRouteLeaf: ComputedRef<boolean>;
  /** AND/OR/NOT 算子节点 */
  isBooleanOpNode: ComputedRef<boolean>;
  /** CHAIN 引用节点（算子形态，只选子链） */
  isChainNode: ComputedRef<boolean>;
  /** 可编辑标题：业务叶子/条件件/算子（虚拟节点与汇合点/空槽除外） */
  canEditTitle: ComputedRef<boolean>;
  /** 留空时的默认名（取组件 label） */
  defaultTitleText: ComputedRef<string>;
}

export function createPropsContext(
  canvasNode: ComputedRef<Node<CmpNodeData> | null>
): CmpPropsContext {
  // 面板内部调用：inject 链路由 EditorCanvas 建立（与壳原本的使用前提一致）
  const treeModel = useElTreeModelInject();

  const elNode = computed<ElNode | null>(() =>
    canvasNode.value ? treeModel.findNode(canvasNode.value.id) : null
  );

  const leafDef = computed(() =>
    elNode.value?.componentCode ? getDef(elNode.value.componentCode) : undefined
  );

  const isJunction = computed(() => !!canvasNode.value?.data.junctionOf);
  const isPlaceholder = computed(() => !!canvasNode.value?.data.placeholderOf);

  const virtualHint = computed(() =>
    canvasNode.value?.data.defType === 'end'
      ? '结束是链路终点的视觉标记，不参与 EL 表达式生成；如需隐藏可直接删除。'
      : '开始是链路起点的视觉标记，不参与 EL 表达式生成；如需隐藏可直接删除。'
  );

  const isScriptLeaf = computed(
    () =>
      elNode.value?.componentCode === 'script' ||
      elNode.value?.componentCode === 'booleanScript'
  );

  const isConditionLeaf = computed(
    () =>
      !!canvasNode.value?.data.isCondition &&
      !!elNode.value &&
      !getDef(elNode.value.type)?.operator
  );

  const opNode = computed<ElNode | null>(() => {
    const n = elNode.value;
    if (!n) return null;
    if (getDef(n.type)?.operator) return n;
    return n.parentOperatorId ? treeModel.findNode(n.parentOperatorId) : null;
  });

  const hasCondition = computed(() => isConditionLeaf.value);

  const headerLabel = computed(() => {
    if (isConditionLeaf.value) {
      return (
        leafDef.value?.label ??
        elNode.value?.componentCode ??
        canvasNode.value?.data.label ??
        ''
      );
    }
    return canvasNode.value?.data.label ?? '';
  });

  const needsCasesEdit = computed(() => {
    const d = canvasNode.value?.data;
    return !!d?.isCondition && (opNode.value?.type === 'SWITCH' || d.defType === 'SWITCH');
  });

  const switchModelId = computed<string | null>(() => {
    if (!needsCasesEdit.value) return null;
    if (opNode.value?.type === 'SWITCH') return opNode.value.id;
    return elNode.value?.parentOperatorId ?? null;
  });

  const isSwitchRouteLeaf = computed(
    () => elNode.value?.componentCode === 'switchRoute'
  );

  const isBooleanOpNode = computed(
    () => (elNode.value?.type ?? '') in BOOLEAN_OP_ARITY
  );

  const isChainNode = computed(() => elNode.value?.type === 'CHAIN');

  const titleDef = computed(() => {
    const n = elNode.value;
    if (!n) return undefined;
    return n.componentCode ? getDef(n.componentCode) : getDef(n.type);
  });

  const canEditTitle = computed(() => {
    const n = elNode.value;
    if (!n || isJunction.value || isPlaceholder.value) return false;
    return !getDef(n.type)?.virtual;
  });

  const defaultTitleText = computed(() => titleDef.value?.label ?? '');

  return {
    canvasNode,
    elNode,
    leafDef,
    isJunction,
    isPlaceholder,
    virtualHint,
    isScriptLeaf,
    isConditionLeaf,
    opNode,
    hasCondition,
    headerLabel,
    needsCasesEdit,
    switchModelId,
    isSwitchRouteLeaf,
    isBooleanOpNode,
    isChainNode,
    canEditTitle,
    defaultTitleText
  };
}

export function providePropsContext(ctx: CmpPropsContext): void {
  provide(CMP_PROPS_CTX_KEY, ctx);
}

export function usePropsContext(): CmpPropsContext {
  const ctx = inject<CmpPropsContext | null>(CMP_PROPS_CTX_KEY, null);
  if (!ctx) {
    throw new Error('usePropsContext 必须在 CmpProps 面板上下文内使用');
  }
  return ctx;
}
