<!--
  物料管理 tab 面板（工作区中栏 kind market-manage，全局单例；设计正本 §二/§3.2）。
  2026-10-30 由 MarketPane 内部的 view/scope 双 ref 提为独立 tab：管理页刷新后仍在，
  不必再「进市场 → 点管理 → 切视角」重走一遍。视角落在 tab.marketScope 上随会话持久化。
  四个视角（视角是本 pane 唯一一层 tab）：
    · 已装管理（消费）——类型平铺成「组件 → 链路 → 连接器」分组列表，空组整组隐藏。
      三条都只认安装台账：没有自己的安装记录就不会出现在这里，不分角色；
    · 我的上架（作者）——下架 / 删除，驳回理由与修改说明就地展示；
    · 待审核（审核，按权限串显隐）——数量红色冒泡（未读消息式，>99 显 99+）。只管审核；
    · 治理（运行态，按治理员角色显隐）——当前是连接器：启停 / 废弃 / 卸载 / dev 重载，
      数据是全部 def 行，和「装没装过」无关。审核与治理视角分开，两套职责。
  整行点开连接器包查看 tab（清单＋反编译预览）。
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
      <!-- 页头主按钮跟着视角走：分类视角的主操作是新增分类，不是上架物料 -->
      <el-button
        v-if="scope === 'category' && canGovern"
        type="primary"
        @click="categoryPaneRef?.openCreate()"
      >
        <SvgIcon icon-class="lucide:plus" /><span>新增分类</span>
      </el-button>
      <el-button v-else v-hasPermi="['databus:market:publish']" type="primary" @click="emit('open-publish')">
        <SvgIcon icon-class="lucide:plus" /><span>上架物料</span>
      </el-button>
    </header>

    <!-- 视角分段：待审核数量红色冒泡（有任务才显示）；搜索与视角同行 -->
    <div class="mkt__scopes">
      <DbSeg :options="scopeOptions" :model-value="scope" @change="onScopeChange">
        <template #item="{ option }">
          {{ option.label }}
          <span v-if="option.badge" class="mkt__bubble">
            {{ Number(option.badge) > 99 ? '99+' : option.badge }}
          </span>
        </template>
      </DbSeg>
      <el-input v-if="scope !== 'category'" v-model="manageKeyword" class="mkt__search" placeholder="搜索物料" clearable size="small">
        <template #prefix><SvgIcon icon-class="lucide:search" /></template>
      </el-input>
    </div>

    <div v-loading="loading" class="mkt__body">
      <!-- 视角一：已装管理（消费侧）。类型平铺：组件 → 链路 → 连接器，三类都读 install 台账
           （连接器安装也只写个人安装记录）；空组整组隐藏，全空才出 empty -->
      <template v-if="scope === 'installed'">
        <template v-for="grp in installedGroups" :key="grp.type">
          <MarketGroupHeader
            :label="grp.label"
            :count="grp.items.length"
            :collapsed="isGroupCollapsed(grp.type)"
            @toggle="toggleGroup(grp.type)"
          />
          <ul v-if="!isGroupCollapsed(grp.type)" class="db-list db-list--framed">
            <!-- 整行可点＝组件/链路开本地副本、连接器开市场物料详情（唯一入口）；ops 区只留治理动作，@click.stop 阻断冒泡到行 -->
            <li
              v-for="row in grp.items"
              :key="row.id"
              class="db-row"
              :class="{ 'is-clickable db-float': canOpenInstalled(row) }"
              @click="canOpenInstalled(row) && onOpenInstalled(row)"
            >
              <SvgIcon
                class="db-row__icon"
                :class="{
                  'db-brand-icon': isBrandIconName(rowIcon(row)),
                  'db-row__icon--lg': row.resourceType === 'CONNECTOR'
                }"
                :icon-class="rowIcon(row)"
                :style="{ color: row.color || 'var(--el-color-primary)' }"
              />
              <div class="db-row__meta">
                <div class="db-row__line">
                  <StatusDot
                    :tone="installRowStatus(row).tone"
                    :label="installRowStatus(row).label"
                    :title="installRowStatus(row).reason"
                  />
                  <span class="db-row__name">{{ row.name }}</span>
                </div>
                <div class="db-row__summary">
                  <template v-if="row.resourceType === 'CONNECTOR' && installedConnectorCode(row)">
                    {{ installedConnectorCode(row) }}
                  </template>
                  <template v-else>{{ row.summary || row.codeDisplay }}</template>
                  <button v-if="row.ownerCode" type="button" class="db-row__author" @click.stop="onAuthor(row.ownerCode!, row.resourceType)">
                    @{{ row.ownerCode }}
                  </button>
                </div>
              </div>
              <div class="db-row__ops" @click.stop>
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
              <SvgIcon v-if="canOpenInstalled(row)" class="db-row__chevron" icon-class="lucide:chevron-right" />
            </li>
          </ul>
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
          <MarketGroupHeader
            :label="grp.label"
            :count="grp.items.length"
            :collapsed="isGroupCollapsed(grp.type)"
            @toggle="toggleGroup(grp.type)"
          />
          <ul v-if="!isGroupCollapsed(grp.type)" class="db-list db-list--framed">
            <!-- 整行可点＝打开物料详情 tab（唯一入口）；不渲染 @作者（恒为自己，纯噪声） -->
            <li
              v-for="row in grp.items"
              :key="row.id"
              class="db-row is-clickable db-float"
              :data-market-item-id="row.id"
              :class="{ 'is-flash': flashItemId === String(row.id) }"
              @click="emit('open-detail', row.id, row.name)"
            >
              <SvgIcon
                class="db-row__icon"
                :class="{
                  'db-brand-icon': isBrandIconName(itemIcon(row)),
                  'db-row__icon--lg': row.resourceType === 'CONNECTOR'
                }"
                :icon-class="itemIcon(row)"
                :style="{ color: row.color || 'var(--el-color-primary)' }"
              />
              <div class="db-row__meta">
                <div class="db-row__line">
                  <StatusDot :tone="marketItemRowStatus(row.status).tone" :label="marketItemRowStatus(row.status).label" :title="marketItemRowStatus(row.status).reason" />
                  <span class="db-row__name">{{ row.name }}</span>
                </div>
                <div class="db-row__summary">{{ row.summary || row.codeDisplay }}</div>
                <div v-if="row.status === 'REJECTED' && row.remark" class="db-row__remark">驳回理由：{{ row.remark }}</div>
                <div v-if="row.modifyNote" class="db-row__remark">修改说明：{{ row.modifyNote }}</div>
              </div>
              <div class="db-row__ops" @click.stop>
                <el-button v-if="row.status === 'ONLINE'" size="small" @click="onUnpublish(row)">
                  <SvgIcon icon-class="lucide:arrow-down-to-line" /><span>下架</span>
                </el-button>
                <el-button size="small" type="danger" plain @click="onDeleteItem(row)">
                  <SvgIcon icon-class="lucide:trash" /><span>删除</span>
                </el-button>
              </div>
              <SvgIcon class="db-row__chevron" icon-class="lucide:chevron-right" />
            </li>
          </ul>
        </template>
        <el-empty v-if="!mineGroups.length" description="你还没有上架过物料" :image-size="72">
        </el-empty>
      </template>

      <!-- 视角三：待审核（审核队列）。类型平铺，空组隐藏；审核动作一律进审核 tab 就地完成 -->
      <template v-else-if="scope === 'pending'">
        <template v-for="grp in pendingGroups" :key="grp.type">
          <MarketGroupHeader
            :label="grp.label"
            :count="grp.items.length"
            :collapsed="isGroupCollapsed(grp.type)"
            @toggle="toggleGroup(grp.type)"
          />
          <ul v-if="!isGroupCollapsed(grp.type)" class="db-list db-list--framed">
            <!-- 整行可点＝开物料审核 tab（信息头＋内容预览＋依赖树＋底部通过/驳回，唯一入口；
                 行内不再放「详情」按钮，也不放通过/驳回：B 口径要求通过前看依赖树，审核动作一律进 tab 就地完成）。
                 禁自审：自己上架的项整行不可点（不只是禁用按钮）——口径「前端看不到的，一定不能操作」，
                 作者要回看自己的件走「我的上架」视角（decisions §七-7.1）；但其 @作者仍可点（导航非审核动作） -->
            <li
              v-for="row in grp.items"
              :key="row.id"
              class="db-row"
              :class="{ 'is-clickable db-float': !isSelfPending(row) }"
              @click="!isSelfPending(row) && emit('open-review', row.id, row.name)"
            >
              <SvgIcon
                class="db-row__icon"
                :class="{
                  'db-brand-icon': isBrandIconName(itemIcon(row)),
                  'db-row__icon--lg': row.resourceType === 'CONNECTOR'
                }"
                :icon-class="itemIcon(row)"
                :style="{ color: row.color || 'var(--el-color-primary)' }"
              />
              <div class="db-row__meta">
                <div class="db-row__name">{{ row.name }}</div>
                <!-- 简介为空不回退编码：下一行固定显示 codeDisplay，回退会重复显示（闭包联审连带单据无简介） -->
                <div v-if="row.summary" class="db-row__summary">{{ row.summary }}</div>
                <div class="db-row__code">
                  {{ row.codeDisplay }}
                  <!-- 作者跟在编码同一行：待审核行没有 DEV 概念，单独占行会让行高比其它 tab 高 -->
                  <button v-if="row.ownerCode" type="button" class="db-row__author" @click.stop="onAuthor(row.ownerCode!, row.resourceType)">
                    @{{ row.ownerCode }}
                  </button>
                </div>
              </div>
              <div v-if="isSelfPending(row)" class="db-row__ops">
                <span class="db-row__self-pending">禁自审</span>
              </div>
              <SvgIcon v-if="!isSelfPending(row)" class="db-row__chevron" icon-class="lucide:chevron-right" />
            </li>
          </ul>
        </template>
        <el-empty v-if="!pendingGroups.length" description="暂无待审核物料" :image-size="72" />
      </template>

      <!-- 视角五：物料分类（治理动作：增 / 改名 / 排序 / 删除空分类 / 合并） -->
      <template v-else-if="scope === 'category' && canGovern">
        <MarketCategoryPane ref="categoryPaneRef" @changed="emit('installed')" />
      </template>

      <!-- 视角四：治理（全局运行态，与审核分开）。当前只有连接器：启停 / 废弃 / 卸载 / dev 重载。
           数据是全部 def 行，不受「是否安装过」影响——治理看的是这台机器装了哪些包。
           v-else-if 再兜一层：权限被收回但 tab 还记着 governance 时不渲染治理内容 -->
      <template v-else-if="canGovern">
        <template v-if="canConnectorList">
          <MarketGroupHeader
            label="连接器"
            :count="connectorRows.length"
            :collapsed="isGroupCollapsed('CONNECTOR')"
            @toggle="toggleGroup('CONNECTOR')"
          />
          <ul v-if="connectorRows.length && !isGroupCollapsed('CONNECTOR')" class="db-list db-list--framed">
            <!-- 整行可点＝打开连接器包查看 tab（清单＋反编译预览，唯一入口）；
                 ops 区只留治理动作 ⟨启停⟩[废弃][卸载]，@click.stop 阻断冒泡到行 -->
            <li
              v-for="row in connectorRows"
              :key="row.type"
              class="db-row"
              :class="{ 'is-clickable db-float': canInspectDef(row) }"
              @click="canInspectDef(row) && onInspectDefPackage(row)"
            >
              <SvgIcon
                class="db-row__icon db-row__icon--lg"
                :icon-class="row.icon || 'lucide:plug'"
                :style="{ color: 'var(--el-color-primary)' }"
              />
              <div class="db-row__meta">
                <div class="db-row__line">
                  <StatusDot
                    :tone="connectorRowStatus(row).tone"
                    :label="connectorRowStatus(row).label"
                    :title="connectorRowStatus(row).reason"
                    :dev="isDevDef(row)"
                  />
                  <span class="db-row__name">{{ row.label || row.type }}</span>
                </div>
                <!-- 来源只在副标题说一次：dev 行的来源由行内 DEV 角标表达（带 hover 解释），再拼一遍是重复信息。
                     作者跟在副标题同一行：DEV 行没有作者，单独一行会导致有/无作者的行高不一致 -->
                <div class="db-row__summary">
                  #{{ row.type }}{{ row.version ? ` · ${versionLabel(row.version)} · b${row.buildNo ?? 0}` : ''
                  }}{{ isDevDef(row) ? '' : ` · ${connectorSourceLabel(row)}` }}
                  <button v-if="row.ownerCode" type="button" class="db-row__author" @click.stop="onAuthor(row.ownerCode!, 'CONNECTOR')">
                    @{{ row.ownerCode }}
                  </button>
                </div>
              </div>
              <div class="db-row__ops" @click.stop>
                <!-- 治理动作全部收纳进「更多」菜单：行上只留状态与名称，避免一排放四个按钮 -->
                <el-dropdown
                  trigger="click"
                  placement="bottom-end"
                  popper-class="db-menu-popper"
                  @command="(cmd: string) => onGovernCommand(row, cmd)"
                >
                  <el-button
                    size="small"
                    text
                    class="db-row__more"
                    :loading="isDevDef(row) && devReloadingType === row.type"
                    aria-label="更多治理动作"
                  >
                    <!-- 实心竖排三点：直接内联 SVG，不吃图标字体/子集 -->
                    <svg class="db-row__dots" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                      <circle cx="12" cy="5" r="2.4" fill="currentColor" />
                      <circle cx="12" cy="12" r="2.4" fill="currentColor" />
                      <circle cx="12" cy="19" r="2.4" fill="currentColor" />
                    </svg>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <!-- 开发目录装载的行跑的是本地编译输出，治理动只剩重载与卸载 -->
                      <el-dropdown-item
                        v-if="isDevDef(row) && hasPermi('databus:connector:edit')"
                        class="db-menu-item is-primary"
                        command="reload"
                      >
                        <SvgIcon icon-class="lucide:refresh-cw" /><span>重载</span>
                      </el-dropdown-item>
                      <template v-else>
                        <el-dropdown-item
                          v-if="row.status === 'ENABLED' && hasPermi('databus:connector:edit')"
                          class="db-menu-item is-warning"
                          command="disable"
                        >
                          <SvgIcon icon-class="lucide:pause" /><span>停用</span>
                        </el-dropdown-item>
                        <el-dropdown-item
                          v-if="row.status === 'DISABLED' && hasPermi('databus:connector:edit')"
                          class="db-menu-item is-success"
                          command="enable"
                        >
                          <SvgIcon icon-class="lucide:play" /><span>启用</span>
                        </el-dropdown-item>
                        <!-- 废弃是终态（不可逆）：只从可执行态进入，PENDING 已不在治理列表 -->
                        <el-dropdown-item
                          v-if="(row.status === 'ENABLED' || row.status === 'DISABLED') && hasPermi('databus:connector:edit')"
                          class="db-menu-item is-warning"
                          command="deprecate"
                        >
                          <SvgIcon icon-class="lucide:archive" /><span>废弃</span>
                        </el-dropdown-item>
                      </template>
                      <el-dropdown-item
                        v-if="hasPermi('databus:connector:remove')"
                        class="db-menu-item is-danger"
                        command="uninstall"
                        :divided="!isDevDef(row)"
                      >
                        <SvgIcon icon-class="lucide:trash" /><span>卸载</span>
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
              <SvgIcon v-if="canInspectDef(row)" class="db-row__chevron" icon-class="lucide:chevron-right" />
            </li>
          </ul>
          <el-empty v-if="connectorEmptyText" :description="connectorEmptyText" :image-size="72">
          </el-empty>
        </template>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, h, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { ElCheckbox, ElMessage, ElMessageBox } from 'element-plus';
import modal from '@/plugins/modal';
import { useUserStore } from '@/store/modules/user';
import { checkRole } from '@/utils/permission';
import type { DatabusMarketInstallVo, DatabusMarketItemVo, MarketResourceType } from '@/api/databus/market/types';
import type { ConnectorDefVo } from '@/api/databus/connector/types';
import {
  deprecateConnector,
  disableConnector,
  enableConnector,
  reloadDevConnector,
  uninstallConnector
} from '@/api/databus/connector';
import { listConnection } from '@/api/databus/connection';
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';
import { isBrandIconName } from '@/views/databus/workbench/composables/useBrandIcons';
import StatusDot from '../components/StatusDot.vue';
import DbSeg, { type DbSegOption } from '@/views/databus/workspace/components/DbSeg.vue';
import MarketGroupHeader from './MarketGroupHeader.vue';
import MarketCategoryPane from './MarketCategoryPane.vue';
import type { MarketScope } from '../workbench.types';
import { useMarketData, marketNavIntent } from './useMarketData';
import {
  connectorDefs,
  connectorRowStatus,
  connectorSourceLabel,
  groupByType,
  installRowStatus,
  isDevDef,
  itemIcon,
  loadConnectorDefs,
  marketHighlightId,
  marketItemRowStatus,
  rowIcon,
  versionLabel
} from './marketDisplay';

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
  /** 我的上架 / 已装管理行点击：打开物料详情 tab（kind market-detail） */
  (e: 'open-detail', itemId: string | number, title: string): void;
  /** 待审核行点击：打开物料审核 tab（kind market-review，宿主 openMarketReview，同 id 单例） */
  (e: 'open-review', itemId: string | number, title: string): void;
  /** 连接器行点击：打开连接器包查看 tab（kind connector-package，同 type+version 单例） */
  (e: 'open-connector-package', type: string, version: string, source?: string): void;
  /** 视角切换：宿主回写 tab.marketScope（刷新后仍是这个视角） */
  (e: 'scope-change', scope: MarketScope): void;
  /** 返回市场＝聚焦已开的市场 tab，本 tab 不关（两 tab 并存） */
  (e: 'back-to-market'): void;
  /** 页头 / 我的上架空态「上架物料」：宿主开物料上架 tab（2026-11-01 上架 tab 化，内部弹窗已退役） */
  (e: 'open-publish'): void;
}>();

const market = useMarketData();
const { installed, mine, pending, loading } = market;

/** 当前视角；初值取 tab 上落盘的 scope，宿主改 tab.marketScope 时经 watch 跟上 */
const scope = ref<MarketScope>(props.scope ?? 'installed');
/** 管理页搜索（客户端过滤当前视角列表） */
const manageKeyword = ref('');
/** 分类子 pane：页头「新增分类」调它的 openCreate（弹窗与表单都在子组件内） */
const categoryPaneRef = ref<InstanceType<typeof MarketCategoryPane> | null>(null);

/* 分组折叠：key = `${视角}:${类型}`（治理只有连接器一组，类型固定 'CONNECTOR'）。
   只记录「已折叠」，缺省即展开——新分组默认可见，切视角各自记住自己那几组的开合。 */
const collapsedGroups = ref<Record<string, boolean>>({});

function groupKey(type: string): string {
  return `${scope.value}:${type}`;
}

/** 该组是否已折叠（未记录＝展开） */
function isGroupCollapsed(type: string): boolean {
  return collapsedGroups.value[groupKey(type)] === true;
}

function toggleGroup(type: string): void {
  collapsedGroups.value[groupKey(type)] = !isGroupCollapsed(type);
}

/* ---------------- 权限判定（一律按权限串，admin 通配免检） ---------------- */
const userStore = useUserStore();
function hasPermi(perm: string): boolean {
  return userStore.permissions.some((p: string) => p === '*:*:*' || p === perm);
}
/* 连接器运行层权限（§15.7）：list 驱动 defs 分组显隐（启停/卸载/上传按钮走 v-hasPermi 指令） */
const canConnectorList = computed(() => hasPermi('databus:connector:list'));
/** 「治理」视角入口：按治理员角色判定，不绑具体物料类型。
 *  治理是全局职责（现在放连接器，以后放组件/链路），不该因为某个 connector 权限串决定整个视角的显隐 */
const canGovern = computed(() => checkRole(['databus_gov']));
/** 当前用户 id（禁自审判定：待审核列表全量展示，自己上架的项整行不可点，decisions §七-7.1） */
const currentUserId = computed(() => userStore.userId);

/* ---------------- 数据装载 ---------------- */

/** 按视角取数（不清搜索：令牌刷新与初次装载都走这里） */
async function loadScope(target: MarketScope): Promise<void> {
  if (target === 'installed') {
    // 已装管理只认安装台账：连接器也一样，没安装记录就不会出现在这里
    await market.loadInstalled();
    // 已装连接器行要补版本（展示码由台账接口回填），有连接器才补拉 defs
    if (installed.value.some((row) => row.resourceType === 'CONNECTOR')) {
      await loadConnectorDefs();
    }
  } else if (target === 'mine') {
    await market.loadMine();
  } else if (target === 'governance') {
    // 治理看的是本机全部 def 行，和「装没装过」无关
    await loadConnectorDefs();
  } else if (target === 'category') {
    // 分类视角自带取数（MarketCategoryPane 挂载即拉自己的列表，不参与物料装载）
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

/** DbSeg 上抛的视角值转 MarketScope，统一走 switchScope */
function onScopeChange(value: string | number) {
  void switchScope(value as MarketScope);
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

/* ---------------- 上架成功的新行高亮（3 秒自动消失） ---------------- */
const flashItemId = ref('');
let flashTimer: number | undefined;

function scrollToFlash(): void {
  document.querySelector(`[data-market-item-id="${flashItemId.value}"]`)
    ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/* 信号由宿主写入（打开「我的上架」后紧跟着写 id）；消费一次即清，避免重挂载重放 */
watch(
  marketHighlightId,
  (raw) => {
    if (raw == null) {
      return;
    }
    flashItemId.value = raw;
    marketHighlightId.value = undefined;
    window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => {
      flashItemId.value = '';
    }, 3000);
    void nextTick(scrollToFlash);
  },
  { immediate: true }
);

/* 列表异步重取完再补一次滚动：新行要等 loadMine 回来才存在 */
watch(
  () => market.mine.value,
  () => {
    if (flashItemId.value) {
      void nextTick(scrollToFlash);
    }
  }
);

onUnmounted(() => window.clearTimeout(flashTimer));

/* 刷新令牌：审核 tab 审完、或另一头（市场 tab / 资源树）动了安装台账，重取当前视角 */
watch(
  () => props.refreshToken,
  (token) => {
    if (token) {
      void loadScope(scope.value);
    }
  }
);

/* 市场 tab 空态「去上架」的 publish 意图递接链已退役（2026-11-01 上架 tab 化：
   三处上架入口一律直开 market-publish tab，不再经本 pane 弹弹窗） */

onMounted(async () => {
  await loadScope(scope.value);
});

/* ---------------- 展示辅助 ---------------- */

/** 页头标题/副标题随视角切换 */
const manageTitle = computed(
  () =>
    ({ installed: '已装管理', mine: '我的上架', pending: '待审核', governance: '治理', category: '物料分类' })[
      scope.value
    ]
);
const manageSub = computed(
  () =>
    ({
      installed: '管理你已安装的组件、链路与连接器。',
      mine: '你上架的物料与审核状态；可下架或删除。',
      pending: '审核队列：通过即上线，驳回需填写理由。',
      governance: '平台运行态治理：连接器的启停、废弃与卸载。',
      category: '货架目录治理：新增、改名、排序；有物料的分类只能合并到其它分类。'
    })[scope.value]
);

/** 待审核总数（红色冒泡：有任务才显示，>99 显 99+；处理完自动归零消失） */
const pendingTotal = computed(() => pending.value.length);

/**
 * 视角段选项：治理/审核入口按能力决定是否成为选项——滑块只按实际渲染的段测量，
 * 靠 v-if/v-hasPermi 留在模板里会让位移错位；待审核角标也并进选项，随段一起刷新。
 */
const scopeOptions = computed<DbSegOption[]>(() => {
  const options: DbSegOption[] = [
    { label: '已装管理', value: 'installed' },
    { label: '我的上架', value: 'mine' }
  ];
  if (canGovern.value) {
    options.push({ label: '物料治理', value: 'governance' }, { label: '物料分类', value: 'category' });
  }
  if (hasPermi('databus:market:review')) {
    options.push({ label: '待审核', value: 'pending', badge: pendingTotal.value });
  }
  return options;
});

/** 我的上架 / 待审核：整表按关键字（名称/简介/展示码）过滤后按类型拆组，空组丢弃 */
const mineGroups = computed(() => groupByType(mine.value, manageKeyword.value, ['name', 'summary', 'codeDisplay']));
const pendingGroups = computed(() => groupByType(pending.value, manageKeyword.value, ['name', 'summary', 'codeDisplay']));

/** 连接器治理行：defs 合并视图 + 关键字过滤（label / type）。
 *  PENDING 只在「待审核」队列出现，治理页管的是已生效资产的运行态，不再重复列出。 */
const connectorRows = computed(() => {
  const kw = manageKeyword.value.trim().toLowerCase();
  return connectorDefs.value
    .filter((d) => d.status !== 'PENDING')
    .filter((d) => (!kw ? true : [d.label, d.type].some((s) => (s ?? '').toLowerCase().includes(kw))));
});

/** 治理行是否还有可治理的已生效 def（空态文案用：区分「没有包」与「有关键字筛掉」） */
const governableDefCount = computed(() => connectorDefs.value.filter((d) => d.status !== 'PENDING').length);

/** 已装台账分组（组件/链路/连接器）：install 台账按固定顺序拆组 + 关键字过滤（名称/简介/展示码），空组丢弃。
 *  连接器和另外两类同口径——有没有这一行，只看有没有自己的安装记录；
 *  展示码由台账接口从物料行回填，故一并参与搜索 */
const installedGroups = computed(() => groupByType(installed.value, manageKeyword.value, ['name', 'summary', 'codeDisplay']));

/** 治理组空态文案：区分「本机一个包都没有」（配上传引导）与「有包但被关键字筛掉」 */
const connectorEmptyText = computed(() => {
  if (connectorRows.value.length) {
    return '';
  }
  return governableDefCount.value ? '没有匹配的连接器' : '你还没有装载过任何连接器';
});

/** 已装管理是否整页空：三条台账组（组件/链路/连接器）都空才算空 */
const installedEmpty = computed(() => !installedGroups.value.length);

/** 已装连接器行对应的 def 行（安装台账的 localResourceId＝def 行 id；拿不到返回 null） */
function installedConnectorDef(row: DatabusMarketInstallVo): ConnectorDefVo | null {
  if (row.resourceType !== 'CONNECTOR' || row.localResourceId == null) {
    return null;
  }
  return connectorDefs.value.find((d) => d.id != null && String(d.id) === String(row.localResourceId)) ?? null;
}

/** 已装连接器副标题：展示码（台账接口从物料行回填）＋ 版本（defs 现取）。
 *  展示码不依赖 defs——没有 databus:connector:list 时仍能显示「谁的哪一个」；
 *  defs 拿得到版本时补上，与「我的上架 / 物料治理」的版本口径一致 */
function installedConnectorCode(row: DatabusMarketInstallVo): string {
  const def = installedConnectorDef(row);
  const code = row.codeDisplay || (def ? `#${def.type}` : '');
  const version = def?.version ? ` · ${versionLabel(def.version)} · b${def.buildNo ?? 0}` : '';
  return `${code}${version}`;
}

/* ---------------- 行交互：整行可点＝唯一入口，ops 区只留治理动作 ---------------- */

/** 已装台账行是否可点：组件/链路有本地副本就开本地资源；其余（尤其连接器）有市场物料行就开物料详情。
 *  两种都拿不到时整行不可点（无 hover、无 chevron），行为与另外两个视角一致 */
function canOpenInstalled(row: DatabusMarketInstallVo): boolean {
  const hasLocal = row.localResourceId != null && (row.resourceType === 'COMPONENT' || row.resourceType === 'CHAIN');
  return hasLocal || row.marketItemId != null;
}

/** 已装台账行整行点击：本地副本优先（组件详情 / 链路画布），连接器落到市场物料详情 */
function onOpenInstalled(row: DatabusMarketInstallVo) {
  if (!canOpenInstalled(row)) {
    return;
  }
  if (row.localResourceId != null && (row.resourceType === 'COMPONENT' || row.resourceType === 'CHAIN')) {
    emit('open-local', row.localResourceId, row.resourceType as 'COMPONENT' | 'CHAIN', row.name ?? '');
    return;
  }
  if (row.marketItemId != null) {
    emit('open-detail', row.marketItemId, row.name ?? '');
  }
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
  // 共用本体（组件 SHARED / 连接器）：卸载仅移除自己的安装记录，不动本体；
  // 只有链路与组件 FORK 副本才是删本地资源
  if (row.resourceType === 'CONNECTOR') {
    try {
      await modal.confirm(`确认卸载「${row.name}」？只移除你的安装记录，连接器本体与启停状态不受影响。`);
    } catch {
      return;
    }
  } else {
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
  }
  try {
    await market.uninstall(row.localResourceId);
    ElMessage.success('已卸载');
    emit('installed');
  } catch {
    /* 拦截器已提示 */
  }
}

/* ---------------- 连接器 def 治理（治理视角） ---------------- */

/** 治理动作菜单分发：行上只留「更多」，启停/废弃/卸载/重载都在菜单里 */
function onGovernCommand(row: ConnectorDefVo, cmd: string) {
  if (cmd === 'reload') {
    void onReloadDevDef(row);
  } else if (cmd === 'enable') {
    void onToggleDef(row, true);
  } else if (cmd === 'disable') {
    void onToggleDef(row, false);
  } else if (cmd === 'deprecate') {
    void onDeprecateDef(row);
  } else if (cmd === 'uninstall') {
    void onUninstallDef(row);
  }
}

/** def 行启停：enable/disable 全局生效；失败重拉 defs 回滚 UI。
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
              `#${row.type}${row.version ? ` · ${versionLabel(row.version)} · b${row.buildNo ?? 0}` : ''}`
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
      await enableConnector(row.type, row.version, verified.value);
      ElMessage.success(`已启用「${row.label || row.type}」，全局生效`);
    } else {
      await disableConnector(row.type, row.version);
      ElMessage.success(`已停用「${row.label || row.type}」`);
    }
    await afterConnectorGoverned();
  } catch {
    /* 拦截器已提示；重拉恢复行状态 */
    await loadConnectorDefs();
  }
}

/** def 行废弃：DEPRECATED 终态不可逆（停机退役，包与 def 行保留，之后只能卸载），故二次确认写清后果 */
async function onDeprecateDef(row: ConnectorDefVo) {
  try {
    await modal.confirm(
      `确认废弃连接器「${row.label || row.type}」？废弃后立即停机（存量连接失效），且为终态不可逆：不能再启用，同一版本也不能再上传覆盖，只能卸载。`
    );
  } catch {
    return;
  }
  try {
    await deprecateConnector(row.type, row.version);
    ElMessage.success(`已废弃「${row.label || row.type}」`);
    await afterConnectorGoverned();
  } catch {
    /* 拦截器已提示 */
  }
}

/** def 行卸载：先常规（在用连接会被拒）→ 二次确认强制（存量连接悬空）。
 *  dev 行只删台账记录，不动 target 编译产物，确认文案单独说清，避免误解成删包。 */
async function onUninstallDef(row: ConnectorDefVo) {
  const dev = isDevDef(row);
  try {
    await modal.confirm(
      dev
        ? `确认卸载连接器「${row.label || row.type}」？只删台账记录，不动 target 编译产物；dev-plugin-dir 配置还在的话，重启后会被重新装载。`
        : `确认卸载连接器「${row.label || row.type}」？将删除 def 行与包文件。`
    );
  } catch {
    return;
  }
  // 先查在用连接数，再决定发哪种卸载：避免先发一次注定被拒的请求、弹红条后又弹绿条
  let inUse = 0;
  try {
    const res = await listConnection({ connectorDefId: Number(row.id), pageNum: 1, pageSize: 1 });
    inUse = Number(res.data?.total ?? 0);
  } catch {
    /* 查不到就按无连接处理，交给后端普通卸载兜底 */
  }
  if (inUse > 0) {
    try {
      await modal.confirm(
        `「${row.label || row.type}」存在 ${inUse} 条在用连接，是否强制卸载？存量连接将悬空，可能影响链路运行。`
      );
    } catch {
      return;
    }
  }
  try {
    await uninstallConnector(row.type, row.version, inUse > 0);
    ElMessage.success(inUse > 0 ? '已强制卸载' : '已卸载');
    await afterConnectorGoverned();
  } catch {
    /* 拦截器已提示 */
  }
}

/**
 * 连接器治理动作落地后：重拉 defs（本 pane 治理行 + 市场 tab 卡片运行态提示同源），
 * 并上抛宿主——市场 pane 的卡片安装态来自市场列表接口，得靠宿主发刷新令牌才跟着变。
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
/* 上架表单已提为独立 market-publish tab（2026-11-01）：页头/空态「上架物料」emit open-publish
   由宿主开 tab；提交与成功提示都在 MarketPublishPane 内完成，本 pane 经 refreshToken 令牌看到新单。 */

/* ---------------- 待审核操作 ---------------- */
/* 审核动作（通过/驳回、B 口径依赖知情确认、依赖查看留痕）已随详情 tab 化整体迁入
   MarketReviewTab（2026-10-24）；本 pane 只负责开 tab 与审完刷新（refreshToken watch）。 */
</script>

<style lang="scss" scoped>
/* 面板外壳 / 页头 / 限宽居中 / 滚动体 / 组标题走全局 _databus-market.scss（与市场 tab 同源）；
   此处只留管理页独有的：返回条、视角分段行、待审核冒泡、组计数、行列表 */

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

/* 组标题（折叠箭头 / 类型名 / 计数）样式随组件搬进 MarketGroupHeader.vue，
   四个视角共用一份，本页只留视角专属的部分 */

/* 行与列表样式已全部上收 _primitives.scss：
   列表 = .db-list + .db-list--framed，行 = .db-row（浮起由 .db-float 决定），
   本页只保留「上架成功高亮」这类物料专属状态。 */

/* 上架成功后的新行高亮：中性灰底 + 左侧细蓝条，末段一起淡出（宿主 3 秒后清 class） */
.db-row.is-flash {
  animation: db-row-flash 3s ease-out;
}

@keyframes db-row-flash {
  0%,
  55% {
    background-color: var(--el-fill-color-light);
    box-shadow: inset 3px 0 0 var(--el-color-primary);
  }

  100% {
    background-color: transparent;
    box-shadow: inset 3px 0 0 transparent;
  }
}
</style>
