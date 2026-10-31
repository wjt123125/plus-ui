<!--
  物料管理 tab 面板（工作区中栏 kind market-manage，全局单例；设计正本 §二/§3.2）。
  2026-10-30 由 MarketPane 内部的 view/scope 双 ref 提为独立 tab：管理页刷新后仍在，
  不必再「进市场 → 点管理 → 切视角」重走一遍。视角落在 tab.marketScope 上随会话持久化。
  三个视角（视角是本 pane 唯一一层 tab）：
    · 已装管理（消费）——类型平铺成「组件 → 链路 → 连接器」分组列表，空组整组隐藏；
      连接器组例外：有 list 权限即常驻，空态自带上传引导（§2.6）；
    · 我的上架（作者）——下架 / 删除，驳回理由与修改说明就地展示；
    · 待审核（治理，按权限串显隐）——数量红色冒泡（未读消息式，>99 显 99+）。
  连接器（万物皆包 §15.3）：已装治理走 defs 端点（不写 install 台账），def 行是模块级共享单例，
  与市场 tab 卡片的启停态同源；整行点开连接器包查看 tab。
  面板自身零 API：数据走 useMarketData，打开/卸载/启停/开 tab 一律上抛宿主（与本工作台「树不闭环」同范式）。
-->
<template>
  <section class="mkt">
    <div class="mkt__topbar">
      <button type="button" class="mkt__back" @click="emit('back-to-market')">
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

    <!-- 视角分段：待审核数量红色冒泡（有任务才显示）；搜索与视角同行 -->
    <div class="mkt__scopes">
      <div class="db-seg">
        <button type="button" class="db-seg__item" :class="{ 'is-active': scope === 'installed' }" @click="switchScope('installed')">
          已装管理
        </button>
        <button type="button" class="db-seg__item" :class="{ 'is-active': scope === 'mine' }" @click="switchScope('mine')">
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
            <!-- 整行可点＝打开本地副本（唯一入口）；ops 区只留治理动作，@click.stop 阻断冒泡到行 -->
            <li
              v-for="row in grp.items"
              :key="row.id"
              class="mkt-row"
              :class="{ 'is-clickable': canOpenInstalled(row) }"
              @click="canOpenInstalled(row) && onOpenInstalled(row)"
            >
              <SvgIcon
                class="mkt-row__icon"
                :icon-class="rowIcon(row)"
                :style="{ color: row.color || 'var(--el-color-primary)' }"
              />
              <div class="mkt-row__meta">
                <div class="mkt-row__name">{{ row.name }}</div>
                <div class="mkt-row__summary">{{ row.summary }}</div>
                <button v-if="row.ownerCode" type="button" class="mkt-row__author" @click.stop="onAuthor(row.ownerCode!, row.resourceType)">
                  @{{ row.ownerCode }}
                </button>
              </div>
              <div class="mkt-row__ops" @click.stop>
                <!-- 启停仅对组件有意义（链路生命周期由发布/下线管），故链路只留卸载 -->
                <el-switch
                  v-if="row.resourceType === 'COMPONENT'"
                  v-hasRoles="['databus_gov']"
                  :model-value="row.enabled !== false"
                  size="small"
                  @change="(v: string | number | boolean) => onToggle(row, Boolean(v))"
                />
                <el-button v-hasRoles="['databus_gov']" size="small" type="danger" plain @click="onUninstall(row)">
                  <SvgIcon icon-class="lucide:trash" /><span>卸载</span>
                </el-button>
              </div>
              <SvgIcon v-if="canOpenInstalled(row)" class="mkt-row__chevron" icon-class="lucide:chevron-right" />
            </li>
          </ul>
        </template>
        <!-- 连接器组：已装治理走 defs 端点（§15.3：不写 install 台账，enable 即安装），行模板与台账行不同故单列。
             本组不随「空组整组隐藏」消失（有 list 权限即常驻）：零内置之后一件连接器都没有是全新部署的常态
             （§2.6），整组藏起来用户只会以为货架是空的，看不到「该去上传包」这条出路 -->
        <template v-if="canConnectorList">
          <div class="mkt__group-title">
            连接器 <span class="mkt__group-count">{{ connectorRows.length }}</span>
          </div>
          <ul v-if="connectorRows.length" class="mkt__list">
            <!-- 整行可点＝打开连接器包查看 tab（清单＋反编译预览，唯一入口）；
                 「下载」「查看」按钮已从行上撤掉：看包只此一个入口，下载原包收进包查看 tab 头部；
                 ops 区只留治理动作 ⟨启停⟩[废弃][卸载]，@click.stop 阻断冒泡到行。
                 开发目录装载的行同样可点（进去看装载目录/装载时间 + 实现声明 + 运行时驱动），
                 但只给 [重新加载]，其余治理动作一律不出现 -->
            <li
              v-for="row in connectorRows"
              :key="row.type"
              class="mkt-row"
              :class="{ 'is-clickable': canInspectDef(row) }"
              @click="canInspectDef(row) && onInspectDefPackage(row)"
            >
              <SvgIcon class="mkt-row__icon" :icon-class="row.icon || 'lucide:plug'" :style="{ color: 'var(--el-color-primary)' }" />
              <div class="mkt-row__meta">
                <div class="mkt-row__line">
                  <span class="mkt-row__name">{{ row.label || row.type }}</span>
                  <el-tag size="small" :type="connectorHealthMeta(row).type" effect="light" :title="connectorHealthMeta(row).reason">
                    {{ connectorHealthMeta(row).label }}
                  </el-tag>
                  <el-tag
                    v-if="isDevDef(row)"
                    size="small"
                    type="warning"
                    effect="plain"
                    title="开发目录装载：跑的是本地编译输出，不是上传的包；改代码后点「重新加载」即可生效"
                  >
                    开发装载
                  </el-tag>
                </div>
                <!-- 来源只在副标题说一次：dev 行上一行已有「开发装载」标签（带 hover 解释），再拼一遍是重复信息 -->
                <div class="mkt-row__summary">
                  #{{ row.type }}{{ row.version ? ` · ${versionLabel(row.version)}` : ''
                  }}{{ isDevDef(row) ? '' : ` · ${connectorSourceLabel(row)}` }}
                </div>
                <button v-if="row.ownerCode" type="button" class="mkt-row__author" @click.stop="onAuthor(row.ownerCode!, 'CONNECTOR')">
                  @{{ row.ownerCode }}
                </button>
              </div>
              <div class="mkt-row__ops" @click.stop>
                <!-- 开发目录装载的行只给「重新加载」：它跑的是本地编译输出，运行期没有包可下载可看，
                     启停/废弃改了下次启动又被开发通道覆盖，卸载也删不到真正的来源（开发目录由配置决定），
                     所以这些按钮一律不出现；整行仍可点进查看页（看装载信息与实现声明，不是看 zip） -->
                <el-button
                  v-if="isDevDef(row)"
                  v-hasPermi="['databus:connector:edit']"
                  size="small"
                  :loading="devReloadingType === row.type"
                  @click="onReloadDevDef(row)"
                >
                  <SvgIcon icon-class="lucide:refresh-cw" /><span>重载</span>
                </el-button>
                <template v-else>
                  <!-- 零内置：全部连接器都有 def 行，启停/卸载一律走 defs 端点 -->
                  <!-- 启停/废弃/卸载一律治理专属：门控用权限串（与后端 @SaCheckPermission 同源，看得到即调得动） -->
                  <!-- DEPRECATED 是终态（不可逆）：不给开关也不给废弃，只留卸载 -->
                  <el-switch
                    v-if="row.status !== 'DEPRECATED'"
                    v-hasPermi="['databus:connector:edit']"
                    :model-value="row.status === 'ENABLED'"
                    size="small"
                    @change="(v: string | number | boolean) => onToggleDef(row, Boolean(v))"
                  />
                  <!-- 废弃只从可执行态进入（ENABLED / DISABLED）；INACTIVE 从未启用，直接卸载即可 -->
                  <el-button
                    v-if="row.status === 'ENABLED' || row.status === 'DISABLED'"
                    v-hasPermi="['databus:connector:edit']"
                    size="small"
                    type="warning"
                    plain
                    @click="onDeprecateDef(row)"
                  >
                    <SvgIcon icon-class="lucide:archive" /><span>废弃</span>
                  </el-button>
                  <el-button v-hasPermi="['databus:connector:remove']" size="small" type="danger" plain @click="onUninstallDef(row)">
                    <SvgIcon icon-class="lucide:trash" /><span>卸载</span>
                  </el-button>
                </template>
              </div>
              <SvgIcon v-if="canInspectDef(row)" class="mkt-row__chevron" icon-class="lucide:chevron-right" />
            </li>
          </ul>
          <!-- 空态给的是出路不是安慰（§2.6）：文案见 connectorEmptyText，
               上传按钮复用页头那个隐藏 input 的选包入口，只在真·一个包都没有时出现 -->
          <el-empty v-if="connectorEmptyText" :description="connectorEmptyText" :image-size="72">
            <el-button
              v-if="!connectorDefs.length"
              v-hasPermi="['databus:connector:upload']"
              type="primary"
              :loading="packageUploading"
              @click="pickPackage"
            >
              <SvgIcon icon-class="lucide:upload" /><span>上传连接器包</span>
            </el-button>
          </el-empty>
        </template>
        <el-empty v-if="installedEmpty" description="还没有安装任何物料" :image-size="72">
          <el-button @click="emit('back-to-market')">
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
            <!-- 整行可点＝打开物料详情 tab（唯一入口）；不渲染 @作者（恒为自己，纯噪声） -->
            <li v-for="row in grp.items" :key="row.id" class="mkt-row is-clickable" @click="emit('open-detail', row)">
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
                <div v-if="row.status === 'REJECTED' && row.remark" class="mkt-row__remark">驳回理由：{{ row.remark }}</div>
                <div v-if="row.modifyNote" class="mkt-row__remark">修改说明：{{ row.modifyNote }}</div>
              </div>
              <div class="mkt-row__ops" @click.stop>
                <el-button v-if="row.status === 'ONLINE'" size="small" @click="onUnpublish(row)">
                  <SvgIcon icon-class="lucide:arrow-down-to-line" /><span>下架</span>
                </el-button>
                <el-button size="small" type="danger" plain @click="onDeleteItem(row)">
                  <SvgIcon icon-class="lucide:trash" /><span>删除</span>
                </el-button>
              </div>
              <SvgIcon class="mkt-row__chevron" icon-class="lucide:chevron-right" />
            </li>
          </ul>
        </template>
        <el-empty v-if="!mineGroups.length" description="你还没有上架过物料" :image-size="72">
          <el-button v-hasPermi="['databus:market:publish']" type="primary" @click="openPublish">
            <SvgIcon icon-class="lucide:plus" /><span>上架第一个</span>
          </el-button>
        </el-empty>
      </template>

      <!-- 视角三：待审核（治理队列）。类型平铺，空组隐藏；审核动作一律进审核 tab 就地完成 -->
      <template v-else>
        <template v-for="grp in pendingGroups" :key="grp.type">
          <div class="mkt__group-title">
            {{ grp.label }} <span class="mkt__group-count">{{ grp.items.length }}</span>
          </div>
          <ul class="mkt__list">
            <!-- 整行可点＝开物料审核 tab（信息头＋内容预览＋依赖树＋底部通过/驳回，唯一入口；
                 行内不再放「详情」按钮，也不放通过/驳回：B 口径要求通过前看依赖树，审核动作一律进 tab 就地完成）。
                 禁自审：自己上架的项整行不可点（不只是禁用按钮）——口径「前端看不到的，一定不能操作」，
                 作者要回看自己的件走「我的上架」视角（decisions §七-7.1）；但其 @作者仍可点（导航非审核动作） -->
            <li
              v-for="row in grp.items"
              :key="row.id"
              class="mkt-row"
              :class="{ 'is-clickable': !isSelfPending(row) }"
              @click="!isSelfPending(row) && emit('open-review', row.id, row.name)"
            >
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
                <button v-if="row.ownerCode" type="button" class="mkt-row__author" @click.stop="onAuthor(row.ownerCode!, row.resourceType)">
                  @{{ row.ownerCode }}
                </button>
              </div>
              <div v-if="isSelfPending(row)" class="mkt-row__ops">
                <span class="mkt-row__self-pending">自己上架 · 待审核（禁自审）</span>
              </div>
              <SvgIcon v-if="!isSelfPending(row)" class="mkt-row__chevron" icon-class="lucide:chevron-right" />
            </li>
          </ul>
        </template>
        <el-empty v-if="!pendingGroups.length" description="暂无待审核物料" :image-size="72" />
      </template>
    </div>

    <!-- 连接器包上传通道（页头按钮与连接器组空态共用；同 type 升版本＝热更新） -->
    <input ref="packageInputRef" type="file" accept=".zip" class="mkt__hidden-input" @change="onPackageChange" />

    <MarketPublishDialog
      v-model:visible="publishVisible"
      :categories="categories"
      :loading="publishLoading"
      @confirm="onPublishConfirm"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue';
import { ElCheckbox, ElMessage, ElMessageBox } from 'element-plus';
import modal from '@/plugins/modal';
import { useUserStore } from '@/store/modules/user';
import type { DatabusMarketInstallVo, DatabusMarketItemVo, MarketPublishForm, MarketResourceType } from '@/api/databus/market/types';
import type { ConnectorDefVo } from '@/api/databus/connector/types';
import {
  deprecateConnector,
  disableConnector,
  enableConnector,
  reloadDevConnector,
  uninstallConnector,
  uploadConnectorPackage
} from '@/api/databus/connector';
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';
import type { MarketScope } from '../workbench.types';
import { useMarketData, marketNavIntent } from './useMarketData';
import {
  TYPE_LABELS,
  TYPE_ORDER,
  connectorDefs,
  connectorHealthMeta,
  connectorSourceLabel,
  isDevDef,
  itemIcon,
  loadConnectorDefs,
  rowIcon,
  statusMeta,
  versionLabel
} from './marketDisplay';
import MarketPublishDialog from './MarketPublishDialog.vue';

defineOptions({ name: 'MarketManagePane' });

useLucideSubset();

const props = defineProps<{
  /** 当前视角（＝tab.marketScope，随会话落盘）：刷新后从这里恢复现场 */
  scope?: MarketScope;
  /** 刷新令牌：审核 tab 审完 / 任一市场动作落地后宿主自增，本 pane 据此重取当前视角 */
  refreshToken?: number;
}>();

const emit = defineEmits<{
  /** 打开本地资源：宿主按类型开画布 / 详情 tab */
  (e: 'open-local', localResourceId: string | number, resourceType: 'COMPONENT' | 'CHAIN', title: string): void;
  /** 安装 / 卸载成功：宿主刷树与台账 */
  (e: 'installed'): void;
  /** 启停本地组件副本：宿主调组件接口（组件行在台账，面板无 DB 行） */
  (e: 'toggle-local', localResourceId: string | number, enabled: boolean): void;
  /** 我的上架行点击：打开物料详情 tab（kind market-detail） */
  (e: 'open-detail', item: DatabusMarketItemVo): void;
  /** 待审核行点击：打开物料审核 tab（kind market-review，宿主 openMarketReview，同 id 单例） */
  (e: 'open-review', itemId: string | number, title: string): void;
  /** 连接器行点击：打开连接器包查看 tab（kind connector-package，同 type+version 单例） */
  (e: 'open-connector-package', type: string, version: string, source?: string): void;
  /** 视角切换：宿主回写 tab.marketScope（刷新后仍是这个视角） */
  (e: 'scope-change', scope: MarketScope): void;
  /** 返回市场＝聚焦已开的市场 tab，本 tab 不关（两 tab 并存） */
  (e: 'back-to-market'): void;
}>();

const market = useMarketData();
const { categories, installed, mine, pending, loading } = market;

/** 当前视角；初值取 tab 上落盘的 scope，宿主改 tab.marketScope 时经 watch 跟上 */
const scope = ref<MarketScope>(props.scope ?? 'installed');
/** 管理页搜索（客户端过滤当前视角列表） */
const manageKeyword = ref('');

/* ---------------- 权限判定（一律按权限串，admin 通配免检） ---------------- */
const userStore = useUserStore();
function hasPermi(perm: string): boolean {
  return userStore.permissions.some((p: string) => p === '*:*:*' || p === perm);
}
const canPublish = computed(() => hasPermi('databus:market:publish'));
/* 连接器运行层权限（§15.7）：list 驱动 defs 分组显隐（启停/卸载/上传按钮走 v-hasPermi 指令） */
const canConnectorList = computed(() => hasPermi('databus:connector:list'));
/** 当前用户 id（禁自审判定：待审核列表全量展示，自己上架的项整行不可点，decisions §七-7.1） */
const currentUserId = computed(() => userStore.userId);

/* ---------------- 弹窗状态 ---------------- */
const publishVisible = ref(false);
const publishLoading = ref(false);

/* ---------------- 数据装载 ---------------- */

/** 按视角取数（不清搜索：令牌刷新与初次装载都走这里） */
async function loadScope(target: MarketScope): Promise<void> {
  if (target === 'installed') {
    await Promise.all([market.loadInstalled(), loadConnectorDefs()]);
  } else if (target === 'mine') {
    await market.loadMine();
  } else {
    await market.loadPending();
  }
}

/** 切视角：清空搜索、回写 tab 字段（宿主落盘）并按需取数 */
async function switchScope(next: MarketScope): Promise<void> {
  scope.value = next;
  manageKeyword.value = '';
  emit('scope-change', next);
  await loadScope(next);
}

/* 宿主改了 tab.marketScope（市场卡片「已上架」/ 空态「去上架」带着视角聚焦过来）→ 跟上 */
watch(
  () => props.scope,
  (next) => {
    if (next && next !== scope.value) {
      void switchScope(next);
    }
  }
);

/* 刷新令牌：审核 tab 审完、或另一头（市场 tab / 资源树）动了安装台账，重取当前视角 */
watch(
  () => props.refreshToken,
  (token) => {
    if (token) {
      void loadScope(scope.value);
    }
  }
);

/* 市场 tab 空态「去上架」跨 tab 递来的意图：落到本 pane 就开上架弹窗。
   只认领 publish，别的意图（owner）归市场 tab 消费——两边都清会让后到的一方扑空 */
watch(
  marketNavIntent,
  (intent) => {
    if (intent?.kind !== 'publish') {
      return;
    }
    marketNavIntent.value = null;
    if (scope.value !== 'mine') {
      void switchScope('mine');
    }
    publishVisible.value = true;
  },
  { immediate: true }
);

onMounted(async () => {
  await market.loadCategories();
  await loadScope(scope.value);
});

/* ---------------- 展示辅助 ---------------- */

/** 页头标题/副标题随视角切换 */
const manageTitle = computed(() => ({ installed: '已装管理', mine: '我的上架', pending: '待审核' })[scope.value]);
const manageSub = computed(
  () =>
    ({
      installed: '管理你已安装的组件、链路与连接器。',
      mine: '你上架的物料与审核状态；可下架或删除。',
      pending: '治理队列：通过即上线，驳回需填写理由。'
    })[scope.value]
);

/** 待审核总数（红色冒泡：有任务才显示，>99 显 99+；处理完自动归零消失） */
const pendingTotal = computed(() => pending.value.length);

/** 关键字过滤（名称 / 简介 / 展示码） */
function filterByKeyword(list: DatabusMarketItemVo[], kw: string): DatabusMarketItemVo[] {
  const k = kw.trim().toLowerCase();
  return !k ? list : list.filter((r) => [r.name, r.summary, r.codeDisplay].some((s) => (s ?? '').toLowerCase().includes(k)));
}

/** 我的上架 / 待审核通用分组：整表按关键字过滤后按类型拆组，空组丢弃（不渲染标题） */
function buildTypeGroups(list: DatabusMarketItemVo[]) {
  const filtered = filterByKeyword(list, manageKeyword.value);
  return TYPE_ORDER.map((type) => ({ type, label: TYPE_LABELS[type], items: filtered.filter((r) => r.resourceType === type) })).filter(
    (g) => g.items.length > 0
  );
}

const mineGroups = computed(() => buildTypeGroups(mine.value));
const pendingGroups = computed(() => buildTypeGroups(pending.value));

/** 连接器治理行：defs 合并视图 + 关键字过滤（label / type） */
const connectorRows = computed(() => {
  const kw = manageKeyword.value.trim().toLowerCase();
  return connectorDefs.value.filter((d) => (!kw ? true : [d.label, d.type].some((s) => (s ?? '').toLowerCase().includes(kw))));
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

/** 连接器组空态文案：区分「本机一个包都没有」（§2.6 原文，配上传引导）与「有包但被关键字筛掉」。
 *  两者都写「尚未安装」会把人引去重复上传同一个包；有行时返回空串（不渲染空态）。 */
const connectorEmptyText = computed(() => {
  if (connectorRows.value.length) {
    return '';
  }
  return connectorDefs.value.length ? '没有匹配的连接器' : '尚未安装任何连接器，请先上传连接器包';
});

/** 已装管理是否整页空：只看台账组（组件/链路）。
 *  连接器组现在常驻且自带空态与上传引导，再叠一块整页「还没有安装任何物料」就是两块互相打架的提示；
 *  无 connector:list 权限时该组整组不渲染（connectorRows 恒空），也无需把它算进来。 */
const installedEmpty = computed(() => !installedGroups.value.length && !canConnectorList.value);

/* ---------------- 行交互：整行可点＝唯一入口，ops 区只留治理动作 ---------------- */

/** 已装台账行是否可点：缺本地副本 id / 类型不明就打不开，整行不可点（无 hover、无 chevron） */
function canOpenInstalled(row: DatabusMarketInstallVo): boolean {
  return row.localResourceId != null && (row.resourceType === 'COMPONENT' || row.resourceType === 'CHAIN');
}

/** 已装台账行整行点击＝打开本地副本（宿主按类型开画布 / 组件详情 tab） */
function onOpenInstalled(row: DatabusMarketInstallVo) {
  if (!canOpenInstalled(row)) {
    return;
  }
  emit('open-local', row.localResourceId!, row.resourceType as 'COMPONENT' | 'CHAIN', row.name ?? '');
}

/** 待审核行是否禁自审：自己上架的项整行不可点（连审核入口都不给，decisions §七-7.1） */
function isSelfPending(row: DatabusMarketItemVo): boolean {
  return row.ownerId === currentUserId.value;
}

/**
 * 行上 @作者：跨 tab 导航——意图写进模块级单例后请宿主聚焦市场 tab，
 * 由市场 pane 按作者 + 该行所属类型筛选（串 switchType 再 filterByOwner 会被 switchType 清掉 ownerCode，
 * 故意图带上 resourceType，市场 pane 一次 set 一次 refresh）。
 */
function onAuthor(code: string, type?: string) {
  const resourceType: MarketResourceType = type === 'CHAIN' || type === 'CONNECTOR' ? type : 'COMPONENT';
  marketNavIntent.value = { kind: 'owner', ownerCode: code, resourceType };
  emit('back-to-market');
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
        : `确认卸载「${row.name}」？将删除你的本地副本；若该副本仍被你的其他链路引用，会被拒绝删除，请先移除引用。`
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

/* ---------------- 连接器 def 治理（已装视角） ---------------- */

/** def 行启停开关：enable/disable 全局生效；失败重拉 defs 回滚开关 UI。
 *  启用＝审核（§1.3）：提交人 ≠ 审批人由后端 enforce，此处收集 verified 勾选。 */
async function onToggleDef(row: ConnectorDefVo, enabled: boolean) {
  try {
    if (enabled) {
      const verified = ref(false);
      try {
        await ElMessageBox.confirm(
          h('div', { style: 'text-align:left;line-height:1.6;' }, [
            h(
              'p',
              { style: 'margin:0 0 8px;color:var(--el-text-color-secondary);font-size:12px;font-family:monospace;' },
              `#${row.type}${row.version ? ` · ${versionLabel(row.version)}` : ''}`
            ),
            h(
              ElCheckbox,
              {
                'onUpdate:modelValue': (v: unknown) => {
                  verified.value = Boolean(v);
                }
              },
              () => '我确认已审核该连接器代码，信任其安全'
            )
          ]),
          `审核启用「${row.label || row.type}」`,
          { confirmButtonText: '启用', cancelButtonText: '取消', type: 'warning' }
        );
      } catch {
        return; // 用户取消
      }
      if (!verified.value) {
        ElMessage.warning('请先勾选「已审核代码」后启用');
        return;
      }
      await enableConnector(row.type, verified.value);
      ElMessage.success(`已启用「${row.label || row.type}」，全局生效`);
    } else {
      await disableConnector(row.type);
      ElMessage.success(`已停用「${row.label || row.type}」`);
    }
    await afterConnectorGoverned();
  } catch {
    /* 拦截器已提示；重拉恢复开关 */
    await loadConnectorDefs();
  }
}

/** def 行废弃：DEPRECATED 终态不可逆（停机退役，包与 def 行保留，之后只能卸载），故二次确认写清后果 */
async function onDeprecateDef(row: ConnectorDefVo) {
  try {
    await modal.confirm(
      `确认废弃连接器「${row.label || row.type}」？废弃后立即停机（存量连接失效），且为终态不可逆：不能再启用，也不能升版本热更新，只能卸载。`
    );
  } catch {
    return;
  }
  try {
    await deprecateConnector(row.type);
    ElMessage.success(`已废弃「${row.label || row.type}」`);
    await afterConnectorGoverned();
  } catch {
    /* 拦截器已提示 */
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
    await afterConnectorGoverned();
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
    await afterConnectorGoverned();
  } catch {
    /* 拦截器已提示 */
  }
}

/**
 * 连接器治理动作落地后：重拉 defs（本 pane 行状态 + 市场 tab 卡片启停态同源），
 * 并上抛宿主——市场 pane 的卡片「安装/已启用」标记来自市场列表接口，得靠宿主发刷新令牌才跟着变。
 */
async function afterConnectorGoverned(): Promise<void> {
  await loadConnectorDefs();
  emit('installed');
}

/* ---------------- 开发目录装载的行：唯一的动作是「重新加载」 ---------------- */

/** 正在重新加载的连接器 type（逐行 loading，避免多行同时转圈） */
const devReloadingType = ref<string | null>(null);

/**
 * 重新加载开发目录装载的连接器：改完代码 mvn compile 后点一下即可生效，不必重启后端。
 * 后端接口只在开发环境存在，返回本次实际装载到的 type 列表。
 */
async function onReloadDevDef(row: ConnectorDefVo) {
  devReloadingType.value = row.type;
  try {
    const { data } = await reloadDevConnector(row.type);
    const loaded = data ?? [];
    if (loaded.length) {
      ElMessage.success(`已重新装载「${row.label || row.type}」`);
    } else {
      ElMessage.warning('没有装载到任何连接器：检查开发目录配置，以及代码是否已编译');
    }
    await loadConnectorDefs();
  } catch {
    /* 拦截器已提示 */
  } finally {
    devReloadingType.value = null;
  }
}

/* ---------------- 连接器「看得见」：整行点开包查看 tab（清单+反编译预览，§2.3） ---------------- */

/** 连接器行是否可点：缺版本号定位不到任何视图（正式包靠它定位 zip，dev 行靠它拼 tab 身份）。
 *  正式包与 dev 目录装载都可点：正式包看 zip 清单，dev 看目录装载信息 + 实现声明 + 运行时驱动 */
function canInspectDef(row: ConnectorDefVo): boolean {
  return !!row.version;
}

/** 整行点击＝上抛宿主开连接器包查看 tab（kind connector-package，取数与展示都在 pane 内）；
 *  下载原包不在列表行上，收在包查看 tab 头部；source 一并上抛，dev 行据此切到目录装载视图 */
function onInspectDefPackage(row: ConnectorDefVo) {
  if (!row.version) {
    ElMessage.warning('该连接器缺版本号，无法打开查看页');
    return;
  }
  emit('open-connector-package', row.type, row.version, row.source);
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
    await afterConnectorGoverned();
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

/** 打开上架弹窗（页头按钮与「我的上架」空态 CTA 共用入口） */
function openPublish() {
  publishVisible.value = true;
}

async function onPublishConfirm(form: MarketPublishForm) {
  publishLoading.value = true;
  try {
    await market.publish(form);
    ElMessage.success('已提交，等待治理审核');
    publishVisible.value = false;
    if (scope.value !== 'mine') {
      await switchScope('mine');
    }
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
/* 面板外壳 / 页头 / 限宽居中 / 滚动体 / 组标题走全局 _databus-market.scss（与市场 tab 同源）；
   此处只留管理页独有的：返回条、视角分段行、待审核冒泡、组计数、行列表 */

/* 连接器包上传通道：仅作 pickPackage 的触发器，不参与布局 */
.mkt__hidden-input {
  display: none;
}

/* 顶部返回条：不参与限宽居中，返回按钮贴面板左上角（对标 Trae 插件市场） */
.mkt__topbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 14px 20px 2px;
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

/* 视角分段（已装管理 / 我的上架 / 待审核）：胶囊样式走全局 .db-seg */
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

/* 行列表：整体包一层圆角描边容器（借鉴 Trae 插件市场的边框样式） */
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

  /* 整行可点（唯一入口）：hover 背景 + 手型。不可点行不挂此修饰类，保持默认光标、无 hover、无 chevron */
  &.is-clickable {
    cursor: pointer;

    &:hover {
      background-color: var(--el-fill-color-light);
    }
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

  /* 行上 @作者（可点 → 聚焦市场 tab 按作者筛选）：弱化处理，不抢行主体视觉 */
  &__author {
    margin-top: 3px;
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
  }

  /* 行尾可点暗示（仅可点行渲染） */
  &__chevron {
    flex-shrink: 0;
    font-size: 16px;
    color: var(--el-text-color-placeholder);
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
