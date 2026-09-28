import { ref } from 'vue';

/**
 * 编辑器侧栏（物料区 / 属性面板）收起态：
 * 以 '1' / '0' 持久化到 localStorage，下次进入编辑器保持上次展开状态。
 *
 * @param storageKey localStorage 键名（如 databus.palette.collapsed）
 */
export function usePanelCollapse(storageKey: string) {
  const collapsed = ref(localStorage.getItem(storageKey) === '1');

  function setCollapsed(value: boolean) {
    collapsed.value = value;
    localStorage.setItem(storageKey, value ? '1' : '0');
  }

  return { collapsed, setCollapsed };
}
