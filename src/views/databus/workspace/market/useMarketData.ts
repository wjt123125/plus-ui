/**
 * 物料市场数据层（市场页 / 管理页共用）。
 * 设计正本 §三/§十一：浏览＝列表 + 分类 + 搜索；管理＝我的已装列表。
 * 视图层只管展示与交互，数据拉取、安装/卸载动作全在此收口。
 */
import { computed, ref } from 'vue';
import {
  delMarketItem,
  installMarketItem,
  listInstalled,
  listMarketCategories,
  listMarketItems,
  listMyMarketItems,
  listPendingMarketItems,
  publishMarket,
  reviewMarketItem,
  uninstallMarketItem,
  unpublishMarketItem
} from '@/api/databus/market';
import type {
  DatabusMarketCategoryVo,
  DatabusMarketInstallVo,
  DatabusMarketItemVo,
  MarketPublishForm,
  MarketResourceType,
  MarketReviewForm
} from '@/api/databus/market/types';
import { useLoading } from '@/hooks/async/useLoading';

/** 分类 chips 的单选值：全部 / 推荐 / 我上架的 / 已安装 / 具体分类 id */
export type MarketChip = 'ALL' | 'RECOMMEND' | 'MINE' | 'INSTALLED' | string | number;

/** 推荐组容量（无 recommend 字段，按安装数取头部） */
const RECOMMEND_SIZE = 6;

export function useMarketData() {
  const items = ref<DatabusMarketItemVo[]>([]);
  const categories = ref<DatabusMarketCategoryVo[]>([]);
  const installed = ref<DatabusMarketInstallVo[]>([]);
  /** 我的上架（作者视角，含各状态） */
  const mine = ref<DatabusMarketItemVo[]>([]);
  /** 待审核队列（治理者视角，仅 PENDING） */
  const pending = ref<DatabusMarketItemVo[]>([]);
  const { loading, withLoading } = useLoading(false);

  /** 当前分段（组件 / 链路） */
  const activeType = ref<MarketResourceType>('COMPONENT');
  /** 搜索关键字（名称 / 编码 / 标签） */
  const keyword = ref('');
  /** 当前分类 chip */
  const activeChip = ref<MarketChip>('ALL');

  /** chip 是否为「具体分类」（非全部 / 推荐 / 我的上架 / 已安装等哨兵） */
  function asCategoryId(chip: MarketChip): string | number | undefined {
    return typeof chip === 'string' && isNaN(Number(chip)) ? undefined : chip;
  }

  /** 拉取市场列表（类型 + 搜索走服务端；「推荐」在客户端按安装数截取） */
  async function refresh(): Promise<void> {
    await withLoading(async () => {
      const { data } = await listMarketItems({
        resourceType: activeType.value,
        keyword: keyword.value || undefined,
        categoryId: asCategoryId(activeChip.value),
        pageNum: 1,
        pageSize: 999
      });
      items.value = data?.rows ?? [];
    });
  }

  async function loadCategories(): Promise<void> {
    const { data } = await listMarketCategories();
    categories.value = data ?? [];
  }

  /** 我的已装列表（管理页数据源） */
  async function loadInstalled(): Promise<void> {
    await withLoading(async () => {
      const { data } = await listInstalled();
      installed.value = data ?? [];
    });
  }

  /** 我的上架列表（作者视角） */
  async function loadMine(): Promise<void> {
    await withLoading(async () => {
      const { data } = await listMyMarketItems();
      mine.value = data ?? [];
    });
  }

  /** 待审核队列（治理者视角；无权限时后端 403，前端按权限串不调用） */
  async function loadPending(): Promise<void> {
    await withLoading(async () => {
      const { data } = await listPendingMarketItems();
      pending.value = data ?? [];
    });
  }

  /** 提交上架（进待审）；上架后刷新「我的上架」与市场列表 */
  async function publish(form: MarketPublishForm): Promise<void> {
    await publishMarket(form);
    await Promise.all([loadMine(), refresh()]);
  }

  /** 下架自己的物料（在线 → 下线） */
  async function unpublish(id: string | number): Promise<void> {
    await unpublishMarketItem(id);
    await Promise.all([loadMine(), refresh()]);
  }

  /** 删市场原件（作者主权）；删除后刷新「我的上架」与市场列表 */
  async function removeItem(id: string | number): Promise<void> {
    await delMarketItem(id);
    await Promise.all([loadMine(), refresh()]);
  }

  /** 审核（通过 → 上线 / 驳回 → 驳回态）；审完刷新待审队列与市场列表 */
  async function review(id: string | number, form: MarketReviewForm): Promise<void> {
    await reviewMarketItem(id, form);
    await Promise.all([loadPending(), refresh()]);
  }

  /** 安装＝fork；装完刷新列表（+安装 → 使用）与已装列表 */
  async function install(itemId: string | number, directoryId?: string | number | null): Promise<DatabusMarketInstallVo | undefined> {
    const { data } = await installMarketItem(itemId, { directoryId: directoryId ?? null });
    await Promise.all([refresh(), loadInstalled()]);
    return data;
  }

  /** 卸载＝删我的副本；返回后端附加的引用软提示（若有） */
  async function uninstall(resourceId: string | number): Promise<void> {
    await uninstallMarketItem(resourceId);
    await Promise.all([refresh(), loadInstalled()]);
  }

  /** 推荐组：按安装数降序取头部（同数按名称） */
  const recommended = computed(() =>
    items.value
      .toSorted((a, b) => (b.installCount ?? 0) - (a.installCount ?? 0) || a.name.localeCompare(b.name, 'zh-CN'))
      .slice(0, RECOMMEND_SIZE)
  );

  /** 分组展示：chip=全部 时「推荐」组 + 各分类组；chip=推荐/我上架/已安装/具体分类 时单组 */
  const groups = computed<{ key: string; label: string; items: DatabusMarketItemVo[] }[]>(() => {
    if (activeChip.value === 'RECOMMEND') {
      return [{ key: 'RECOMMEND', label: '推荐', items: recommended.value }];
    }
    if (activeChip.value === 'MINE') {
      const members = items.value.filter((it) => it.mine);
      return members.length ? [{ key: 'MINE', label: '我上架的', items: members }] : [];
    }
    if (activeChip.value === 'INSTALLED') {
      const members = items.value.filter((it) => it.installed);
      return members.length ? [{ key: 'INSTALLED', label: '已安装', items: members }] : [];
    }
    if (activeChip.value !== 'ALL') {
      return [{ key: String(activeChip.value), label: chipLabel(activeChip.value), items: items.value }];
    }
    const result: { key: string; label: string; items: DatabusMarketItemVo[] }[] = [];
    if (recommended.value.length) {
      result.push({ key: 'RECOMMEND', label: '推荐', items: recommended.value });
    }
    for (const c of categories.value) {
      const members = items.value.filter((it) => String(it.categoryId) === String(c.id));
      if (members.length) {
        result.push({ key: String(c.id), label: c.name, items: members });
      }
    }
    const rest = items.value.filter((it) => !categories.value.some((c) => String(c.id) === String(it.categoryId)));
    if (rest.length) {
      result.push({ key: '__rest', label: '其他', items: rest });
    }
    return result;
  });

  /** 管理页计数徽标：按类型统计已装条数 */
  const installedCounts = computed(() => {
    const count = (type: MarketResourceType) =>
      installed.value.filter((i) => i.resourceType === type).length;
    return { COMPONENT: count('COMPONENT'), CHAIN: count('CHAIN') };
  });

  /** 管理页计数徽标：按类型统计我的上架条数 */
  const mineCounts = computed(() => {
    const count = (type: MarketResourceType) =>
      mine.value.filter((i) => i.resourceType === type).length;
    return { COMPONENT: count('COMPONENT'), CHAIN: count('CHAIN') };
  });

  function chipLabel(chip: MarketChip): string {
    const found = categories.value.find((c) => String(c.id) === String(chip));
    return found?.name ?? '全部';
  }

  /** 切分段后清空 chip 与关键字并按新分段拉取 */
  async function switchType(type: MarketResourceType): Promise<void> {
    activeType.value = type;
    activeChip.value = 'ALL';
    keyword.value = '';
    await refresh();
  }

  /** 切换 chip 后重拉（服务端分类过滤 / 客户端推荐截取） */
  async function switchChip(chip: MarketChip): Promise<void> {
    activeChip.value = chip;
    await refresh();
  }

  return {
    items,
    categories,
    installed,
    mine,
    pending,
    loading,
    activeType,
    keyword,
    activeChip,
    recommended,
    groups,
    installedCounts,
    mineCounts,
    refresh,
    loadCategories,
    loadInstalled,
    loadMine,
    loadPending,
    publish,
    unpublish,
    removeItem,
    review,
    install,
    uninstall,
    switchType,
    switchChip
  };
}
