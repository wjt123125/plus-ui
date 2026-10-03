/**
 * SWITCH case 名动作：读 outletLabels（缺省回退 caseN，与投影展示一致），增删改名。
 * 壳里 createSwitchCasesActions 一次并 provide——
 * 未挂条件件的 SWITCH 网关表单与普通算子表单两处都能编辑同一组 case。
 */
import { computed, inject, provide, type ComputedRef } from 'vue';
import { useElTreeModelInject } from '../../../composables/useElTreeModel';
import type { CmpPropsContext } from './usePropsContext';

const KEY = Symbol('cmp-props-switch-cases');

export interface SwitchCasesActions {
  /** case 分支名（读 outletLabels，缺省回退 caseN） */
  caseNames: ComputedRef<string[]>;
  addCase: () => void;
  removeCase: (index: number) => void;
  /** case 改名：空白恢复默认 caseN */
  onCaseNameChange: (index: number, raw: string) => void;
}

export function createSwitchCasesActions(
  ctx: CmpPropsContext,
  onDataChange: () => void
): SwitchCasesActions {
  const treeModel = useElTreeModelInject();

  const caseNames = computed<string[]>(() => {
    const id = ctx.switchModelId.value;
    const sw = id ? treeModel.findNode(id) : null;
    const count = sw?.children?.length ?? 0;
    return Array.from({ length: count }, (_, i) => sw?.outletLabels?.[i] ?? `case${i + 1}`);
  });

  function addCase() {
    const switchId =
      ctx.opNode.value?.type === 'SWITCH'
        ? ctx.opNode.value.id
        : ctx.elNode.value?.parentOperatorId;
    if (switchId && treeModel.addCase(switchId)) {
      onDataChange();
    }
  }

  function removeCase(index: number) {
    if (ctx.switchModelId.value && treeModel.removeCase(ctx.switchModelId.value, index)) {
      onDataChange();
    }
  }

  function onCaseNameChange(index: number, raw: string) {
    if (!ctx.switchModelId.value) return;
    treeModel.updateOutletLabel(ctx.switchModelId.value, index, raw.trim() || null);
    onDataChange();
  }

  return { caseNames, addCase, removeCase, onCaseNameChange };
}

export function provideSwitchCasesActions(actions: SwitchCasesActions): void {
  provide(KEY, actions);
}

export function useSwitchCasesActions(): SwitchCasesActions {
  const actions = inject<SwitchCasesActions | null>(KEY, null);
  if (!actions) {
    throw new Error('useSwitchCasesActions 必须在 CmpProps 面板上下文内使用');
  }
  return actions;
}
