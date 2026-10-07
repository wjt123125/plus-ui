/**
 * 右栏多 tab 工作区会话（对标 Trae / VS Code 编辑器标签）。
 * 纯内存：tab 身份由消费者定义（组件+模式、链路+模式…），重复打开只聚焦；
 * 切走不销毁（草稿保留）；离开路由由宿主整体卸载清空。
 * 本 composable 只认最小契约，业务便捷打开方法（openDetail 等）由消费者自行包装。
 */
import { computed, ref } from 'vue';
import type { Ref } from 'vue';
import type { WorkbenchTab } from '../workbench.types';

export function useWorkbenchTabs<T extends WorkbenchTab>() {
  // 泛型 T 与 ref 的 UnwrapRefSimple<T> 无法互推，显式断言回 Ref<T[]>
  const tabs = ref([]) as Ref<T[]>;
  const activeKey = ref<string>('');

  const activeTab = computed(() => tabs.value.find((t) => t.key === activeKey.value) ?? null);

  function focus(key: string) {
    activeKey.value = key;
  }

  /** 插入或聚焦已存在 tab（已存在时只更新标题，脏状态等业务字段不覆盖），返回 key */
  function open(tab: T): string {
    const existed = tabs.value.find((t) => t.key === tab.key);
    if (!existed) {
      tabs.value.push(tab);
    } else {
      existed.title = tab.title;
    }
    activeKey.value = tab.key;
    return tab.key;
  }

  function close(key: string) {
    const idx = tabs.value.findIndex((t) => t.key === key);
    if (idx === -1) {
      return;
    }
    tabs.value.splice(idx, 1);
    if (activeKey.value === key) {
      activeKey.value = tabs.value[Math.min(idx, tabs.value.length - 1)]?.key ?? '';
    }
  }

  function setDirty(key: string, dirty: boolean) {
    const tab = tabs.value.find((t) => t.key === key);
    if (tab) {
      tab.dirty = dirty;
    }
  }

  /** Ctrl+PageDown / PageUp：标签顺序循环 */
  function cycle(step: 1 | -1) {
    if (tabs.value.length <= 1) {
      return;
    }
    const idx = tabs.value.findIndex((t) => t.key === activeKey.value);
    const next = (idx + step + tabs.value.length) % tabs.value.length;
    activeKey.value = tabs.value[next].key;
  }

  return { tabs, activeKey, activeTab, open, close, setDirty, cycle, focus };
}
