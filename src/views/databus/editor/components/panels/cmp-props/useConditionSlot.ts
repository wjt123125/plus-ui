/**
 * 条件槽动作：候选条件件、首次挂载、更换弹层状态。
 * 壳里 createConditionSlotActions 一次并 provide——
 * 未挂条件件的网关表单、三个叶子表单上的「更换」按钮、更换弹层共用同一份状态。
 */
import { computed, inject, provide, ref, type ComputedRef, type Ref } from 'vue';
import { getDef, type CmpDef } from '../../../cmp-defs';
import { useCanvasController } from '../../../composables/useCanvasController';
import { CONDITION_SLOT_HINTS, CONDITION_SLOT_TYPES } from './constants';
import type { CmpPropsContext } from './usePropsContext';

const KEY = Symbol('cmp-props-condition-slot');

export interface ConditionSlotActions {
  /** 条件槽选择列表/更换弹层的候选物料（按当前所属算子过滤） */
  condPickDefs: ComputedRef<CmpDef[]>;
  /** 条件件选择框下方的说明文案 */
  conditionSlotHint: ComputedRef<string>;
  replaceDialogVisible: Ref<boolean>;
  pendingConditionType: Ref<string>;
  /** 条件菱形上首次选择条件组件：挂到算子 condition 位 */
  onPickCondition: (defType: string) => void;
  openReplaceCondition: () => void;
  confirmReplaceCondition: () => void;
}

export function createConditionSlotActions(
  ctx: CmpPropsContext,
  onDataChange: () => void
): ConditionSlotActions {
  const ctrl = useCanvasController();

  const condPickDefs = computed<CmpDef[]>(() =>
    (CONDITION_SLOT_TYPES[ctx.opNode.value?.type ?? ''] ?? [])
      .map((t) => getDef(t))
      .filter((d): d is CmpDef => !!d)
  );

  const conditionSlotHint = computed(
    () => CONDITION_SLOT_HINTS[ctx.opNode.value?.type ?? ''] ?? ''
  );

  const replaceDialogVisible = ref(false);
  const pendingConditionType = ref('');

  function onPickCondition(defType: string) {
    const id = ctx.opNode.value?.id;
    if (!id) return;
    const condId = ctrl.attachCondition(id, defType);
    if (condId) {
      ctrl.select(condId);
      onDataChange();
    }
  }

  function openReplaceCondition() {
    pendingConditionType.value =
      ctx.elNode.value?.componentCode ?? condPickDefs.value[0]?.type ?? '';
    replaceDialogVisible.value = true;
  }

  function confirmReplaceCondition() {
    const id = ctx.opNode.value?.id;
    if (!id || !pendingConditionType.value) {
      replaceDialogVisible.value = false;
      return;
    }
    const condId = ctrl.attachCondition(id, pendingConditionType.value);
    replaceDialogVisible.value = false;
    if (condId) {
      ctrl.select(condId);
      onDataChange();
    }
  }

  return {
    condPickDefs,
    conditionSlotHint,
    replaceDialogVisible,
    pendingConditionType,
    onPickCondition,
    openReplaceCondition,
    confirmReplaceCondition
  };
}

export function provideConditionSlotActions(actions: ConditionSlotActions): void {
  provide(KEY, actions);
}

export function useConditionSlotActions(): ConditionSlotActions {
  const actions = inject<ConditionSlotActions | null>(KEY, null);
  if (!actions) {
    throw new Error('useConditionSlotActions 必须在 CmpProps 面板上下文内使用');
  }
  return actions;
}
