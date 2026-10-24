<!--
  物料市场 tab 面板（工作区中栏一个特殊 kind，非独立路由页；设计正本 §二/§三）。
  两个视图互相切换：
    · 市场（浏览 + 安装）——3 列卡片网格，右上「管理」进入管理视图；
    · 管理——左上返回「市场」，内含三个视角：已装管理 / 我的上架（作者）/ 待审核（治理，按权限串显隐）。
      视角是唯一一层 tab：类型不再分段点击，而是平铺成「组件 → 链路 → 连接器」分组列表（空组整组隐藏）；
      待审核数量红色冒泡（未读消息式，有任务才显示，>99 显 99+）；搜索与视角同行。
  浏览视图保留类型分段（逛市场按类型筛是必要操作，对标 Trae 插件市场）；搜索复用资源树口径（名称/编码/标签）。
  连接器（万物皆包 §15.3）：安装＝enable def 行全局生效（无目录语义不弹窗）；已装治理走 defs 端点（不写 install 台账）。
  面板自身零 API：数据走 useMarketData，复制/卸载/打开/启停上抛宿主（与本工作台「树不闭环」同范式）。
-->
<template>
  <section class="mkt">
    <!-- ============ 市场视图 ============ -->
    <template v-if="view === 'browse'">
      <header class="mkt__head">
        <div class="mkt__titles">
          <h2 class="mkt__title">{{ ownerCode ? `@${ownerCode} 的作品` : '物料市场' }}</h2>
          <p class="mkt__sub">{{ browseSub }}</p>
        </div>
        <el-button v-if="ownerCode" class="mkt__manage" size="small" @click="market.clearOwner()">
          <SvgIcon icon-class="lucide:x" /><span>退出作者筛选</span>
        </el-button>
        <el-button class="mkt__manage" @click="openManage">
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
            <article v-for="it in g.items" :key="it.id" class="mkt-card" @click="onCardClick(it)">
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
                <!-- 连接器（§15.3）：安装＝enable 全局生效无目录弹窗；已启用的停用是治理动作（按 edit 权限显隐） -->
                <template v-if="activeType === 'CONNECTOR'">
                  <el-button
                    v-if="it.installed && canConnectorEdit"
                    class="mkt-card__act"
                    size="small"
                    @click.stop="onDisableConnector(it)"
                  >
                    <SvgIcon icon-class="lucide:power" /><span>停用</span>
                  </el-button>
                  <el-tag v-else-if="it.installed" size="small" type="success" effect="plain">已启用</el-tag>
                  <el-button v-else-if="it.mine" class="mkt-card__act" size="small" @click.stop="goMyListings">
                    <SvgIcon icon-class="lucide:settings" /><span>已上架</span>
                  </el-button>
                  <el-button
                    v-else
                    class="mkt-card__act"
                    size="small"
                    type="primary"
                    :loading="installLoading"
                    @click.stop="onInstallConnector(it)"
                  >
                    <SvgIcon icon-class="lucide:power" /><span>启用</span>
                  </el-button>
                </template>
                <template v-else>
                  <!-- 已装卡片的「打开」即整卡点击默认行为（2026-10-24），动作区只留卸载；
                       与管理视图卸载同款（danger plain + trash），卡片动作区统一 el-button + 图标 -->
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
                  <el-button v-else-if="it.mine" class="mkt-card__act" size="small" @click.stop="goMyListings">
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
                  <span v-if="(it.installCount ?? 0) > 0" class="mkt-card__count">安装 {{ it.installCount }}</span>
                </div>
              </div>
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
        <el-button v-hasPermi="['databus:connector:upload']" :loading="packageUploading" @click="pickPackage">
          <SvgIcon icon-class="lucide:upload" /><span>上传连接器包</span>
        </el-button>
        <el-button v-hasPermi="['databus:market:publish']" type="primary" @click="openPublish">
          <SvgIcon icon-class="lucide:plus" /><span>上架物料</span>
        </el-button>
      </header>

      <!-- 视角分段（唯一一层 tab，类型平铺进列表不再分段）：已装管理（消费）/ 我的上架（作者）/
           待审核（治理，按权限显隐）。待审核数量红色冒泡（有任务才显示）；搜索与视角同行 -->
      <div class="mkt__scopes">
        <div class="db-seg">
          <button
            type="button"
            class="db-seg__item"
            :class="{ 'is-active': scope === 'installed' }"
            @click="switchScope('installed')"
          >
            已装管理
          </button>
          <button
            type="button"
            class="db-seg__item"
            :class="{ 'is-active': scope === 'mine' }"
            @click="switchScope('mine')"
          >
            我的上架
          </button>
          <button
            v-hasPermi="['databus:market:review']"
            type="button"
            class="db-seg__item"
            :class="{ 'is-active': scope === 'pending' }"
            @click="switchScope('pending')"
          >
            待审核
            <span v-if="pendingTotal" class="mkt__bubble">{{ pendingTotal > 99 ? '99+' : pendingTotal }}</span>
          </button>
        </div>
        <el-input v-model="manageKeyword" class="mkt__search" placeholder="搜索物料" clearable size="small">
          <template #prefix><SvgIcon icon-class="lucide:search" /></template>
        </el-input>
      </div>

      <div v-loading="loading" class="mkt__body">
        <!-- 视角一：已装管理（消费侧）。类型平铺：组件 → 链路（install 台账）→ 连接器（defs 端点，
             §15.3 不写 install 台账）；空组整组隐藏，全空才出 empty -->
        <template v-if="scope === 'installed'">
          <template v-for="grp in installedGroups" :key="grp.type">
            <div class="mkt__group-title">
              {{ grp.label }} <span class="mkt__group-count">{{ grp.items.length }}</span>
            </div>
            <ul class="mkt__list">
              <li v-for="row in grp.items" :key="row.id" class="mkt-row">
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
          <!-- 连接器组：已装治理走 defs 端点（§15.3：不写 install 台账，enable 即安装），行模板与台账行不同故单列 -->
          <template v-if="connectorRows.length">
            <div class="mkt__group-title">
              连接器 <span class="mkt__group-count">{{ connectorRows.length }}</span>
            </div>
            <ul class="mkt__list">
              <li v-for="row in connectorRows" :key="row.type" class="mkt-row">
                <SvgIcon
                  class="mkt-row__icon"
                  :icon-class="row.icon || 'lucide:plug'"
                  :style="{ color: 'var(--el-color-primary)' }"
                />
                <div class="mkt-row__meta">
                  <div class="mkt-row__line">
                    <span class="mkt-row__name">{{ row.label || row.type }}</span>
                    <el-tag size="small" :type="connectorStatusMeta(row.status).type" effect="light">
                      {{ connectorStatusMeta(row.status).label }}
                    </el-tag>
                    <el-tag v-if="row.builtin" size="small" type="info" effect="plain">内置</el-tag>
                  </div>
                  <div class="mkt-row__summary">
                    #{{ row.type }}{{ row.version ? ` · v${row.version}` : '' }}{{ row.builtin ? '' : ` · ${connectorSourceLabel(row)}` }}
                  </div>
                </div>
                <div class="mkt-row__ops">
                  <!-- 内置连接器无 def 行，不走启停/卸载端点（§15.1） -->
                  <el-switch
                    v-if="!row.builtin && canConnectorEdit"
                    :model-value="row.status === 'ENABLED'"
                    size="small"
                    @change="(v: string | number | boolean) => onToggleDef(row, Boolean(v))"
                  />
                  <el-button v-if="!row.builtin && canConnectorRemove" size="small" type="danger" plain @click="onUninstallDef(row)">
                    <SvgIcon icon-class="lucide:trash" /><span>卸载</span>
                  </el-button>
                </div>
              </li>
            </ul>
          </template>
          <el-empty v-if="installedEmpty" description="还没有安装任何物料" :image-size="72">
            <el-button @click="view = 'browse'">
              <SvgIcon icon-class="lucide:store" /><span>去市场逛逛</span>
            </el-button>
          </el-empty>
        </template>

        <!-- 视角二：我的上架（作者主权：下架 / 删除；驳回理由展示）。类型平铺，空组隐藏 -->
        <template v-else-if="scope === 'mine'">
          <template v-for="grp in mineGroups" :key="grp.type">
            <div class="mkt__group-title">
              {{ grp.label }} <span class="mkt__group-count">{{ grp.items.length }}</span>
            </div>
            <ul class="mkt__list">
              <li v-for="row in grp.items" :key="row.id" class="mkt-row">
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
                  <div v-if="row.modifyNote" class="mkt-row__remark">
                    修改说明：{{ row.modifyNote }}
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
          <el-empty v-if="!mineGroups.length" description="你还没有上架过物料" :image-size="72">
            <el-button v-hasPermi="['databus:market:publish']" type="primary" @click="openPublish">
              <SvgIcon icon-class="lucide:plus" /><span>上架第一个</span>
            </el-button>
          </el-empty>
        </template>

        <!-- 视角三：待审核（治理队列：通过 → 上线 / 驳回 → 必填理由）。类型平铺，空组隐藏 -->
        <template v-else>
          <template v-for="grp in pendingGroups" :key="grp.type">
            <div class="mkt__group-title">
              {{ grp.label }} <span class="mkt__group-count">{{ grp.items.length }}</span>
            </div>
            <ul class="mkt__list">
              <li v-for="row in grp.items" :key="row.id" class="mkt-row">
                <SvgIcon
                  class="mkt-row__icon"
                  :icon-class="itemIcon(row)"
                  :style="{ color: row.color || 'var(--el-color-primary)' }"
                />
                <div class="mkt-row__meta">
                  <div class="mkt-row__name">{{ row.name }}</div>
                  <!-- 简介为空不回退编码：下一行固定显示 codeDisplay，回退会重复显示（闭包联审连带单据无简介） -->
                  <div v-if="row.summary" class="mkt-row__summary">{{ row.summary }}</div>
                  <div class="mkt-row__code">{{ row.codeDisplay }}</div>
                </div>
                <div class="mkt-row__ops">
                  <!-- 详情：开物料审核 tab（信息头＋内容预览＋依赖树＋底部通过/驳回，禁自审与依赖知情确认都在 tab 内）。
                       行内不再放通过/驳回：B 口径要求通过前看依赖树，审核动作一律进 tab 就地完成 -->
                  <el-button size="small" @click="emit('open-review', row.id, row.name)">
                    <SvgIcon icon-class="lucide:file-check" /><span>详情</span>
                  </el-button>
                  <!-- 禁自审：自己上架的项列表先给提示，进 tab 后操作栏同样不给通过/驳回（decisions §七-7.1） -->
                  <span
                    v-if="row.ownerId === currentUserId"
                    class="mkt-row__self-pending"
                  >自己上架 · 待审核（禁自审）</span>
                </div>
              </li>
            </ul>
          </template>
          <el-empty v-if="!pendingGroups.length" description="暂无待审核物料" :image-size="72" />
        </template>
      </div>
    </template>

    <!-- 连接器包上传通道（管理视图头部按钮共用；同 type 升版本＝热更新） -->
    <input
      ref="packageInputRef"
      type="file"
      accept=".zip"
      class="mkt__hidden-input"
      @change="onPackageChange"
    />

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
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import modal from '@/plugins/modal';
import { useUserStore } from '@/store/modules/user';
import type {
  DatabusMarketInstallVo,
  MarketItemStatus,
  DatabusMarketItemVo,
  MarketPublishForm,
  MarketResourceType
} from '@/api/databus/market/types';
import type { ConnectorDefVo } from '@/api/databus/connector/types';
import {
  disableConnector,
  enableConnector,
  listConnectorDefs,
  uninstallConnector,
  uploadConnectorPackage
} from '@/api/databus/connector';
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';
import { useMarketData, marketNavIntent, showChainInstallResult } from './useMarketData';
import MarketInstallDialog from './MarketInstallDialog.vue';
import MarketPublishDialog from './MarketPublishDialog.vue';

defineOptions({ name: 'MarketPane' });

useLucideSubset();

const props = defineProps<{
  /** 刷新令牌：物料审核 tab 审完后宿主自增——待审核冒泡的唯一数据源是本 pane 实例，须在此重取 */
  refreshToken?: number;
}>();

const emit = defineEmits<{
  /** 打开本地资源：宿主按类型开画布 / 详情 tab */
  (e: 'open-local', localResourceId: string | number, resourceType: 'COMPONENT' | 'CHAIN', title: string): void;
  /** 安装 / 卸载成功：宿主刷树与台账 */
  (e: 'installed'): void;
  /** 启停本地组件副本：宿主调组件接口（组件行在台账，面板无 DB 行） */
  (e: 'toggle-local', localResourceId: string | number, enabled: boolean): void;
  /** 点卡片主体：打开物料详情 tab（kind market-detail） */
  (e: 'open-detail', item: DatabusMarketItemVo): void;
  /** 待审核「详情」：打开物料审核 tab（kind market-review，宿主 openMarketReview，同 id 单例） */
  (e: 'open-review', itemId: string | number, title: string): void;
}>();

const market = useMarketData();
const { categories, installed, mine, pending, loading, activeType, activeChip, ownerCode, groups, installedCounts, mineCounts } =
  market;

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
/** 当前用户 id（禁自审判定：待审核列表全量展示，自己上架的项不显示通过/驳回按钮，decisions §七-7.1） */
const currentUserId = computed(() => userStore.userId);
/* 连接器运行层权限（§15.7 四端点）：list 驱动 defs 视图、edit 启停、remove 卸载、upload 上传包 */
const canConnectorList = computed(() => hasPermi('databus:connector:list'));
const canConnectorEdit = computed(() => hasPermi('databus:connector:edit'));
const canConnectorRemove = computed(() => hasPermi('databus:connector:remove'));
const canConnectorUpload = computed(() => hasPermi('databus:connector:upload'));

/* ---------------- 连接器 def 行（§15.7 运行层） ---------------- */
/** def 合并视图（内置 ∪ def 行）：卡片停用匹配、已装治理行列表、类型徽标共用 */
const connectorDefs = ref<ConnectorDefVo[]>([]);
async function loadConnectorDefs(): Promise<void> {
  if (!canConnectorList.value) {
    connectorDefs.value = [];
    return;
  }
  try {
    const { data } = await listConnectorDefs();
    connectorDefs.value = data ?? [];
  } catch {
    /* 拦截器已提示；置空保持空态 */
    connectorDefs.value = [];
  }
}
/* 连接器分段：进入时拉 defs（browse 卡片停用匹配 / manage 治理列表） */
watch(activeType, (t) => {
  if (t === 'CONNECTOR') {
    void loadConnectorDefs();
  }
});

/* ---------------- 弹窗状态 ---------------- */
const installVisible = ref(false);
const installItem = ref<DatabusMarketItemVo | null>(null);
const installLoading = ref(false);

const publishVisible = ref(false);
const publishLoading = ref(false);

/* 审核完成后宿主自增刷新令牌：重取待审核（冒泡减号）与市场列表（新上线物料可见） */
watch(
  () => props.refreshToken,
  (token) => {
    if (!token) {
      return;
    }
    if (canReview.value) {
      void market.loadPending();
    }
    void market.refresh();
  }
);

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

/* 消费跨 pane 导航意图（物料详情页 → 市场 tab）：作者筛选 / 已上架跳转；消费后置空 */
watch(
  marketNavIntent,
  async (intent) => {
    if (!intent) {
      return;
    }
    if (intent.kind === 'owner') {
      view.value = 'browse';
      scope.value = 'installed';
      await market.filterByOwner(intent.ownerCode);
    } else {
      view.value = 'manage';
      if (canPublish.value) {
        await switchScope('mine');
      }
    }
    marketNavIntent.value = null;
  },
  { immediate: true }
);

/* ---------------- 展示辅助 ---------------- */

/** 物料图标：链路固定，连接器兜底电插头，组件取自带图标 */
function itemIcon(it: DatabusMarketItemVo): string {
  if (it.resourceType === 'CHAIN') {
    return 'lucide:spline';
  }
  if (it.resourceType === 'CONNECTOR') {
    return it.icon || 'lucide:plug';
  }
  return it.icon || 'lucide:box';
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

/** 连接器 def 状态标签映射 */
const CONNECTOR_STATUS_META: Record<ConnectorDefVo['status'], { label: string; type: 'success' | 'warning' | 'info' }> = {
  ENABLED: { label: '已启用', type: 'success' },
  SUSPENDED: { label: '已暂停', type: 'warning' },
  DEPRECATED: { label: '已废弃', type: 'info' }
};
function connectorStatusMeta(status: ConnectorDefVo['status']) {
  return CONNECTOR_STATUS_META[status] ?? { label: status, type: 'info' as const };
}

/** 连接器 def 来源标签（§15.3：包的来路） */
const CONNECTOR_SOURCE_LABEL: Record<ConnectorDefVo['source'], string> = {
  MARKET: '市场安装',
  UPLOAD: '手动上传',
  AI: 'AI 生成',
  ADMIN: '管理员'
};
function connectorSourceLabel(row: ConnectorDefVo): string {
  return CONNECTOR_SOURCE_LABEL[row.source ?? ''] ?? row.source ?? '未知来源';
}

/** 市场头副标题：按分段说明安装语义（链路 fork 副本 / 组件共享注册 / 连接器 enable 全局生效） */
const browseSub = computed(() => {
  if (activeType.value === 'CHAIN') {
    return '链路安装即 fork 副本到你的目录，上游改动不影响本地副本。';
  }
  if (activeType.value === 'CONNECTOR') {
    return '连接器安装即全局启用（无需目录）；停用与卸载在管理视图治理。';
  }
  return '组件安装即共享注册到物料面板，上游更新直接生效。';
});

/** 市场空态是否由筛选造成（关键字 / 非「全部」chip / 作者过滤） */
const browseFiltered = computed(() => !!keyword.value.trim() || activeChip.value !== 'ALL' || !!ownerCode.value);

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

/** 待审核总数（tab 红色冒泡：有任务才显示，>99 显 99+；切进视角处理完自动归零消失） */
const pendingTotal = computed(() => pending.value.length);

/** 关键字过滤（名称 / 简介 / 展示码） */
function filterByKeyword(list: DatabusMarketItemVo[], kw: string): DatabusMarketItemVo[] {
  const k = kw.trim().toLowerCase();
  return !k ? list : list.filter((r) => [r.name, r.summary, r.codeDisplay].some((s) => (s ?? '').toLowerCase().includes(k)));
}

/** 平铺分组标签与固定顺序（组件 → 链路 → 连接器） */
const TYPE_LABELS: Record<MarketResourceType, string> = { COMPONENT: '组件', CHAIN: '链路', CONNECTOR: '连接器' };
const TYPE_ORDER: MarketResourceType[] = ['COMPONENT', 'CHAIN', 'CONNECTOR'];

/** 我的上架 / 待审核通用分组：整表按关键字过滤后按类型拆组，空组丢弃（不渲染标题） */
function buildTypeGroups(list: DatabusMarketItemVo[]) {
  const filtered = filterByKeyword(list, manageKeyword.value);
  return TYPE_ORDER.map((type) => ({ type, label: TYPE_LABELS[type], items: filtered.filter((r) => r.resourceType === type) })).filter(
    (g) => g.items.length > 0
  );
}

/** 我的上架分组（平铺） */
const mineGroups = computed(() => buildTypeGroups(mine.value));

/** 待审核分组（平铺） */
const pendingGroups = computed(() => buildTypeGroups(pending.value));

/** 连接器已装治理行：defs 合并视图 + 关键字过滤（label / type） */
const connectorRows = computed(() => {
  const kw = manageKeyword.value.trim().toLowerCase();
  return connectorDefs.value.filter((d) =>
    !kw ? true : [d.label, d.type].some((s) => (s ?? '').toLowerCase().includes(kw))
  );
});

/** 已装台账分组（组件/链路）：install 台账按固定顺序拆组 + 关键字过滤（名称/简介），空组丢弃 */
const installedGroups = computed(() => {
  const kw = manageKeyword.value.trim().toLowerCase();
  return TYPE_ORDER.filter((t) => t !== 'CONNECTOR')
    .map((type) => ({
      type,
      label: TYPE_LABELS[type],
      items: installed.value
        .filter((r) => r.resourceType === type)
        .filter((r) => (!kw ? true : [r.name, r.summary].some((s) => (s ?? '').toLowerCase().includes(kw))))
    }))
    .filter((g) => g.items.length > 0);
});

/** 已装管理是否全空（台账组＋连接器组全空；connectorRows 含内置行，与可见口径一致） */
const installedEmpty = computed(() => !installedGroups.value.length && !connectorRows.value.length);

/* ---------------- 视图切换 ---------------- */

async function openManage() {
  scope.value = 'installed';
  view.value = 'manage';
  await Promise.all([
    market.loadInstalled(),
    canPublish.value ? market.loadMine() : Promise.resolve(),
    canReview.value ? market.loadPending() : Promise.resolve(),
    canConnectorList.value ? loadConnectorDefs() : Promise.resolve()
  ]);
}

/** 切换管理视角：清空搜索并按需拉取该视角数据；已装管理连 defs 一起拉（类型平铺后不再经 activeType watch 触发） */
async function switchScope(next: 'installed' | 'mine' | 'pending') {
  scope.value = next;
  manageKeyword.value = '';
  if (next === 'installed') {
    await Promise.all([
      market.loadInstalled(),
      canConnectorList.value ? loadConnectorDefs() : Promise.resolve()
    ]);
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

/* ---------------- 连接器卡片动作（§15.3 安装＝enable） ---------------- */

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

/** 启用（即安装）：调市场 install，后端走 CONNECTOR 分支 enable def 行全局生效（无目录语义） */
async function onInstallConnector(it: DatabusMarketItemVo) {
  installLoading.value = true;
  try {
    await market.install(it.id, null);
    ElMessage.success(`已启用连接器「${it.name}」，全局生效`);
    if (canConnectorList.value) {
      await loadConnectorDefs();
    }
    emit('installed');
  } catch {
    /* 拦截器已提示 */
  } finally {
    installLoading.value = false;
  }
}

/** 停用（治理动作，需 edit 权限）：挡新建连接，存量连接与数据保留 */
async function onDisableConnector(it: DatabusMarketItemVo) {
  const type = connectorTypeOf(it);
  if (!type) {
    ElMessage.warning('未找到该连接器的 def 行，请先刷新重试');
    return;
  }
  try {
    await modal.confirm(`确认停用连接器「${it.name}」？停用后将挡新建连接，存量连接与数据保留。`);
  } catch {
    return;
  }
  try {
    await disableConnector(type);
    ElMessage.success('已停用');
    await Promise.all([market.refresh(), loadConnectorDefs()]);
  } catch {
    /* 拦截器已提示 */
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
  // 共享注册组件：卸载仅移除安装记录不动本体（FORK 副本与链路才删本地资源）
  const shared = row.resourceType === 'COMPONENT' && row.mode === 'SHARED';
  try {
    await modal.confirm(
      shared
        ? `确认卸载「${row.name}」？`
        : `确认卸载「${row.name}」？将删除你的本地副本；若你的链路仍在使用它，可能影响运行。`
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

/**
 * 浏览卡片就地卸载（2026-10-24 级联缺口E：装在哪卸在哪，与管理视图 onUninstall 同端点）。
 * 链路文案带级联回收说明（后端 cascadeCleanClosureCopies：未引用且装完未碰的子链副本一并清）。
 */
async function onUninstallCard(it: DatabusMarketItemVo) {
  if (it.localResourceId == null) {
    return;
  }
  const tip =
    activeType.value === 'COMPONENT'
      ? `确认卸载「${it.name}」？`
      : `确认卸载「${it.name}」？将删除你的本地副本（随它入目录、未引用且未改造的子链副本一并回收）；若你的链路仍在使用它，可能影响运行。`;
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

/* ---------------- 连接器 def 治理（manage 已装视角） ---------------- */

/** def 行启停开关：enable/disable 全局生效；失败重拉 defs 回滚开关 UI */
async function onToggleDef(row: ConnectorDefVo, enabled: boolean) {
  try {
    await (enabled ? enableConnector(row.type) : disableConnector(row.type));
    ElMessage.success(enabled ? `已启用「${row.label || row.type}」，全局生效` : `已停用「${row.label || row.type}」`);
    await Promise.all([market.refresh(), loadConnectorDefs()]);
  } catch {
    /* 拦截器已提示；重拉恢复开关 */
    await loadConnectorDefs();
  }
}

/** def 行卸载：先常规（在用连接会被拒）→ 二次确认强制（存量连接悬空） */
async function onUninstallDef(row: ConnectorDefVo) {
  try {
    await modal.confirm(`确认卸载连接器「${row.label || row.type}」？将删除 def 行与包文件。`);
  } catch {
    return;
  }
  try {
    await uninstallConnector(row.type, false);
    ElMessage.success('已卸载');
    await Promise.all([market.refresh(), loadConnectorDefs()]);
    return;
  } catch {
    /* 常规卸载被拒（存在在用连接），转强制流程 */
  }
  try {
    await modal.confirm(`「${row.label || row.type}」存在在用连接，是否强制卸载？存量连接将悬空，可能影响链路运行。`);
  } catch {
    return;
  }
  try {
    await uninstallConnector(row.type, true);
    ElMessage.success('已强制卸载');
    await Promise.all([market.refresh(), loadConnectorDefs()]);
  } catch {
    /* 拦截器已提示 */
  }
}

/* ---------------- 上传连接器包（§15.3 zip 包） ---------------- */

const packageInputRef = ref<HTMLInputElement | null>(null);
const packageUploading = ref(false);

/** 触发隐藏 input 选 zip（FormData 由 api 层组装） */
function pickPackage() {
  packageInputRef.value?.click();
}

async function onPackageChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }
  packageUploading.value = true;
  try {
    const { data } = await uploadConnectorPackage(file);
    ElMessage.success(`已上传「${data?.label || data?.type || file.name}」：默认暂停态，可在已装管理启用或去上架`);
    await Promise.all([loadConnectorDefs(), market.refresh()]);
  } catch {
    /* 拦截器已提示 */
  } finally {
    packageUploading.value = false;
    input.value = ''; // 允许重复选同一文件
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
/* 审核动作（通过/驳回、B 口径依赖知情确认、依赖查看留痕）已随详情 tab 化整体迁入
   MarketReviewTab（2026-10-24）；本 pane 只负责开 tab 与审完刷新（refreshToken watch）。 */

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

/* 连接器包上传通道：仅作 pickPackage 的触发器，不参与布局 */
.mkt__hidden-input {
  display: none;
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

/* 管理视角分段（已装管理 / 我的上架 / 待审核）：胶囊样式走全局 .db-seg */
.mkt__scopes {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 20px 10px;
}

/* 待审核冒泡徽章（未读消息式）：钉在 tab 文字右上角，红底白字，有任务才渲染 */
.mkt__bubble {
  position: absolute;
  top: -5px;
  right: -7px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  text-align: center;
  color: #fff;
  background: var(--el-color-danger, #f56c6c);
  box-shadow: 0 0 0 2px var(--el-bg-color, #fff);
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

/* 组标题右侧灰色小计数（平铺分组的类型总数，信息量展示不报警） */
.mkt__group-count {
  margin-left: 4px;
  padding: 0 6px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 400;
  line-height: 16px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color, #f0f2f5);
  vertical-align: 1px;
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

  &__self-pending {
    font-size: 12px;
    line-height: 1.6;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-light, #f5f7fa);
    padding: 2px 10px;
    border-radius: 999px;
  }
}
</style>