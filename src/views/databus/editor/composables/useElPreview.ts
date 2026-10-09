/**
 * EL 实时预览 composable：直接从 ElNode 模型树序列化。
 *
 * - refresh() 调 treeModel.toCmpProperty() 拿到 CmpProperty，交后端 generateEl
 * - schedule() 由控制器在编辑动作完成后显式调用（不订阅 Vue Flow 事件——
 *   节点拖拽只改 cachedPosition 坐标缓存，不改树结构，无需刷新 EL）
 * - 后端 ExpressGenerator 权威生成，与保存路径同源
 * - active 由右侧抽屉按 tab 可见性控制（EL tab 不可见时不刷新，省请求）
 *
 * 右侧抽屉化后实例经 DrawerPort.elPreview 透传给 FlowElPreview（不再 provide/inject）。
 */
import { onBeforeUnmount, ref, type Ref } from 'vue';
import { generateEl } from '@/api/databus/el';
import type { ElTreeModel } from './useElTreeModel';

export interface ElPreviewController {
  elStr: Ref<string>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  /** 是否激活刷新：右侧抽屉按 EL tab 可见性 + 画布激活态控制 */
  active: Ref<boolean>;
  schedule: () => void;
  refresh: () => Promise<void>;
}

export interface UseElPreviewOptions {
  /** 连续变更合并窗口（ms），默认 300 */
  debounceMs?: number;
}

export function useElPreview(treeModel: ElTreeModel, options: UseElPreviewOptions = {}): ElPreviewController {
  const debounceMs = options.debounceMs ?? 300;
  const elStr = ref('');
  const loading = ref(false);
  const error = ref<string | null>(null);
  const active = ref(true);

  let timer: number | undefined;
  let reqToken = 0;

  async function refresh() {
    const cmpProperty = treeModel.toCmpProperty();
    if (!cmpProperty) {
      elStr.value = '';
      error.value = null;
      loading.value = false;
      return;
    }
    loading.value = true;
    const token = ++reqToken;
    try {
      const { data } = await generateEl(cmpProperty);
      if (token !== reqToken) return;
      elStr.value = data.elStr ?? '';
      error.value = null;
    } catch (e) {
      if (token !== reqToken) return;
      error.value = e instanceof Error ? e.message : '生成失败';
      elStr.value = '';
    } finally {
      if (token === reqToken) loading.value = false;
    }
  }

  function schedule() {
    if (!active.value) return;
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(refresh, debounceMs);
  }

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer);
  });

  return { elStr, loading, error, active, schedule, refresh };
}
