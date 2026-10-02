import { computed, ref } from 'vue';
import { listComponentOptions } from '@/api/databus/component';
import type { ComponentOption } from '@/api/databus/component/types';

/**
 * 物料 /options 会话级缓存：编辑器整个编辑会话只拉一次。
 * 模块级 Promise（非组件级 ref）保证多个面板/控件同时挂载也只发一个请求；
 * 失败不缓存结果，允许下次调用重试（Promise 拒绝后重新创建）。
 */
let pending: Promise<ComponentOption[]> | null = null;
const options = ref<ComponentOption[]>([]);
const loaded = ref(false);

async function fetchOptions(): Promise<ComponentOption[]> {
  if (!pending) {
    pending = listComponentOptions()
      .then((res) => {
        const list = res.data?.components ?? [];
        options.value = list;
        loaded.value = true;
        return list;
      })
      .catch((err) => {
        // 失败释放缓存，下次可重试
        pending = null;
        throw err;
      });
  }
  return pending;
}

/**
 * 编辑器物料选项。用法：const { options, optionMap, ensureOptions } = useComponentOptions();
 * 挂载时调一次 ensureOptions()（静默），模板按 loaded/optionMap 渲染。
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
      // 接口未部署/未登录时静默：消费侧按无 schema 回退 JSON 编辑器
      return [] as ComponentOption[];
    });
  }

  return { options, loaded, optionMap, ensureOptions };
}
