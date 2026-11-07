<!--
  物料市场 tab 面板（工作区中栏 kind market，全局单例，非独立路由页；设计正本 §二/§三）。
  只管「逛 + 装」：3 列卡片网格，类型分段（组件 / 链路 / 连接器）+ 分类 chips + 搜索（名称/编码/标签）。
  治理与作者事务不在这里——2026-10-30 起搬到独立的「物料管理」tab（MarketManagePane），
  本 pane 只负责把用户送过去（页头「管理」、卡片「已上架」（组件/链路）、空态「去上架」都上抛宿主开管理 tab）。
  连接器（万物皆包 §15.3）：安装＝写一条个人安装记录（无目录语义不弹窗），不改 def 全局启停；
  def 行是模块级共享单例（marketDisplay），与管理 tab 的治理行同源，运行态提示不会两边对不上。
  跨 tab 跳转（打开详情/本地副本、去上架/去管理）上抛宿主；安装与卸载由本面板直接调接口。
  连接器的启用/停用/废弃属治理动作，只在「物料管理 → 治理」视角提供，市场页不放治理入口。
-->
<template>
  <section class="mkt">
    <header class="mkt__head">
      <div class="mkt__titles">
        <h2 class="mkt__title">{{ ownerCode ? `@${ownerCode} 的作品` : '物料市场' }}</h2>
      </div>
      <el-button v-if="ownerCode" class="mkt__manage" size="small" @click="market.clearOwner()">
        <SvgIcon icon-class="lucide:x" /><span>退出作者筛选</span>
      </el-button>
      <el-button class="mkt__manage" @click="emit('open-manage')">
        <SvgIcon icon-class="lucide:settings" /><span>管理</span>
      </el-button>
    </header>

    <div class="mkt__bar">
      <div class="db-seg">
        <button
          type="button"
          class="db-seg__item"
          :class="{ 'is-active': activeType === 'COMPONENT' }"
          @click="market.switchType('COMPONENT')"
        >
          组件
        </button>
        <button
          type="button"
          class="db-seg__item"
          :class="{ 'is-active': activeType === 'CHAIN' }"
          @click="market.switchType('CHAIN')"
        >
          链路
        </button>
        <button
          type="button"
          class="db-seg__item"
          :class="{ 'is-active': activeType === 'CONNECTOR' }"
          @click="market.switchType('CONNECTOR')"
        >
          连接器
        </button>
      </div>
      <el-input
        v-model="keyword"
        class="mkt__search"
        placeholder="搜索名称 / 编码 / 标签"
        clearable
        size="small"
        @change="market.refresh()"
        @clear="market.refresh()"
      >
        <template #prefix><SvgIcon icon-class="lucide:search" /></template>
      </el-input>
    </div>

    <div class="mkt__chips">
      <button type="button" class="mkt__chip" :class="{ 'is-active': activeChip === 'ALL' }" @click="market.switchChip('ALL')">
        全部
      </button>
      <button
        type="button"
        class="mkt__chip"
        :class="{ 'is-active': activeChip === 'RECOMMEND' }"
        @click="market.switchChip('RECOMMEND')"
      >
        最新
      </button>
      <button
        v-if="mineCounts[activeType]"
        type="button"
        class="mkt__chip"
        :class="{ 'is-active': activeChip === 'MINE' }"
        @click="market.switchChip('MINE')"
      >
        我的上架
      </button>
      <button
        v-if="installedCounts[activeType]"
        type="button"
        class="mkt__chip"
        :class="{ 'is-active': activeChip === 'INSTALLED' }"
        @click="market.switchChip('INSTALLED')"
      >
        已安装
      </button>
      <button
        v-for="c in categoryChips"
        :key="c.id"
        type="button"
        class="mkt__chip"
        :class="{ 'is-active': String(activeChip) === String(c.id) }"
        @click="market.switchChip(c.id)"
      >
        {{ c.name }}
      </button>
    </div>

    <div v-loading="loading" class="mkt__body">
      <el-empty v-if="!groups.length" :image-size="72">
      </el-empty>
      <template v-for="g in groups" :key="g.key">
        <div class="mkt__group-title">{{ g.label }}</div>
        <div class="mkt__grid">
          <article v-for="it in g.items" :key="it.id" class="mkt-card db-float" @click="onCardClick(it)">
            <SvgIcon
              class="mkt-card__icon"
              :icon-class="itemIcon(it)"
              :style="{ color: it.color || 'var(--el-color-primary)' }"
            />
            <div class="mkt-card__meta">
              <div class="mkt-card__name" :title="it.name">{{ it.name }}</div>
              <div class="mkt-card__summary" :title="it.summary">{{ it.summary || it.codeDisplay }}</div>
            </div>
            <div class="mkt-card__aside">
              <!-- 连接器（§15.3）：市场只做消费——安装＝写一条个人安装记录，卸载＝删这条记录，都不改 def 全局启停。
                   启用/停用/废弃是治理者动作，统一收口到「物料管理 → 治理」，本页只保留运行态提示 -->
              <template v-if="activeType === 'CONNECTOR'">
                <!-- 已装：市场动作只有「卸载」（删个人安装记录）；运行态异常另挂提示标签（原因 hover），
                     不把治理状态做成按钮 -->
                <template v-if="it.installed">
                  <el-tag
                    v-if="connectorDefStatus(it) === 'DEPRECATED'"
                    size="small"
                    type="info"
                    effect="plain"
                  >
                    已废弃
                  </el-tag>
                  <el-tag
                    v-else-if="connectorHealthOf(it).type !== 'success'"
                    size="small"
                    :type="connectorHealthOf(it).type"
                    effect="plain"
                    :title="connectorHealthOf(it).reason"
                  >
                    {{ connectorHealthOf(it).label }}
                  </el-tag>
                  <el-button
                    class="mkt-card__act"
                    size="small"
                    type="danger"
                    plain
                    @click.stop="onUninstallCard(it)"
                  >
                    <SvgIcon icon-class="lucide:trash" /><span>卸载</span>
                  </el-button>
                </template>
                <!-- 未装：只有一个消费动作「安装」（上传者、治理者、普通用户都先落个人安装记录）；
                     已废弃的不给安装入口（废弃后不可运行） -->
                <el-tag v-else-if="connectorDefStatus(it) === 'DEPRECATED'" size="small" type="info" effect="plain">已废弃</el-tag>
                <el-button
                  v-else
                  class="mkt-card__act"
                  size="small"
                  :loading="installLoading"
                  @click.stop="onInstallConnector(it)"
                >
                  <SvgIcon icon-class="lucide:download" /><span>安装</span>
                </el-button>
              </template>
              <template v-else>
                <!-- 已装卡片的「打开」即整卡点击默认行为（2026-10-24），动作区只留卸载；
                     与管理 tab 卸载同款（danger plain + trash），卡片动作区统一 el-button + 图标 -->
                <el-button
                  v-if="it.installed"
                  class="mkt-card__act"
                  size="small"
                  type="danger"
                  plain
                  @click.stop="onUninstallCard(it)"
                >
                  <SvgIcon icon-class="lucide:trash" /><span>卸载</span>
                </el-button>
                <el-button v-else-if="it.mine" class="mkt-card__act" size="small" @click.stop="emit('open-manage', 'mine')">
                  <SvgIcon icon-class="lucide:settings" /><span>已上架</span>
                </el-button>
                <el-button v-else class="mkt-card__act" size="small" @click.stop="onInstall(it)">
                  <SvgIcon icon-class="lucide:download" /><span>安装</span>
                </el-button>
              </template>
              <div class="mkt-card__sub">
                <button
                  v-if="it.ownerCode"
                  type="button"
                  class="mkt-card__author"
                  :class="{ 'is-active': ownerCode === it.ownerCode }"
                  @click.stop="market.filterByOwner(it.ownerCode!)"
                >
                  @{{ it.ownerCode }}
                </button>
              </div>
            </div>
          </article>
        </div>
      </template>
    </div>

    <MarketInstallDialog
      v-model:visible="installVisible"
      :item="installItem"
      :loading="installLoading"
      @confirm="onInstallConfirm"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import modal from '@/plugins/modal';
import { useUserStore } from '@/store/modules/user';
import type { DatabusMarketItemVo } from '@/api/databus/market/types';
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';
import type { MarketScope } from '../workbench.types';
import { useMarketData, marketNavIntent, showChainInstallResult } from './useMarketData';
import { connectorDefs, connectorHealthMeta, itemIcon, loadConnectorDefs } from './marketDisplay';
import MarketInstallDialog from './MarketInstallDialog.vue';

defineOptions({ name: 'MarketPane' });

useLucideSubset();

const props = defineProps<{
  /** 刷新令牌：审核 tab 审完 / 管理 tab 动了台账后宿主自增，本 pane 据此重取市场列表与计数 */
  refreshToken?: number;
}>();

const emit = defineEmits<{
  /** 打开本地资源：宿主按类型开画布 / 详情 tab */
  (e: 'open-local', localResourceId: string | number, resourceType: 'COMPONENT' | 'CHAIN', title: string): void;
  /** 安装 / 卸载成功：宿主刷树与台账 */
  (e: 'installed'): void;
  /** 点卡片主体：打开物料详情 tab（kind market-detail） */
  (e: 'open-detail', item: DatabusMarketItemVo): void;
  /** 去物料管理 tab（kind market-manage，全局单例）；带 scope＝顺便切到那个视角 */
  (e: 'open-manage', scope?: MarketScope): void;
  /** 空态「去上架」：开物料上架 tab（2026-11-01 上架 tab 化，不再经管理 pane 弹窗递接） */
  (e: 'open-publish'): void;
}>();

const market = useMarketData();
const { categories, loading, activeType, activeChip, ownerCode, groups, installedCounts, mineCounts } = market;

/** 分类 chips 按当前分段过滤：分类的适用类型匹配才出现，空串＝通用（三个分段都出现） */
const categoryChips = computed(() =>
  categories.value.filter((c) => !c.resourceType || c.resourceType === activeType.value)
);

/** 市场页搜索（手动触发/清空时重拉） */
const keyword = computed({
  get: () => market.keyword.value,
  set: (v: string) => {
    market.keyword.value = v;
  }
});

/* ---------------- 权限判定（一律按权限串，admin 通配免检） ---------------- */
const userStore = useUserStore();
function hasPermi(perm: string): boolean {
  return userStore.permissions.some((p: string) => p === '*:*:*' || p === perm);
}
const canPublish = computed(() => hasPermi('databus:market:publish'));
/* defs 取数的 list 权限判定收在 marketDisplay.loadConnectorDefs 内部；
   启停不在市场页做，故本页不再判 connector:edit */

/* ---------------- 弹窗状态 ---------------- */
const installVisible = ref(false);
const installItem = ref<DatabusMarketItemVo | null>(null);
const installLoading = ref(false);

/* 连接器分段：进入时拉 defs（卡片运行态提示与 DEPRECATED 标签匹配，不含治理入口） */
watch(activeType, (t) => {
  if (t === 'CONNECTOR') {
    void loadConnectorDefs();
  }
});

/* 刷新令牌：重取市场列表（新上线物料可见、连接器安装态跟着管理 tab 变）与两个 chips 计数源 */
watch(
  () => props.refreshToken,
  (token) => {
    if (!token) {
      return;
    }
    void market.refresh();
    void market.loadInstalled();
    // 分类治理（物料分类视角）动过目录后，chips 要按新目录重取
    void market.loadCategories();
    if (canPublish.value) {
      void market.loadMine();
    }
  }
);

onMounted(async () => {
  await Promise.all([market.loadCategories(), market.refresh()]);
  await market.loadInstalled();
  if (canPublish.value) {
    await market.loadMine();
  }
});

/* 消费跨 tab 导航意图（物料详情 tab / 物料管理 tab → 本 pane）：按作者筛选。
   publish 意图已退役（2026-11-01 上架 tab 化：市场空态 CTA 直开 market-publish tab）；消费后置空 */
watch(
  marketNavIntent,
  async (intent) => {
    if (intent?.kind !== 'owner') {
      return;
    }
    const { ownerCode: code, resourceType } = intent;
    marketNavIntent.value = null;
    // 带类型＝从管理页行上 @作者 过来，分段要跟着切；不带＝详情页作者链接，只筛作者
    if (resourceType) {
      await market.filterByOwnerInType(code, resourceType);
    } else {
      await market.filterByOwner(code);
    }
  },
  { immediate: true }
);

/* ---------------- 展示辅助 ---------------- */

/* 市场空态是否由筛选造成（关键字 / 非「全部」chip / 作者过滤） */
const browseFiltered = computed(() => !!keyword.value.trim() || activeChip.value !== 'ALL' || !!ownerCode.value);

/* ---------------- 安装 / 使用 ---------------- */

function onInstall(it: DatabusMarketItemVo) {
  installItem.value = it;
  installVisible.value = true;
}

async function onInstallConfirm(directoryId: string | number | null) {
  const it = installItem.value;
  if (!it) {
    return;
  }
  installLoading.value = true;
  try {
    const vo = await market.install(it.id, directoryId);
    // 链路安装展示级联复制/复用清单（decisions §十四-2）；组件保持一句话提示
    if (it.resourceType === 'CHAIN') {
      showChainInstallResult(vo);
    } else {
      ElMessage.success(`已安装「${it.name}」，组件已共享注册到物料面板`);
    }
    installVisible.value = false;
    emit('installed');
  } catch {
    /* 拦截器已提示 */
  } finally {
    installLoading.value = false;
  }
}

/* ---------------- 连接器卡片动作（§15.3 安装＝个人安装记录） ---------------- */

/** 卡片物料行 → def 行 type：优先按 localResourceId（＝def 行 id）精确匹配，兜底 codeDisplay 末段（code=type 全局唯一） */
function connectorTypeOf(it: DatabusMarketItemVo): string | null {
  if (it.localResourceId != null) {
    const hit = connectorDefs.value.find((d) => d.id != null && String(d.id) === String(it.localResourceId));
    if (hit) {
      return hit.type;
    }
  }
  const tail = (it.codeDisplay ?? '').split('/').pop();
  return tail && tail.length > 0 ? tail : null;
}

/** 卡片对应 def 行的运行层状态（找不到 def 行返回 null）：DEPRECATED 终态只挂标签，不给安装/卸载动作 */
function connectorDefStatus(it: DatabusMarketItemVo): string | null {
  const type = connectorTypeOf(it);
  if (!type) {
    return null;
  }
  return connectorDefs.value.find((d) => d.type === type)?.status ?? null;
}

/**
 * 卡片对应 def 行的运行态健康（§4.2.1）：卡片只做提示不做治理——
 * 缺驱动的包能安装却连不上，得在卡片上看出来，否则用户点了「新建连接」才知道。
 */
function connectorHealthOf(it: DatabusMarketItemVo) {
  const type = connectorTypeOf(it);
  const row = type ? connectorDefs.value.find((d) => d.type === type) : null;
  return connectorHealthMeta(row);
}

/**
 * 安装：调市场 install，后端 CONNECTOR 分支只写一条个人安装记录（不改 def 全局启停，无目录语义）。
 */
async function onInstallConnector(it: DatabusMarketItemVo) {
  installLoading.value = true;
  try {
    await market.install(it.id, null);
    ElMessage.success(`已安装连接器「${it.name}」`);
    await loadConnectorDefs();
    emit('installed');
  } catch {
    /* 拦截器已提示 */
  } finally {
    installLoading.value = false;
  }
}

/**
 * 卡片默认点击（2026-10-24）：「打开」不再单列按钮——已装组件/链路点卡片即打开本地资源；
 * 其余（未装、自己上架、连接器、无本地资源）仍进物料详情。
 */
function onCardClick(it: DatabusMarketItemVo) {
  if (it.installed && it.localResourceId != null && (it.resourceType === 'COMPONENT' || it.resourceType === 'CHAIN')) {
    onUse(it);
    return;
  }
  emit('open-detail', it);
}

function onUse(it: DatabusMarketItemVo) {
  // emit 只收 COMPONENT/CHAIN（连接器无本地资源可打开，卡片动作走 enable/disable）
  if (it.localResourceId == null || (it.resourceType !== 'COMPONENT' && it.resourceType !== 'CHAIN')) {
    return;
  }
  emit('open-local', it.localResourceId, it.resourceType, it.name);
}

/**
 * 浏览卡片就地卸载（2026-10-24 级联缺口E：装在哪卸在哪，与管理 tab onUninstall 同端点）。
 * 连接器卸载只删个人安装记录，不动 def 本体；链路文案带级联回收说明
 * （后端 cascadeCleanClosureCopies：未引用且装完未碰的子链副本一并清）。
 */
async function onUninstallCard(it: DatabusMarketItemVo) {
  if (it.localResourceId == null) {
    return;
  }
  let tip = `确认卸载「${it.name}」？`;
  if (activeType.value === 'CONNECTOR') {
    tip = `确认卸载「${it.name}」？只删除你的安装记录，连接器本体与全局启停不受影响。`;
  } else if (activeType.value === 'CHAIN') {
    tip = `确认卸载「${it.name}」？将删除你的本地副本（随它入目录、未引用且装完未碰的子链副本一并回收）；若该副本仍被你的其他链路引用，会被拒绝删除，请先移除引用。`;
  }
  try {
    await modal.confirm(tip);
  } catch {
    return;
  }
  try {
    await market.uninstall(it.localResourceId);
    ElMessage.success('已卸载');
    emit('installed');
  } catch {
    /* 拦截器已提示 */
  }
}
</script>

<style lang="scss" scoped>
/* 面板外壳 / 页头 / 限宽居中 / 搜索框 / 滚动体 / 组标题走全局 _databus-market.scss（与管理 tab 同源）；
   此处只留市场页独有的：类型分段行、分类 chips、卡片网格 */

.mkt__manage {
  flex-shrink: 0;
}

.mkt__bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 20px 10px;
}

/* 类型分段：胶囊轨道与选中态走全局 .db-seg（唯一基准，见 assets/styles/components/_databus-tabs.scss） */

/* 分类 chips */
.mkt__chips {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px 12px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.mkt__chip {
  flex-shrink: 0;
  height: 26px;
  padding: 0 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light, #f5f7fa);
  border: none;
  border-radius: 13px;
  cursor: pointer;

  &.is-active {
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }
}

/* 3 列卡片网格 */
.mkt__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.mkt-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  background: var(--el-fill-color-light, #f5f7fa);
  cursor: pointer;
  /* 浮起（位移/缩放/阴影/过渡）全部由 .db-float 提供（见 _primitives.scss）；
     本页只按体积给小卡收一档放大，并保留自己的 hover 底色。 */
  --db-zoom: 1.015;

  &:hover {
    background: var(--el-fill-color, #eef0f3);
  }

  &__icon {
    flex-shrink: 0;
    font-size: 20px;
  }

  &__meta {
    flex: 1;
    min-width: 0;
  }

  &__name {
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__summary {
    margin-top: 3px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__aside {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
  }

  &__sub {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__author {
    padding: 0;
    font-size: 12px;
    color: var(--el-text-color-placeholder);
    background: transparent;
    border: none;
    cursor: pointer;

    &:hover {
      color: var(--el-color-primary);
      text-decoration: underline;
    }

    &.is-active {
      color: var(--el-color-primary);
      font-weight: 600;
    }
  }

  &__count {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
  }

  &__act {
    flex-shrink: 0;
  }
}
</style>
