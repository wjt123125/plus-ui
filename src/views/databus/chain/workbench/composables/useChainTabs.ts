import { computed, ref } from 'vue';
import type { ChainTab } from '../workbench.types';

/**
 * 链路工作台 tab 会话（与 useComponentTabs 同构范式）：
 * - tab 仅存内存，离开路由即清空（不持久化、不做 keep-alive 路由缓存）
 * - canvas tab 与链路一一对应（同链单例：重复打开仅激活 + 刷新标题）
 * - 脏标记由 ChainCanvasPane 的 dirty-change 事件驱动，关脏 tab 前由面板弹确认
 */
export function useChainTabs() {
  const tabs = ref<ChainTab[]>([]);
  const activeKey = ref('');

  const activeTab = computed<ChainTab | null>(
    () => tabs.value.find((t) => t.key === activeKey.value) ?? null
  );

  /** 打开（或聚焦）链路画布 tab */
  function openCanvas(chainId: NonNullable<ChainTab['chainId']>, title: string): void {
    const key = `canvas:${chainId}`;
    const existing = tabs.value.find((t) => t.key === key);
    if (existing) {
      existing.title = title; // 链路可能已改名，聚焦时顺手刷新
      activeKey.value = key;
      return;
    }
    tabs.value.push({ key, kind: 'canvas', chainId, title, dirty: false });
    activeKey.value = key;
  }

  /** 回写 tab 脏标记（画布 dirty-change 事件直达） */
  function setDirty(chainId: NonNullable<ChainTab['chainId']>, dirty: boolean): void {
    const tab = tabs.value.find((t) => t.chainId != null && String(t.chainId) === String(chainId));
    if (tab) tab.dirty = dirty;
  }

  /**
   * 关闭 tab（不弹确认；脏拦截由调用方 ChainWorkPanel 负责）。
   * 关的是激活 tab 时，优先让位给右侧邻居，否则左侧邻居，全空则清空激活态。
   */
  function close(key: string): void {
    const idx = tabs.value.findIndex((t) => t.key === key);
    if (idx === -1) return;
    tabs.value.splice(idx, 1);
    if (activeKey.value === key) {
      const next = tabs.value[idx] ?? tabs.value[idx - 1];
      activeKey.value = next?.key ?? '';
    }
  }

  /** Ctrl+PageDown/PageUp 循环切换（面板键盘钩子调用） */
  function cycle(dir: 1 | -1): void {
    if (tabs.value.length < 2) return;
    const idx = tabs.value.findIndex((t) => t.key === activeKey.value);
    const next = (idx + dir + tabs.value.length) % tabs.value.length;
    activeKey.value = tabs.value[next].key;
  }

  return { tabs, activeKey, activeTab, openCanvas, setDirty, close, cycle };
}
