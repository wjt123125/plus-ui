/**
 * EL 实时预览 composable（方案 B：直接从 ElNode 树序列化）。
 *
 * - refresh() 调 treeModel.toCmpProperty() 拿到 CmpProperty，交后端 generateEl
 * - schedule() 由控制器在编辑动作完成后显式调用（不再订阅 Vue Flow 事件，
 *   因为画布只是投影，节点拖拽只改 cachedPosition 不改树结构）
 * - 后端 ExpressGenerator 权威生成，与保存路径同源
 * - active 由父组件控制（未选中节点时 true 才刷新，避免浪费请求）
 */
import { inject, onBeforeUnmount, provide, ref, type InjectionKey, type Ref } from 'vue';
import { generateEl } from '@/api/databus/el';
import type { ElTreeModel } from './useElTreeModel';

export interface ElPreviewController {
  elStr: Ref<string>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  /** 是否激活刷新：父组件按选中状态控制 */
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

export const EL_PREVIEW_KEY = Symbol('el-preview') as InjectionKey<ElPreviewController>;

/** index.vue 创建并 provide；右侧预览组件 inject 同一实例 */
export function provideElPreview(treeModel: ElTreeModel, options?: UseElPreviewOptions): ElPreviewController {
  const controller = useElPreview(treeModel, options);
  provide(EL_PREVIEW_KEY, controller);
  return controller;
}

export function useElPreviewController(): ElPreviewController {
  const controller = inject(EL_PREVIEW_KEY);
  if (!controller) {
    throw new Error('useElPreviewController 必须在 provideElPreview 之后使用');
  }
  return controller;
}
