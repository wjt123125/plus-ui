/**
 * 工作区单壳 tab 会话（useChainTabs + useComponentTabs 合流，2026-10-17 工作区融合）。
 * 多 kind 同容器混排，key 规则见 workbench-unification.md §2.1：
 *   canvas:{chainId}（同链单例）/ component:detail:{code}
 *   / component:form:{id}（新建临时 component:form:new）/ component:changes:{id}
 *   / market（物料市场，全局单例）/ market-item:{id}（物料详情，同 id 单例）
 * 会话落 localStorage：刷新恢复上次打开的 tab（无历史=空白工作台）；重复打开只聚焦。
 */
import { watch } from 'vue';
import modal from '@/plugins/modal';
import { usePersisted } from '@/views/databus/workbench/composables/usePersisted';
import { useWorkbenchTabs } from '@/views/databus/workbench/composables/useWorkbenchTabs';
import type { ComponentRegistryRow } from '@/views/databus/component/model/registry';
import type { FormPreset, WorkspaceTab } from '../workbench.types';

/** 新建组件 tab 的保留 key（保存成功后 adoptNewForm 转正） */
export const NEW_FORM_KEY = 'component:form:new';
/** 物料市场 tab 单例 key */
export const MARKET_TAB_KEY = 'market';

export function canvasKey(chainId: WorkspaceTab['chainId']): string {
  return `canvas:${chainId}`;
}
export function detailKey(code: string): string {
  return `component:detail:${code}`;
}
export function formKey(id?: number): string {
  return id == null ? NEW_FORM_KEY : `component:form:${id}`;
}
export function changesKey(id: number): string {
  return `component:changes:${id}`;
}
export function marketItemKey(itemId: number | string): string {
  return `market-item:${itemId}`;
}

export function useWorkspaceTabs() {
  const wb = useWorkbenchTabs<WorkspaceTab>();

  /* ---- 会话持久化：刷新恢复上次打开的 tab；手动清空后刷新=空白工作台 ---- */

  /** 落盘快照：tab 列表 + 激活 key（空数组即空白工作台，同样落盘，保证清空后刷新不复现） */
  const store = usePersisted<{ tabs: WorkspaceTab[]; activeKey: string }>('databus.ws.tabs', {
    tabs: [],
    activeKey: ''
  });

  // 进页面先恢复上次会话；dirty 不还原（草稿体不落盘，标脏会与实际内容不符）
  // 兼容旧会话：组件库（grid）tab 已废弃，恢复时剔除，避免残留指向已删 panel 的空 tab
  const restoredTabs = (Array.isArray(store.value.tabs) ? store.value.tabs : [])
    .filter((t) => (t.kind as string) !== 'grid')
    .map((t) => ({ ...t, dirty: false }));
  wb.tabs.value = restoredTabs;
  wb.activeKey.value = restoredTabs.some((t) => t.key === store.value.activeKey)
    ? store.value.activeKey
    : (restoredTabs[restoredTabs.length - 1]?.key ?? '');

  // 任何会话变动（开/关/聚焦/转正）即落盘
  watch(
    [wb.tabs, wb.activeKey],
    () => {
      store.value = { tabs: wb.tabs.value, activeKey: wb.activeKey.value };
    },
    { deep: true }
  );

  /** 打开（或聚焦）链路画布 tab（同链单例，已开时刷新标题） */
  function openCanvas(chainId: NonNullable<WorkspaceTab['chainId']>, title: string): string {
    const key = canvasKey(chainId);
    const existed = wb.tabs.value.find((t) => t.key === key);
    if (existed) {
      existed.title = title; // 链路可能已改名，聚焦时顺手刷新
    }
    return wb.open({
      key,
      kind: 'canvas',
      chainId,
      code: '',
      title,
      dirty: false
    });
  }

  /** 仅当画布 tab 已打开时刷新标题（重命名场景）；未打开不新建 tab */
  function refreshTitleIfOpen(chainId: NonNullable<WorkspaceTab['chainId']>, title: string): void {
    const tab = wb.tabs.value.find((t) => t.chainId != null && String(t.chainId) === String(chainId));
    if (tab) {
      tab.title = title;
    }
  }

  /** 打开/聚焦组件详情 tab（正本身份是 code，内置/自建通吃） */
  function openDetail(row: Pick<ComponentRegistryRow, 'code' | 'name'>): string {
    return wb.open({
      key: detailKey(row.code),
      kind: 'detail',
      title: row.name,
      code: row.code,
      dirty: false
    });
  }

  /** 打开/聚焦物料市场 tab（全局单例，非独立路由页） */
  function openMarket(): string {
    return wb.open({
      key: MARKET_TAB_KEY,
      kind: 'market',
      title: '物料市场',
      code: '',
      dirty: false
    });
  }

  /** 打开/聚焦物料详情 tab（同 id 单例；pane 自取数，不走台账） */
  function openMarketDetail(itemId: number | string, title: string): string {
    const id = String(itemId); // 雪花 id 超 2^53，勿转 Number（会丢精度）
    const key = marketItemKey(id);
    const existed = wb.tabs.value.find((t) => t.key === key);
    if (existed) {
      existed.title = title; // 物料可能已改名，聚焦时顺手刷新
    }
    return wb.open({
      key,
      kind: 'market-detail',
      title,
      code: '',
      marketItemId: id,
      dirty: false
    });
  }

  /** 打开/聚焦组件编辑 tab（id 空=新建临时 tab） */
  function openForm(
    id: number | undefined,
    row?: Pick<ComponentRegistryRow, 'code' | 'name'>,
    preset?: FormPreset
  ): string {
    const key = formKey(id);
    // 新建 tab 是单例：换目录再次「新建组件」时只替换预设，脏草稿由 FormPane 自行决定保留
    const existed = wb.tabs.value.find((t) => t.key === key);
    if (existed) {
      existed.preset = preset;
    }
    return wb.open({
      key,
      kind: 'form',
      title: row?.name ?? '新组件',
      code: row?.code ?? '',
      dbId: id,
      dirty: false,
      preset
    });
  }

  /** 打开/聚焦代码变更 tab（仅自建件；无 DB 行拒绝） */
  function openChanges(row: ComponentRegistryRow): string | null {
    if (row.db?.id == null) {
      return null;
    }
    return wb.open({
      key: changesKey(row.db.id),
      kind: 'changes',
      title: row.name,
      code: row.code,
      dbId: row.db.id,
      version: row.db.version ?? null,
      dirty: false
    });
  }

  /** 关闭同组件的全部 tab（删除组件后调用） */
  function closeByCode(code: string): void {
    const remain = wb.tabs.value.filter((t) => t.code !== code);
    wb.tabs.value = remain;
    if (!remain.some((t) => t.key === wb.activeKey.value)) {
      wb.activeKey.value = remain[remain.length - 1]?.key ?? '';
    }
  }

  /**
   * 关闭族统一收口（右键菜单「关闭其他/左侧/右侧/全部」）：批量关 tab 前，对待关脏 tab
   * 一次性确认（1 条用单数文案，N 条合并），取消则整批不关，避免逐条弹窗。
   * 落地后激活 key 若被关则锚定右键那条（focusKey 仍在会话中）否则回退末位。
   */
  async function closeKeys(keys: string[], focusKey: string): Promise<void> {
    const target = new Set(keys);
    const dirty = wb.tabs.value.filter((t) => target.has(t.key) && t.dirty);
    if (dirty.length > 0) {
      const msg =
        dirty.length === 1
          ? `「${dirty[0].title}」有未保存的改动，确认放弃并关闭？`
          : `${dirty.length} 个标签有未保存的改动，确认全部放弃并关闭？`;
      try {
        await modal.confirm(msg);
      } catch {
        return; // 用户取消，整批不关
      }
    }
    const remain = wb.tabs.value.filter((t) => !target.has(t.key));
    wb.tabs.value = remain;
    if (target.has(wb.activeKey.value)) {
      wb.activeKey.value = remain.some((t) => t.key === focusKey)
        ? focusKey
        : (remain[remain.length - 1]?.key ?? '');
    }
  }

  /** 关闭其他（保留右键那条并聚焦） */
  function closeOthers(key: string): Promise<void> {
    return closeKeys(
      wb.tabs.value.filter((t) => t.key !== key).map((t) => t.key),
      key
    );
  }

  /** 关闭左侧（保留右键那条及其右侧） */
  function closeLeft(key: string): Promise<void> {
    const idx = wb.tabs.value.findIndex((t) => t.key === key);
    if (idx <= 0) {
      return Promise.resolve();
    }
    return closeKeys(
      wb.tabs.value.slice(0, idx).map((t) => t.key),
      key
    );
  }

  /** 关闭右侧（保留右键那条及其左侧） */
  function closeRight(key: string): Promise<void> {
    const idx = wb.tabs.value.findIndex((t) => t.key === key);
    if (idx === -1 || idx >= wb.tabs.value.length - 1) {
      return Promise.resolve();
    }
    return closeKeys(
      wb.tabs.value.slice(idx + 1).map((t) => t.key),
      key
    );
  }

  /** 关闭全部（回到空白工作台） */
  function closeAll(): Promise<void> {
    return closeKeys(
      wb.tabs.value.map((t) => t.key),
      ''
    );
  }

  /** 新组件保存成功：component:form:new 临时 tab 转正为 component:form:{id} */
  function adoptNewForm(code: string, id: number, name: string): void {
    const idx = wb.tabs.value.findIndex((t) => t.key === NEW_FORM_KEY);
    if (idx === -1) {
      return;
    }
    wb.tabs.value[idx] = {
      key: formKey(id),
      kind: 'form',
      title: name,
      code,
      dbId: id,
      dirty: false
    };
    wb.activeKey.value = formKey(id);
  }

  return {
    ...wb,
    openCanvas,
    refreshTitleIfOpen,
    openDetail,
    openMarket,
    openMarketDetail,
    openForm,
    openChanges,
    closeByCode,
    closeOthers,
    closeLeft,
    closeRight,
    closeAll,
    adoptNewForm
  };
}
