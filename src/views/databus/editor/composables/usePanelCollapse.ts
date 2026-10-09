import { ref, watch } from 'vue';

/**
 * 编辑器/工作台侧栏（物料区 / 右侧抽屉）收起态：
 * 以 '1' / '0' 持久化到 localStorage，下次进入保持上次展开状态。
 *
 * 直接写 ref（如 v-model:collapsed）与 setCollapsed 都会持久化（watch 兜底）。
 *
 * @param storageKey localStorage 键名（如 databus.drawer.collapsed）
 */
export function usePanelCollapse(storageKey: string) {
  const collapsed = ref(localStorage.getItem(storageKey) === '1');

  watch(collapsed, (value) => {
    localStorage.setItem(storageKey, value ? '1' : '0');
  });

  function setCollapsed(value: boolean) {
    collapsed.value = value;
  }

  return { collapsed, setCollapsed };
}
