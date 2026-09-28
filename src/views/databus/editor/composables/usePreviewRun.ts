import { computed, ref } from 'vue';
import type { Ref } from 'vue';
import { ElMessage } from 'element-plus';
import { previewRun as previewRunApi } from '@/api/databus/el';
import type { NodeStep, PreviewRunVo } from '@/api/databus/el/types';
import type { ChainInputParam } from '@/api/databus/chain/types';
import { buildDefaultsJson, getPathValue } from '../input-params';
import { getDef } from '../cmp-defs';
import type { ElNode, ElTreeModel } from './useElTreeModel';

/**
 * 试运行（1C：生成 EL → 校验 → 真执行，不落库）。
 * 持有：入参弹窗/结果弹窗/步骤抽屉三态、必填即时拦截、结果步骤的标题推断。
 * 结果 banner / 上下文快照等纯展示派生由 PreviewResultDialog 内部计算。
 */
export interface PreviewRunStore {
  treeModel: ElTreeModel;
  inputParams: Ref<ChainInputParam[]>;
  ensureCanvasHasNodes: () => boolean;
  ensureDataSpacesValid: () => boolean;
}

export function usePreviewRun(store: PreviewRunStore) {
  const { treeModel, inputParams, ensureCanvasHasNodes, ensureDataSpacesValid } = store;

  const previewVisible = ref(false);
  const previewRunning = ref(false);
  const previewRequest = ref('{}');
  const previewResultVisible = ref(false);
  const previewResult = ref<PreviewRunVo | null>(null);

  /** 打开试运行入参弹窗：画布非空且数据空间名合法 */
  function openPreview() {
    if (!ensureCanvasHasNodes()) return;
    if (!ensureDataSpacesValid()) return;
    previewResult.value = null;
    // 每次打开按登记表默认值重新生成（重开重置）；无登记条目时为 {}
    previewRequest.value = JSON.stringify(buildDefaultsJson(inputParams.value), null, 2);
    previewVisible.value = true;
  }

  async function runPreview() {
    // 入参必须是合法 JSON（空文本按 {} 处理），顺手格式化回写
    let parsed: unknown;
    try {
      parsed = JSON.parse(previewRequest.value.trim() || '{}');
    } catch {
      ElMessage.error('入参不是合法 JSON，请检查后再执行');
      return;
    }
    previewRequest.value = JSON.stringify(parsed, null, 2);

    // 必填即时拦截：在最终入参上按必填路径取值，取不到/空字符串不发请求（后端另有复核）
    const missing = inputParams.value
      .filter(p => p.required && p.path)
      .find(p => {
        const value = getPathValue(parsed, p.path!);
        return value === undefined || value === null
          || (typeof value === 'string' && value.length === 0);
      });
    if (missing) {
      ElMessage.error(`缺少必填入参：${missing.path}`);
      return;
    }

    if (!ensureDataSpacesValid()) {
      previewVisible.value = false;
      return;
    }
    const cmpProperty = treeModel.toCmpProperty();
    if (!cmpProperty) {
      ElMessage.warning('画布上还没有真实组件');
      return;
    }
    previewRunning.value = true;
    try {
      const { data } = await previewRunApi({
        jsonEl: cmpProperty,
        requestJson: previewRequest.value,
        inputParams: inputParams.value
      });
      previewResult.value = data;
      previewVisible.value = false;
      previewResultVisible.value = true;
    } finally {
      previewRunning.value = false;
    }
  }

  /** 结果弹窗点「再跑一次」：关结果窗、重开入参窗（入参保留用户上次修改） */
  function reopenPreview() {
    previewResultVisible.value = false;
    previewVisible.value = true;
  }

  /** 步骤明细抽屉状态：当前选中步骤（$.<tag> 快照文本由抽屉组件自行格式化） */
  const stepDetailVisible = ref(false);
  const currentStep = ref<NodeStep | null>(null);

  function openStepDetail(row: NodeStep) {
    currentStep.value = row;
    stepDetailVisible.value = true;
  }

  /**
   * 画布业务叶子按数据空间名（tag）索引：tag → {组件注册名, 解析后的 cfg}。
   * 后端 NodeStep.title 只透传用户正本（未填为 null），步骤表再用当前画布 cfg 推断默认。
   */
  const leafCfgByTag = computed(() => {
    const map = new Map<string, { code: string; cfg: unknown }>();
    const walk = (n: ElNode | null | undefined) => {
      if (!n) return;
      if (n.componentCode) {
        let cfg: unknown = {};
        if (n.data) {
          try {
            cfg = JSON.parse(n.data);
          } catch {
            cfg = {};
          }
        }
        if (n.cmpId) map.set(n.cmpId, { code: n.componentCode, cfg });
      }
      walk(n.condition);
      n.children?.forEach(walk);
    };
    walk(treeModel.root.value);
    return map;
  });

  /** 步骤表「节点标题」列：用户正本（后端透传）优先，未填退组件 label */
  function stepTitle(row: NodeStep): string {
    if (row.title?.trim()) {
      return row.title;
    }
    const leaf = row.tag ? leafCfgByTag.value.get(row.tag) : undefined;
    const def = getDef(leaf?.code ?? row.nodeId ?? '');
    return def?.label ?? '';
  }

  return {
    previewVisible,
    previewRunning,
    previewRequest,
    previewResultVisible,
    previewResult,
    openPreview,
    runPreview,
    reopenPreview,
    stepDetailVisible,
    currentStep,
    openStepDetail,
    stepTitle
  };
}
