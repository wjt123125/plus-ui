import { computed, ref } from 'vue';
import { listComponentOptions } from '@/api/databus/component';
import type { ComponentOption } from '@/api/databus/component/types';
import { applyComponentOptions } from '../cmp-defs';

/**
 * 物料 /options 会话级缓存：编辑器整个编辑会话只拉一次。
 * 模块级 Promise（非组件级 ref）保证多个面板/控件同时挂载也只发一个请求；
 * 失败不缓存结果，允许下次调用重试（Promise 拒绝后重新创建）。
 *
 * 业务物料唯一数据源：失败时不做任何本地兜底，error=true 由物料区显性展示失败与重试。
 */
let pending: Promise<ComponentOption[]> | null = null;
const options = ref<ComponentOption[]>([]);
const loaded = ref(false);
const error = ref(false);

async function fetchOptions(): Promise<ComponentOption[]> {
  if (!pending) {
    pending = listComponentOptions()
      .then((res) => {
        const list = res.data?.components ?? [];
        // 全量替换 cmp-defs 物料区（getDef 全链路同步可见），再刷新 options 响应式缓存
        applyComponentOptions(list);
        options.value = list;
        loaded.value = true;
        error.value = false;
        return list;
      })
      .catch((err) => {
        // 失败释放缓存，下次可重试；不塞本地数据
        pending = null;
        error.value = true;
        throw err;
      });
  }
  return pending;
}

/**
 * 编辑器物料选项。用法：const { options, optionMap, ensureOptions } = useComponentOptions();
 * 挂载时调一次 ensureOptions()（失败由 error 态显性提示），模板按 loaded/optionMap 渲染。
 */
export function useComponentOptions() {
  const optionMap = computed<Map<string, ComponentOption>>(() => {
    const map = new Map<string, ComponentOption>();
    for (const item of options.value) {
      map.set(item.code, item);
    }
    return map;
  });

  function ensureOptions() {
    return fetchOptions().catch(() => {
      // 物料区保持空/上一批，error 态供 UI 展示重试入口
      return [] as ComponentOption[];
    });
  }

  /** 手动重试：清错误态重新拉取（pending 已在失败时释放） */
  function retryOptions() {
    error.value = false;
    return ensureOptions();
  }

  return { options, loaded, error, optionMap, ensureOptions, retryOptions };
}
