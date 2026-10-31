/**
 * 物料市场数据层（市场页 / 管理页共用）。
 * 设计正本 §三/§十一：浏览＝列表 + 分类 + 搜索；管理＝我的已装列表。
 * 视图层只管展示与交互，数据拉取、安装/卸载动作全在此收口。
 */
import { computed, h, ref } from 'vue';
import { ElNotification } from 'element-plus';
import {
  delMarketItem,
  getMarketReviewDetail,
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
  MarketReviewDetailVo,
  MarketReviewForm
} from '@/api/databus/market/types';
import { useLoading } from '@/hooks/async/useLoading';
import modal from '@/plugins/modal';

/** 分类 chips 的单选值：全部 / 最新 / 我上架的 / 已安装 / 具体分类 id */
export type MarketChip = 'ALL' | 'RECOMMEND' | 'MINE' | 'INSTALLED' | string | number;

/** 「最新」组容量（无 recommend 字段，按上架时间取头部） */
const RECOMMEND_SIZE = 6;

/**
 * 跨 tab 市场导航意图（模块级共享单例）。两个 pane 各自 watch 同一个 ref，
 * 故**只认领并清空自己的 kind**（市场 pane 认 owner、管理 pane 认 publish），
 * 否则先消费的一方会把意图抹掉，后到的一方扑空。
 *   owner   → 市场 tab：按作者筛选（物料详情页作者链接 / 管理页行上 @作者）
 *   publish → 管理 tab：落到「我的上架」并直接弹上架弹窗（市场空态 CTA）
 */
export type MarketNavIntent =
  | { kind: 'owner'; ownerCode: string; resourceType?: MarketResourceType }
  | { kind: 'publish' };
export const marketNavIntent = ref<MarketNavIntent | null>(null);

/**
 * 链路安装结果提示（decisions §十四-2 级联清单）：级联复制/复用明细以通知卡片逐行展示
 * （状态标签＋源名称＋新编码），两处安装入口（市场卡片 / 物料详情 tab）共用。
 * 通知全局渲染，样式走内联（scoped 不生效）；仅 CHAIN 安装有 cascade，空清单回退一句话提示。
 */
export function showChainInstallResult(vo: DatabusMarketInstallVo | null | undefined): void {
  const cascade = vo?.cascade ?? [];
  if (!cascade.length) {
    modal.msgSuccess('已安装，链路副本已加入资源树「我的目录」');
    return;
  }
  ElNotification({
    title: '链路安装完成',
    type: 'success',
    duration: 8000,
    message: h(
      'div',
      { style: 'display:flex;flex-direction:column;gap:6px;max-height:260px;overflow-y:auto;margin-top:4px;' },
      cascade.map((c) =>
        h('div', { style: 'display:flex;align-items:center;gap:8px;font-size:12px;min-width:0;' }, [
          h(
            'span',
            {
              style:
                'flex-shrink:0;padding:1px 6px;border-radius:4px;font-size:11px;' +
                (c.status === 'NEW'
                  ? 'color:var(--el-color-success);background:var(--el-color-success-light-9);'
                  : 'color:var(--el-color-warning);background:var(--el-color-warning-light-9);')
            },
            c.status === 'NEW' ? '新增' : '复用既有'
          ),
          h('span', { style: 'flex-shrink:0;color:var(--el-text-color-primary);' }, c.sourceName || c.sourceCode),
          h(
            'span',
            {
              style:
                'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--el-text-color-secondary);'
            },
            `→ ${c.newCode}`
          )
        ])
      )
    )
  });
}

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
  /** 作者过滤（点卡片 @作者 / 详情页作者）：空=不过滤 */
  const ownerCode = ref('');

  /** chip 是否为「具体分类」（非全部 / 最新 / 我的上架 / 已安装等哨兵） */
  function asCategoryId(chip: MarketChip): string | number | undefined {
    return typeof chip === 'string' && isNaN(Number(chip)) ? undefined : chip;
  }

  /** 拉取市场列表（类型 + 搜索 + 作者过滤走服务端；「最新」在客户端按上架时间截取） */
  async function refresh(): Promise<void> {
    await withLoading(async () => {
      const { data } = await listMarketItems({
        resourceType: activeType.value,
        keyword: keyword.value || undefined,
        categoryId: asCategoryId(activeChip.value),
        ownerCode: ownerCode.value || undefined,
        pageNum: 1,
        pageSize: 999
      });
      items.value = data?.rows ?? [];
    });
  }

  /** 按作者过滤（浏览卡片点 @作者 / 详情页作者）：再点同一作者即退出；切「@X 的作品」视图 */
  async function filterByOwner(code: string): Promise<void> {
    if (ownerCode.value === code) {
      ownerCode.value = '';
    } else {
      ownerCode.value = code;
      activeChip.value = 'ALL';
      keyword.value = '';
    }
    await refresh();
  }

  /** 退出作者过滤（回「全部」） */
  async function clearOwner(): Promise<void> {
    ownerCode.value = '';
    await refresh();
  }

  /**
   * 按作者过滤并切到指定分段（管理页行上 @作者 → 浏览视图看该作者该类型作品）。
   * 不能串 switchType 再 filterByOwner：switchType 会把 ownerCode 清空，故一次 set 再一次 refresh。
   */
  async function filterByOwnerInType(code: string, type: MarketResourceType): Promise<void> {
    activeType.value = type;
    ownerCode.value = code;
    activeChip.value = 'ALL';
    keyword.value = '';
    await refresh();
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

  /** 审核详情（P1 解「干审」）：内容预览＋闭包依赖状态树（权限 databus:market:review） */
  async function reviewDetail(id: string | number): Promise<MarketReviewDetailVo | undefined> {
    const { data } = await getMarketReviewDetail(id);
    return data;
  }

  /** 安装（链路＝fork 副本 / 组件＝共享注册 / 连接器＝enable def 行，目录参数被后端忽略）；装完刷新列表与已装列表 */
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

  /** 最新组：按上架时间降序取头部（确定口径；计数为异步缓存、初期不可信故不用安装数） */
  const recommended = computed(() =>
    items.value
      .toSorted((a, b) => String(b.createTime ?? '').localeCompare(String(a.createTime ?? '')) || b.id.toString().localeCompare(a.id.toString()))
      .slice(0, RECOMMEND_SIZE)
  );

  /** 分组展示：chip=全部 时仅各分类组（单轴去重，「最新」只作独立 chip）；chip=最新/我上架/已安装/具体分类 时单组 */
  const groups = computed<{ key: string; label: string; items: DatabusMarketItemVo[] }[]>(() => {
    if (activeChip.value === 'RECOMMEND') {
      return [{ key: 'RECOMMEND', label: '最新', items: recommended.value }];
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

  /** 市场 chips「已安装」计数：按类型统计已装条数（连接器不写 install 台账，恒 0——其启停治理走 defs 端点，MarketPane 自行拉 defs 展示） */
  const installedCounts = computed(() => {
    const count = (type: MarketResourceType) =>
      installed.value.filter((i) => i.resourceType === type).length;
    return { COMPONENT: count('COMPONENT'), CHAIN: count('CHAIN'), CONNECTOR: count('CONNECTOR') };
  });

  /** 市场 chips「我上架的」计数：按类型统计我的上架条数 */
  const mineCounts = computed(() => {
    const count = (type: MarketResourceType) =>
      mine.value.filter((i) => i.resourceType === type).length;
    return { COMPONENT: count('COMPONENT'), CHAIN: count('CHAIN'), CONNECTOR: count('CONNECTOR') };
  });

  function chipLabel(chip: MarketChip): string {
    const found = categories.value.find((c) => String(c.id) === String(chip));
    return found?.name ?? '全部';
  }

  /** 切分段后清空 chip / 关键字 / 作者过滤并按新分段拉取 */
  async function switchType(type: MarketResourceType): Promise<void> {
    activeType.value = type;
    activeChip.value = 'ALL';
    keyword.value = '';
    ownerCode.value = '';
    await refresh();
  }

  /** 切换 chip 后重拉（服务端分类过滤 / 客户端最新截取）；作者过滤随之退出 */
  async function switchChip(chip: MarketChip): Promise<void> {
    activeChip.value = chip;
    ownerCode.value = '';
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
    ownerCode,
    recommended,
    groups,
    installedCounts,
    mineCounts,
    refresh,
    filterByOwner,
    filterByOwnerInType,
    clearOwner,
    loadCategories,
    loadInstalled,
    loadMine,
    loadPending,
    publish,
    unpublish,
    removeItem,
    review,
    reviewDetail,
    install,
    uninstall,
    switchType,
    switchChip
  };
}
