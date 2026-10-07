/**
 * localStorage 持久化的 ref：分栏宽度/开合等纯前端偏好。
 * 值仅在当前标签页内存中更新，写入失败（隐私模式等）静默降级为普通 ref。
 */
import { ref, watch, type Ref } from 'vue';

export function usePersisted<T>(key: string, defaultValue: T): Ref<T> {
  let initial = defaultValue;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw != null) {
      initial = JSON.parse(raw) as T;
    }
  } catch {
    /* 读不到用默认值 */
  }
  const state = ref(initial) as Ref<T>;
  watch(
    state,
    (val) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(val));
      } catch {
        /* 写失败不影响使用 */
      }
    },
    { deep: true }
  );
  return state;
}
