<!--
  物料市场 tab 面板（工作区中栏一个特殊 kind，非独立路由页；设计正本 §二/§三）。
  两个视图互相切换：
    · 市场（浏览 + 安装）——3 列卡片网格，右上「管理」进入管理视图；
    · 管理——左上返回「市场」，内含三个视角：已装管理 / 我的上架（作者）/ 待审核（治理，按权限串显隐）。
  分段＝组件 / 链路（带计数徽标）；搜索复用资源树口径（名称/编码/标签）。
  面板自身零 API：数据走 useMarketData，复制/卸载/打开/启停上抛宿主（与本工作台「树不闭环」同范式）。
-->
<template>
  <section class="mkt">
    <!-- ============ 市场视图 ============ -->
    <template v-if="view === 'browse'">
      <header class="mkt__head">
        <div class="mkt__titles">
          <h2 class="mkt__title">物料市场</h2>
          <p class="mkt__sub">安装即 fork 到你的目录，上游改动不影响本地副本。</p>
        </div>
        <el-button class="mkt__manage" @click="openManage">
          <SvgIcon icon-class="lucide:settings" /><span>管理</span>
        </el-button>
      </header>

      <div class="mkt__bar">
        <div class="mkt__seg">
          <button
            type="button"
            class="mkt__seg-item"
            :class="{ 'is-active': activeType === 'COMPONENT' }"
            @click="market.switchType('COMPONENT')"
          >
            组件
          </button>
          <button
            type="button"
            class="mkt__seg-item"
            :class="{ 'is-active': activeType === 'CHAIN' }"
            @click="market.switchType('CHAIN')"
          >
            链路
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
        <button
          type="button"
          class="mkt__chip"
          :class="{ 'is-active': activeChip === 'ALL' }"
          @click="market.switchChip('ALL')"
        >
          全部
        </button>
        <button
          type="button"
          class="mkt__chip"
          :class="{ 'is-active': activeChip === 'RECOMMEND' }"
          @click="market.switchChip('RECOMMEND')"
        >
          推荐
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
          v-for="c in categories"
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
          <template #description>
            <span>{{ browseFiltered ? '没有匹配的物料' : '还没有物料，去上架第一个吧' }}</span>
          </template>
          <el-button v-if="!browseFiltered" v-hasPermi="['databus:market:publish']" type="primary" @click="goPublishFirst">
            <SvgIcon icon-class="lucide:plus" /><span>去上架</span>
          </el-button>
        </el-empty>
        <template v-for="g in groups" :key="g.key">
          <div class="mkt__group-title">{{ g.label }}</div>
          <div class="mkt__grid">
            <article v-for="it in g.items" :key="it.id" class="mkt-card">
              <SvgIcon
                class="mkt-card__icon"
                :icon-class="itemIcon(it)"
                :style="{ color: it.color || 'var(--el-color-primary)' }"
              />
              <div class="mkt-card__meta">
                <div class="mkt-card__name" :title="it.name">{{ it.name }}</div>
                <div class="mkt-card__summary" :title="it.summary">{{ it.summary || it.codeDisplay }}</div>
              </div>
              <el-button v-if="it.installed" class="mkt-card__act" size="small" type="primary" @click="onUse(it)">
                <span>使用</span>
              </el-button>
              <el-button v-else-if="it.mine" class="mkt-card__act" size="small" @click="goMyListings">
                <SvgIcon icon-class="lucide:settings" /><span>已上架</span>
              </el-button>
              <el-button v-else class="mkt-card__act" size="small" @click="onInstall(it)">
                <SvgIcon icon-class="lucide:download" /><span>安装</span>
              </el-button>
            </article>
          </div>
        </template>
      </div>
    </template>

    <!-- ============ 管理视图 ============ -->
    <template v-else>
      <div class="mkt__topbar">
        <button type="button" class="mkt__back" @click="view = 'browse'">
          <SvgIcon icon-class="lucide:chevron-left" /><span>返回市场</span>
        </button>
      </div>
      <header class="mkt__head mkt__head--sub">
        <div class="mkt__titles">
          <h2 class="mkt__title">{{ manageTitle }}</h2>
          <p class="mkt__sub">{{ manageSub }}</p>
        </div>
        <el-button v-hasPermi="['databus:market:publish']" type="primary" @click="openPublish">
          <SvgIcon icon-class="lucide:plus" /><span>上架物料</span>
        </el-button>
      </header>

      <!-- 视角分段：已装管理（消费）/ 我的上架（作者）/ 待审核（治理，按权限显隐） -->
      <div class="mkt__scopes">
        <button
          type="button"
          class="mkt__scope-item"
          :class="{ 'is-active': scope === 'installed' }"
          @click="switchScope('installed')"
        >
          已装管理
        </button>
        <button
          type="button"
          class="mkt__scope-item"
          :class="{ 'is-active': scope === 'mine' }"
          @click="switchScope('mine')"
        >
          我的上架 <span class="mkt__seg-badge">{{ mineTotal }}</span>
        </button>
        <button
          v-hasPermi="['databus:market:review']"
          type="button"
          class="mkt__scope-item"
          :class="{ 'is-active': scope === 'pending' }"
          @click="switchScope('pending')"
        >
          待审核 <span class="mkt__seg-badge">{{ pendingTotal }}</span>
        </button>
      </div>

      <div class="mkt__bar">
        <div class="mkt__seg">
          <button
            type="button"
            class="mkt__seg-item"
            :class="{ 'is-active': activeType === 'COMPONENT' }"
            @click="market.switchType('COMPONENT')"
          >
            组件 <span class="mkt__seg-badge">{{ scopeCounts.COMPONENT }}</span>
          </button>
          <button
            type="button"
            class="mkt__seg-item"
            :class="{ 'is-active': activeType === 'CHAIN' }"
            @click="market.switchType('CHAIN')"
          >
            链路 <span class="mkt__seg-badge">{{ scopeCounts.CHAIN }}</span>
          </button>
        </div>
        <el-input v-model="manageKeyword" class="mkt__search" placeholder="搜索物料" clearable size="small">
          <template #prefix><SvgIcon icon-class="lucide:search" /></template>
        </el-input>
      </div>

      <div v-loading="loading" class="mkt__body">
        <!-- 视角一：已装管理（消费侧） -->
        <template v-if="scope === 'installed'">
          <el-empty v-if="!installedRows.length" description="还没有安装任何物料" :image-size="72">
            <el-button @click="view = 'browse'">去市场逛逛</el-button>
          </el-empty>
          <ul v-else class="mkt__list">
            <li v-for="row in installedRows" :key="row.id" class="mkt-row">
              <SvgIcon
                class="mkt-row__icon"
                :icon-class="rowIcon(row)"
                :style="{ color: row.color || 'var(--el-color-primary)' }"
              />
              <div class="mkt-row__meta">
                <div class="mkt-row__name">{{ row.name }}</div>
                <div class="mkt-row__summary">{{ row.summary }}</div>
              </div>
              <div class="mkt-row__ops">
                <!-- 启停仅对组件有意义（链路生命周期由发布/下线管），故链路只留卸载 -->
                <el-switch
                  v-if="row.resourceType === 'COMPONENT'"
                  :model-value="row.enabled !== false"
                  size="small"
                  @change="(v: string | number | boolean) => onToggle(row, Boolean(v))"
                />
                <el-button size="small" type="danger" plain @click="onUninstall(row)">
                  <SvgIcon icon-class="lucide:trash" /><span>卸载</span>
                </el-button>
              </div>
            </li>
          </ul>
        </template>

        <!-- 视角二：我的上架（作者主权：下架 / 删除；驳回理由展示） -->
        <template v-else-if="scope === 'mine'">
          <el-empty v-if="!mineRows.length" description="你还没有上架过物料" :image-size="72">
            <el-button v-hasPermi="['databus:market:publish']" type="primary" @click="openPublish">
              上架第一个
            </el-button>
          </el-empty>
          <ul v-else class="mkt__list">
            <li v-for="row in mineRows" :key="row.id" class="mkt-row">
              <SvgIcon
                class="mkt-row__icon"
                :icon-class="itemIcon(row)"
                :style="{ color: row.color || 'var(--el-color-primary)' }"
              />
              <div class="mkt-row__meta">
                <div class="mkt-row__line">
                  <span class="mkt-row__name">{{ row.name }}</span>
                  <el-tag size="small" :type="statusMeta(row.status).type" effect="light">
                    {{ statusMeta(row.status).label }}
                  </el-tag>
                </div>
                <div class="mkt-row__summary">{{ row.summary || row.codeDisplay }}</div>
                <div v-if="row.status === 'REJECTED' && row.remark" class="mkt-row__remark">
                  驳回理由：{{ row.remark }}
                </div>
              </div>
              <div class="mkt-row__ops">
                <el-button v-if="row.status === 'ONLINE'" size="small" @click="onUnpublish(row)">
                  <SvgIcon icon-class="lucide:arrow-down-to-line" /><span>下架</span>
                </el-button>
                <el-button size="small" type="danger" plain @click="onDeleteItem(row)">
                  <SvgIcon icon-class="lucide:trash" /><span>删除</span>
                </el-button>
              </div>
            </li>
          </ul>
        </template>

        <!-- 视角三：待审核（治理队列：通过 → 上线 / 驳回 → 必填理由） -->
        <template v-else>
          <el-empty v-if="!pendingRows.length" description="暂无待审核物料" :image-size="72" />
          <ul v-else class="mkt__list">
            <li v-for="row in pendingRows" :key="row.id" class="mkt-row">
              <SvgIcon
                class="mkt-row__icon"
                :icon-class="itemIcon(row)"
                :style="{ color: row.color || 'var(--el-color-primary)' }"
              />
              <div class="mkt-row__meta">
                <div class="mkt-row__name">{{ row.name }}</div>
                <div class="mkt-row__summary">{{ row.summary || row.codeDisplay }}</div>
                <div class="mkt-row__code">{{ row.codeDisplay }}</div>
              </div>
              <div class="mkt-row__ops">
                <el-button size="small" type="primary" @click="onApprove(row)">通过</el-button>
                <el-button size="small" type="danger" plain @click="onReject(row)">驳回</el-button>
              </div>
            </li>
          </ul>
        </template>
      </div>
    </template>

    <MarketInstallDialog
      v-model:visible="installVisible"
      :item="installItem"
      :loading="installLoading"
      @confirm="onInstallConfirm"
    />
    <MarketPublishDialog
      v-model:visible="publishVisible"
      :categories="categories"
      :loading="publishLoading"
      @confirm="onPublishConfirm"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import modal from '@/plugins/modal';
import { useUserStore } from '@/store/modules/user';
import type {
  DatabusMarketInstallVo,
  MarketItemStatus,
  DatabusMarketItemVo,
  MarketPublishForm,
  MarketResourceType
} from '@/api/databus/market/types';
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';
import { useMarketData } from './useMarketData';
import MarketInstallDialog from './MarketInstallDialog.vue';
import MarketPublishDialog from './MarketPublishDialog.vue';

defineOptions({ name: 'MarketPane' });

useLucideSubset();

const emit = defineEmits<{
  /** 打开本地副本（使用）：宿主按类型开画布 / 详情 tab */
  (e: 'open-local', localResourceId: string | number, resourceType: 'COMPONENT' | 'CHAIN', title: string): void;
  /** 安装 / 卸载成功：宿主刷树与台账 */
  (e: 'installed'): void;
  /** 启停本地组件副本：宿主调组件接口（组件行在台账，面板无 DB 行） */
  (e: 'toggle-local', localResourceId: string | number, enabled: boolean): void;
}>();

const market = useMarketData();
const { categories, installed, mine, pending, loading, activeType, activeChip, groups, installedCounts, mineCounts } = market;

/** 视图开关：browse＝市场 / manage＝管理 */
const view = ref<'browse' | 'manage'>('browse');
/** 管理视图视角：installed＝已装管理 / mine＝我的上架 / pending＝待审核 */
const scope = ref<'installed' | 'mine' | 'pending'>('installed');

/** 市场页搜索（手动触发/清空时重拉） */
const keyword = computed({
  get: () => market.keyword.value,
  set: (v: string) => {
    market.keyword.value = v;
  }
});
/** 管理页搜索（客户端过滤当前视角列表） */
const manageKeyword = ref('');

/* ---------------- 权限判定（一律按权限串，admin 通配免检） ---------------- */
const userStore = useUserStore();
function hasPermi(perm: string): boolean {
  return userStore.permissions.some((p: string) => p === '*:*:*' || p === perm);
}
const canPublish = computed(() => hasPermi('databus:market:publish'));
const canReview = computed(() => hasPermi('databus:market:review'));

/* ---------------- 弹窗状态 ---------------- */
const installVisible = ref(false);
const installItem = ref<DatabusMarketItemVo | null>(null);
const installLoading = ref(false);

const publishVisible = ref(false);
const publishLoading = ref(false);

onMounted(async () => {
  await Promise.all([market.loadCategories(), market.refresh()]);
  await market.loadInstalled();
  if (canPublish.value) {
    await market.loadMine();
  }
  if (canReview.value) {
    await market.loadPending();
  }
});

/* ---------------- 展示辅助 ---------------- */

/** 物料图标：链路固定，组件取自带图标 */
function itemIcon(it: DatabusMarketItemVo): string {
  return it.resourceType === 'CHAIN' ? 'lucide:spline' : it.icon || 'lucide:box';
}

function rowIcon(row: DatabusMarketInstallVo): string {
  return row.resourceType === 'CHAIN' ? 'lucide:spline' : row.icon || 'lucide:box';
}

/** 上架状态标签映射 */
const STATUS_META: Record<MarketItemStatus, { label: string; type: 'primary' | 'success' | 'warning' | 'danger' | 'info' }> = {
  DRAFT: { label: '草稿', type: 'info' },
  PENDING: { label: '待审核', type: 'warning' },
  APPROVED: { label: '已通过', type: 'primary' },
  REJECTED: { label: '已驳回', type: 'danger' },
  ONLINE: { label: '已上架', type: 'success' },
  OFFLINE: { label: '已下架', type: 'info' }
};
function statusMeta(status: MarketItemStatus) {
  return STATUS_META[status] ?? { label: status, type: 'info' as const };
}

/** 市场空态是否由筛选造成（关键字 / 非「全部」chip） */
const browseFiltered = computed(() => !!keyword.value.trim() || activeChip.value !== 'ALL');

/** 管理视图标题/副标题随视角切换 */
const manageTitle = computed(
  () => ({ installed: '管理', mine: '我的上架', pending: '待审核' })[scope.value]
);
const manageSub = computed(
  () =>
    ({
      installed: '管理你已安装的组件与链路。',
      mine: '你上架的物料与审核状态；可下架或删除。',
      pending: '治理队列：通过即上线，驳回需填写理由。'
    })[scope.value]
);

/** 视角总数（分段徽标：我的上架 / 待审核） */
const mineTotal = computed(() => mine.value.length);
const pendingTotal = computed(() => pending.value.length);

/** 类型分段徽标随视角取数 */
const scopeCounts = computed<{ COMPONENT: number; CHAIN: number }>(() => {
  if (scope.value === 'mine') {
    return mineCounts.value;
  }
  if (scope.value === 'pending') {
    const count = (t: MarketResourceType) => pending.value.filter((i) => i.resourceType === t).length;
    return { COMPONENT: count('COMPONENT'), CHAIN: count('CHAIN') };
  }
  return installedCounts.value;
});

/** 关键字过滤（名称 / 简介 / 展示码） */
function filterByKeyword(list: DatabusMarketItemVo[], kw: string): DatabusMarketItemVo[] {
  const k = kw.trim().toLowerCase();
  return !k ? list : list.filter((r) => [r.name, r.summary, r.codeDisplay].some((s) => (s ?? '').toLowerCase().includes(k)));
}

/** 已装行：按当前类型 + 关键字过滤 */
const installedRows = computed(() => {
  const kw = manageKeyword.value.trim().toLowerCase();
  return installed.value
    .filter((r) => r.resourceType === activeType.value)
    .filter((r) => (!kw ? true : [r.name, r.summary].some((s) => (s ?? '').toLowerCase().includes(kw))));
});

/** 我的上架行：按当前类型 + 关键字过滤 */
const mineRows = computed(() => filterByKeyword(mine.value.filter((r) => r.resourceType === activeType.value), manageKeyword.value));

/** 待审核行：按当前类型 + 关键字过滤 */
const pendingRows = computed(() => filterByKeyword(pending.value.filter((r) => r.resourceType === activeType.value), manageKeyword.value));

/* ---------------- 视图切换 ---------------- */

async function openManage() {
  scope.value = 'installed';
  view.value = 'manage';
  await Promise.all([
    market.loadInstalled(),
    canPublish.value ? market.loadMine() : Promise.resolve(),
    canReview.value ? market.loadPending() : Promise.resolve()
  ]);
}

/** 切换管理视角：清空搜索并按需拉取该视角数据 */
async function switchScope(next: 'installed' | 'mine' | 'pending') {
  scope.value = next;
  manageKeyword.value = '';
  if (next === 'installed') {
    await market.loadInstalled();
  } else if (next === 'mine') {
    await market.loadMine();
  } else {
    await market.loadPending();
  }
}

/** 卡片「已上架」动作：跳到管理视图「我的上架」（这些是我自己上架的物料，无需再安装） */
async function goMyListings() {
  view.value = 'manage';
  if (!canPublish.value) {
    return;
  }
  await switchScope('mine');
}

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
    await market.install(it.id, directoryId);
    ElMessage.success(`已安装「${it.name}」，可到资源树「我的目录」查看`);
    installVisible.value = false;
    emit('installed');
  } catch {
    /* 拦截器已提示 */
  } finally {
    installLoading.value = false;
  }
}

function onUse(it: DatabusMarketItemVo) {
  if (it.localResourceId == null) {
    return;
  }
  emit('open-local', it.localResourceId, it.resourceType, it.name);
}

/* ---------------- 已装管理操作 ---------------- */

function onToggle(row: DatabusMarketInstallVo, enabled: boolean) {
  if (row.localResourceId == null) {
    return;
  }
  emit('toggle-local', row.localResourceId, enabled);
}

async function onUninstall(row: DatabusMarketInstallVo) {
  if (row.localResourceId == null) {
    return;
  }
  try {
    await modal.confirm(
      `确认卸载「${row.name}」？将删除你的本地副本；若你的链路仍在使用它，可能影响运行。`
    );
  } catch {
    return;
  }
  try {
    await market.uninstall(row.localResourceId);
    ElMessage.success('已卸载');
    emit('installed');
  } catch {
    /* 拦截器已提示 */
  }
}

/* ---------------- 我的上架操作 ---------------- */

/** 下架自己的在线物料 */
async function onUnpublish(row: DatabusMarketItemVo) {
  try {
    await modal.confirm(`确认下架「${row.name}」？下架后市场不再展示，你的源资源不受影响。`);
  } catch {
    return;
  }
  try {
    await market.unpublish(row.id);
    ElMessage.success('已下架');
  } catch {
    /* 拦截器已提示 */
  }
}

/** 删除市场物料（作者主权，物理删；不影响源资源） */
async function onDeleteItem(row: DatabusMarketItemVo) {
  try {
    await modal.confirm(`确认删除市场物料「${row.name}」？删除后不可恢复（不影响你的源资源）。`);
  } catch {
    return;
  }
  try {
    await market.removeItem(row.id);
    ElMessage.success('已删除');
  } catch {
    /* 拦截器已提示 */
  }
}

/* ---------------- 上架提交 ---------------- */

/** 打开上架弹窗（空市场 CTA 与「我的上架」共用入口） */
function openPublish() {
  publishVisible.value = true;
}

/** 空市场 CTA：切到「我的上架」并打开上架弹窗 */
function goPublishFirst() {
  scope.value = 'mine';
  view.value = 'manage';
  openPublish();
}

async function onPublishConfirm(form: MarketPublishForm) {
  publishLoading.value = true;
  try {
    await market.publish(form);
    ElMessage.success('已提交，等待治理审核');
    publishVisible.value = false;
    scope.value = 'mine';
    view.value = 'manage';
  } catch {
    /* 拦截器已提示 */
  } finally {
    publishLoading.value = false;
  }
}

/* ---------------- 待审核操作 ---------------- */

/** 通过：直接上线 */
async function onApprove(row: DatabusMarketItemVo) {
  try {
    await modal.confirm(`通过审核「${row.name}」？通过后立即在市场展示。`);
  } catch {
    return;
  }
  try {
    await market.review(row.id, { approved: true });
    ElMessage.success('已通过');
  } catch {
    /* 拦截器已提示 */
  }
}

/** 驳回：必填理由（写入 remark） */
async function onReject(row: DatabusMarketItemVo) {
  let reason = '';
  try {
    const res = await ElMessageBox.prompt(`驳回「${row.name}」，请填写驳回理由：`, '驳回上架', {
      confirmButtonText: '驳回',
      cancelButtonText: '取消',
      inputType: 'textarea',
      inputPlaceholder: '必填：说明驳回原因，便于作者修改',
      inputValidator: (v: string) => (v && v.trim() ? true : '请填写驳回理由')
    });
    reason = String(res.value ?? '').trim();
  } catch {
    return;
  }
  try {
    await market.review(row.id, { approved: false, reason });
    ElMessage.success('已驳回');
  } catch {
    /* 拦截器已提示 */
  }
}
</script>

<style lang="scss" scoped>
.mkt {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--el-bg-color, #fff);

  /* 宽屏下内容不铺满整屏：所有横排区块统一限宽居中，两侧留白（浏览页 / 管理页共用） */
  --mkt-max: 1200px;
}

/* 限宽居中：窄屏时 width:100% 自然铺满，宽屏时封顶并居中 */
.mkt__head,
.mkt__bar,
.mkt__chips,
.mkt__scopes,
.mkt__body {
  width: 100%;
  max-width: var(--mkt-max);
  margin-right: auto;
  margin-left: auto;
}

/* 管理视图顶部返回条：不参与限宽居中，返回按钮贴面板左上角（对标 Trae 插件市场） */
.mkt__topbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 14px 20px 2px;
}

.mkt__head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px 12px;
}

/* 标题行在返回条之下时压缩上间距，避免与返回条叠加出双倍留白 */
.mkt__head--sub {
  padding-top: 8px;
}

.mkt__back {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  height: 28px;
  padding: 0 10px 0 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  background: transparent;
  border: 1px solid var(--el-border-color-light);
  border-radius: 7px;
  cursor: pointer;

  &:hover {
    color: var(--el-color-primary);
    border-color: var(--el-color-primary-light-5);
  }
}

.mkt__titles {
  min-width: 0;
  flex: 1;
}

.mkt__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.mkt__sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.mkt__manage {
  flex-shrink: 0;
}

/* 管理视角分段（已装管理 / 我的上架 / 待审核） */
.mkt__scopes {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 20px 10px;
}

.mkt__scope-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;

  &:hover {
    color: var(--el-color-primary);
  }

  &.is-active {
    color: var(--el-color-primary);
    font-weight: 600;
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary-light-7);
  }
}

.mkt__bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 20px 10px;
}

.mkt__search {
  width: 240px;
  margin-left: auto;
}

/* 类型分段（对标 Trae「插件 / 技能 / MCP」） */
.mkt__seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 9px;
  background: var(--el-fill-color-light, #f5f7fa);
}

.mkt__seg-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 14px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  background: transparent;
  border: none;
  border-radius: 7px;
  cursor: pointer;

  &.is-active {
    color: var(--el-text-color-primary);
    font-weight: 600;
    background: var(--el-bg-color);
    box-shadow: 0 1px 3px rgb(0 0 0 / 8%);
  }
}

.mkt__seg-badge {
  min-width: 16px;
  padding: 0 5px;
  border-radius: 8px;
  font-size: 11px;
  line-height: 15px;
  text-align: center;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color, #f0f2f5);
}

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

.mkt__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 20px 20px;
}

.mkt__group-title {
  margin: 6px 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
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
  transition: background-color 0.15s ease;

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

  &__act {
    flex-shrink: 0;
  }
}

/* 管理页行列表：整体包一层圆角描边容器（借鉴 Trae 插件市场的边框样式） */
.mkt__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  overflow: hidden;
}

.mkt-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);

  &:last-child {
    border-bottom: none;
  }

  &__icon {
    flex-shrink: 0;
    font-size: 20px;
  }

  &__meta {
    flex: 1;
    min-width: 0;
  }

  &__line {
    display: flex;
    align-items: center;
    gap: 8px;
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

  &__code {
    margin-top: 3px;
    font-size: 12px;
    color: var(--el-text-color-placeholder);
  }

  &__remark {
    margin-top: 4px;
    font-size: 12px;
    color: var(--el-color-danger);
    line-height: 1.5;
  }

  &__ops {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }
}
</style>