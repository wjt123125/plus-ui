<!--
  物料审核 tab 面板（kind=market-review，2026-10-24 由审核详情弹窗 tab 化）：
  三段式——物料信息头（名称/作者/类型/上架说明）→ 内容预览（链路画布节点清单 / 组件关键信息 /
  连接器查看（开连接器包查看 tab，下载原包在该 tab 头部））→ 闭包依赖状态树（依赖上下架状态 + 「查看」跳工作台 tab 看真身）。
  操作栏钉 tab 底部：通过 / 驳回就地完成；禁自审；B 口径（2026-10-24 拍板）：链路通过前对
  「非 ONLINE 依赖」做未查看知情确认——ONLINE 依赖各有审核单背书豁免；全看过或无依赖走普通确认；
  审完 emit('reviewed') 由宿主关 tab 并刷新市场 pane 的待审核冒泡。
  面板零直连 API：数据与审核动作走 useMarketData。
-->
<template>
  <section class="mrt">
    <div v-loading="loading" class="mrt__scroll">
      <div v-if="detail?.item" class="mrt__inner">
        <!-- 物料信息头 -->
        <header class="mrt__head">
          <SvgIcon
            class="mrt__head-icon"
            :icon-class="itemIcon"
            :style="{ color: detail.item.color || 'var(--el-color-primary)' }"
          />
          <div class="mrt__head-meta">
            <div class="mrt__head-name">
              {{ detail.item.name }}
              <el-tag size="small" type="warning" effect="light">待审核</el-tag>
            </div>
            <div class="mrt__head-sub">
              {{ typeLabel }} · {{ detail.item.codeDisplay }} · 上架者
              @{{ detail.item.ownerCode || detail.preview?.author || '-' }}
            </div>
            <div v-if="detail.item.summary" class="mrt__head-summary">{{ detail.item.summary }}</div>
            <!-- 作者重提时的修改说明与上次驳回理由：审核者复核的第一眼上下文（P1 驳回-重提闭环） -->
            <div v-if="detail.item.modifyNote" class="mrt__head-note">修改说明：{{ detail.item.modifyNote }}</div>
            <div v-if="detail.item.remark" class="mrt__head-note is-reject">上次驳回理由：{{ detail.item.remark }}</div>
          </div>
        </header>

        <!-- 非待审态提示（他人已审 / 物料被作者删除重提等竞态）：操作栏同步隐藏，只读看现场 -->
        <div v-if="detail.item.status && detail.item.status !== 'PENDING'" class="mrt__stale">
          该物料已不在待审核状态（当前：{{ statusLabel(detail.item.status) }}），仅可查看。
        </div>

        <!-- 内容预览：CHAIN 画布节点清单 / COMPONENT 关键信息（自弹窗原样迁移） -->
        <section class="mrt__block">
          <template v-if="detail.item.resourceType === 'CHAIN'">
            <h4 class="mrt__h">
              画布结构预览
              <!-- P1 看得见：跳工作台画布 tab 看链路真身（宿主 openCanvas） -->
              <el-button
                v-if="detail.item.sourceId"
                class="mrt__view"
                size="small"
                text
                type="primary"
                @click="emitOpenSource('CHAIN', detail.item.sourceId, null, detail.item.name)"
              >
                查看链路
              </el-button>
            </h4>
            <p v-if="!detail.preview?.nodes?.length" class="mrt__empty">
              源链已删除或画布为空，审核将无法通过（终审 gate 会拒绝）。
            </p>
            <ul v-else class="mrt__nodes">
              <li
                v-for="(n, i) in detail.preview!.nodes"
                :key="i"
                class="mrt__node"
                :class="{ 'is-structure': n.structure }"
              >
                <span class="mrt__node-type">{{ n.type ?? '未定义' }}</span>
                <span v-if="!n.structure" class="mrt__node-code">{{ n.code ?? n.name ?? '' }}</span>
                <span v-if="!n.structure && n.name && n.name !== n.code" class="mrt__node-name">
                  {{ n.name }}
                </span>
                <span v-if="n.structure" class="mrt__node-tag">结构</span>
              </li>
            </ul>
          </template>
          <template v-else-if="detail.item.resourceType === 'CONNECTOR'">
            <!-- 连接器审核「看得见」§2.3：查看（开连接器包查看 tab：清单+反编译预览），解盲审。
                 下载原包不在审核页上——收在包查看 tab 头部，看包只此一个入口 -->
            <h4 class="mrt__h">
              连接器关键信息
              <el-button
                v-if="canInspectConnector"
                class="mrt__view"
                size="small"
                text
                type="primary"
                @click="onInspectConnector"
              >
                查看
              </el-button>
            </h4>
            <ul class="mrt__kv">
              <li><span>上架者</span><b>{{ detail.preview?.author || detail.item.ownerCode || '-' }}</b></li>
              <li><span>类型</span><b class="mono">#{{ detail.preview?.code || '-' }}</b></li>
              <li><span>版本</span><b>v{{ detail.preview?.version || '-' }}</b></li>
            </ul>
            <p v-if="!canInspectConnector" class="mrt__empty">
              该连接器缺类型编码或版本号，无法定位包文件，只能盲审（建议驳回要求补齐 manifest）。
            </p>
          </template>
          <template v-else>
            <h4 class="mrt__h">
              物料关键信息
              <!-- P1 看得见：按源组件 code 跳工作台组件详情 tab（正本身份是 code） -->
              <el-button
                v-if="detail.preview?.code"
                class="mrt__view"
                size="small"
                text
                type="primary"
                @click="emitOpenSource('COMPONENT', detail.item.sourceId!, detail.preview!.code!, detail.item.name)"
              >
                查看组件
              </el-button>
            </h4>
            <ul class="mrt__kv">
              <li><span>上架者</span><b>{{ detail.preview?.author || detail.item.ownerCode || '-' }}</b></li>
              <li><span>版本</span><b>{{ detail.preview?.version || '-' }}</b></li>
              <li><span>脚本语言</span><b>{{ detail.preview?.scriptLang || '-' }}</b></li>
              <li><span>描述</span><b>{{ detail.preview?.description || '-' }}</b></li>
            </ul>
          </template>
        </section>

        <!-- 闭包依赖状态树 -->
        <section class="mrt__block">
          <h4 class="mrt__h">依赖上架状态</h4>
          <p v-if="!detail.dependencies?.length" class="mrt__empty">
            无依赖（组件物料或独立链路）。
          </p>
          <!-- 引用层级树（闭包联审：后端先序展开+depth，前端组装 el-tree 默认全展开；行内容与按钮同原扁平列表） -->
          <el-tree
            v-else
            class="mrt__deps-tree"
            :data="depTree"
            node-key="_key"
            :props="{ label: 'name', children: 'children' }"
            default-expand-all
            :expand-on-click-node="false"
            :highlight-current="false"
          >
            <template #default="{ data: d }">
              <span class="mrt__dep">
                <span class="mrt__dep-type">{{ d.resourceType === 'CHAIN' ? '链' : '组件' }}</span>
                <span class="mrt__dep-name">{{ d.name }}</span>
                <span class="mrt__dep-status" :class="`is-${(d.marketStatus || 'none').toLowerCase()}`">
                  {{ statusLabel(d.marketStatus) }}
                </span>
                <span v-if="d.remark" class="mrt__dep-remark">（{{ d.remark }}）</span>
                <!-- P1 看得见：依赖项同跳工作台 tab（链按 sourceId 开画布、组件按 code 开详情；悬空引用无 id 不显示）。
                     点开即记入已查看集合（B 口径：非 ONLINE 依赖未查看，通过时弹知情确认） -->
                <el-button
                  v-if="depViewable(d)"
                  class="mrt__view"
                  size="small"
                  text
                  type="primary"
                  @click="onViewDep(d)"
                >
                  查看
                </el-button>
                <!-- 闭包联审（2026-10-24）：依赖单据 PENDING 且非自审且前置清空（blockedBy 空）时行内就地审，
                     审完刷新本详情与待审核冒泡；前置未清时锁按钮只留「需先通过」提示，一层一层审 -->
                <template v-if="depReviewable(d)">
                  <el-button
                    size="small"
                    text
                    type="success"
                    :loading="actingDepKey === depKey(d)"
                    @click="onApproveDep(d)"
                  >
                    通过
                  </el-button>
                  <el-button
                    size="small"
                    text
                    type="danger"
                    :loading="actingDepKey === depKey(d)"
                    @click="onRejectDep(d)"
                  >
                    驳回
                  </el-button>
                </template>
              </span>
            </template>
          </el-tree>
        </section>
      </div>
      <el-empty v-else-if="!loading" description="物料不存在或已删除" :image-size="80" />
    </div>

    <!-- 操作栏钉底部：通过 / 驳回就地完成；禁自审；非待审态只读；
         闭包联审：依赖未全 ONLINE 时锁主链审核按钮（倒逼先就地审依赖，与依赖行 blockedBy 锁同模式） -->
    <footer v-if="detail?.item" class="mrt__ops">
      <span v-if="isSelf" class="mrt__self">自己上架 · 待审核（禁自审）</span>
      <template v-else-if="detail.item.status === 'PENDING'">
        <span v-if="!depsAllOnline" class="mrt__ops-hint">
          依赖未全部过审（还剩 {{ depsBlockingCount }} 项），依赖全清后这里出现审核按钮。
        </span>
        <template v-else>
          <span class="mrt__ops-hint">通过后立即在市场展示；驳回需填写理由。</span>
          <el-button type="primary" :loading="acting" @click="onApprove">通过</el-button>
          <el-button type="danger" plain :loading="acting" @click="onReject">驳回</el-button>
        </template>
      </template>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import modal from '@/plugins/modal';
import { useUserStore } from '@/store/modules/user';
import type {
  MarketItemStatus,
  MarketResourceType,
  MarketReviewDependency,
  MarketReviewDetailVo
} from '@/api/databus/market/types';
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';
import { useMarketData } from './useMarketData';

defineOptions({ name: 'MarketReviewTab' });

useLucideSubset();

const props = defineProps<{
  /** 受审物料主键（tab 持久化的字符串，防雪花 id 精度丢失） */
  itemId: string;
}>();

const emit = defineEmits<{
  /** 「查看」跳工作台 tab：链按 sourceId 开画布、组件按 code 开详情（宿主分发） */
  (e: 'open-source', resourceType: MarketResourceType, sourceId: string | number, code: string | null, title: string): void;
  /** 审核完成（通过或驳回成功）：宿主关本 tab 并刷新市场 pane 待审核冒泡 */
  (e: 'reviewed'): void;
  /** 依赖单据就地审完（闭包联审）：本 tab 不关，宿主只刷新市场 pane 待审核冒泡 */
  (e: 'dep-reviewed'): void;
  /** 连接器行「查看」：打开连接器包查看 tab（kind connector-package，同 type+version 单例） */
  (e: 'open-connector-package', type: string, version: string): void;
}>();

const market = useMarketData();

const detail = ref<MarketReviewDetailVo | null>(null);
const loading = ref(false);
/** 审核动作进行中（通过/驳回按钮共用 loading，防双击重复提交） */
const acting = ref(false);
/** 依赖行内审核进行中（按 depKey 粒度，防双击；闭包联审） */
const actingDepKey = ref<string>();

/** 拉取/重拉审核详情（依赖就地审完后刷新依赖状态树） */
async function reloadDetail() {
  detail.value = (await market.reviewDetail(props.itemId)) ?? null;
}

onMounted(async () => {
  loading.value = true;
  try {
    /* market.reviewDetail 已返回业务 Vo（useMarketData 内做过 axios 解构），再解构 .data 会得 undefined（曾致弹窗空白） */
    await reloadDetail();
  } catch {
    detail.value = null; // 拦截器已提示；空态展示
  } finally {
    loading.value = false;
  }
});

/* ---------------- 禁自审（decisions §七-7.1，与待审核列表行同口径） ---------------- */
const userStore = useUserStore();
const currentUserId = computed(() => userStore.userId);
const isSelf = computed(() => detail.value?.item?.ownerId === currentUserId.value);

/* ---------------- 展示辅助（自弹窗原样迁移） ---------------- */

const itemIcon = computed(() => {
  const it = detail.value?.item;
  if (!it) {
    return 'lucide:box';
  }
  return it.resourceType === 'CHAIN' ? 'lucide:spline' : it.icon || 'lucide:box';
});

const typeLabel = computed(() => {
  const t = detail.value?.item?.resourceType;
  return t === 'CHAIN' ? '链路' : t === 'CONNECTOR' ? '连接器' : '组件';
});

/* ---------------- 连接器审核「看得见」（§2.3）：查看包 ---------------- */

/** 连接器类型键（preview.code 在 CONNECTOR 分支＝def 行 type） */
function connectorTypeOf(): string | null {
  return detail.value?.preview?.code ?? null;
}

/** 连接器包版本号 */
function connectorVersionOf(): string | null {
  return detail.value?.preview?.version ?? null;
}

/** 能否查看包（类型与版本都齐才有包可定位；缺失走盲审提示） */
const canInspectConnector = computed(() => Boolean(connectorTypeOf() && connectorVersionOf()));

function onInspectConnector(): void {
  const t = connectorTypeOf();
  const v = connectorVersionOf();
  if (!t || !v) {
    ElMessage.warning('缺类型编码或版本号，无法查看包');
    return;
  }
  emit('open-connector-package', t, v);
}

/** 依赖市场状态展示标签（null/未上架 → 未上架） */
function statusLabel(status?: MarketItemStatus | null): string {
  if (!status) {
    return '未上架';
  }
  return (
    {
      ONLINE: '已上架',
      PENDING: '待审',
      REJECTED: '已驳回',
      OFFLINE: '已下架',
      DRAFT: '草稿',
      APPROVED: '已通过'
    } as Record<string, string>
  )[status] ?? status;
}

/** P1 看得见：依赖项「查看」按钮可见性（链需 sourceId、组件需 code；悬空引用缺实体不可跳） */
function depViewable(d: MarketReviewDependency): boolean {
  if (d.resourceType === 'CHAIN') {
    return d.sourceId != null;
  }
  return Boolean(d.code);
}

/** P1 看得见：「查看」上抛宿主开工作台 tab（审核者不隔玻璃审货） */
function emitOpenSource(
  resourceType: MarketResourceType,
  sourceId: string | number,
  code: string | null,
  title: string
) {
  emit('open-source', resourceType, sourceId, code, title);
}

/* ---------------- B 口径：依赖未查看知情确认（自 MarketPane 原样迁移） ---------------- */

/** 会话内已查看的依赖 key：tab 内一物一实例，key 只需依赖身份（源 id，悬空退化编码）。
 *  组件实例随 tab 存活（v-show 保活），刷新丢失＝只多弹一次确认，行为安全方向 */
const viewedDepKeys = ref(new Set<string>());

function depKey(d: MarketReviewDependency): string {
  return `${d.resourceType}:${d.sourceId ?? d.code}`;
}

/** el-tree 节点（扁平先序列表 + depth 组装；_key 复用 depKey 口径供 node-key） */
interface DepTreeNode extends MarketReviewDependency {
  _key: string;
  children?: DepTreeNode[];
}

/**
 * 扁平先序列表 → 树（depth 父栈法：depth=d 的节点挂在栈顶最近一个 depth=d-1 节点下；
 * 后端已按引用树先序排好序，这里只做结构还原，不重排顺序）
 */
const depTree = computed<DepTreeNode[]>(() => {
  const roots: DepTreeNode[] = [];
  const stack: DepTreeNode[] = [];
  for (const d of detail.value?.dependencies ?? []) {
    const node: DepTreeNode = { ...d, _key: depKey(d) };
    const depth = d.depth ?? 1;
    while (stack.length >= depth) {
      stack.pop();
    }
    if (stack.length) {
      (stack[stack.length - 1].children ??= []).push(node);
    } else {
      roots.push(node);
    }
    stack.push(node);
  }
  return roots;
});

/** 依赖「查看」：记入已查看集合再跳工作台 tab（主体按钮不走此路径，主体不参与依赖确认） */
function onViewDep(d: MarketReviewDependency) {
  viewedDepKeys.value.add(depKey(d));
  emitOpenSource(d.resourceType!, d.sourceId!, d.code ?? null, d.name ?? '');
}

/** 主链审核按钮锁（闭包联审）：闭包依赖全 ONLINE 才解锁——倒逼审核者先就地审依赖；
 *  组件物料无依赖（空列表）天然解锁。口径与终审 gate 一致：未上架/悬空引用（marketStatus 空）同样挡 */
const depsAllOnline = computed(() => {
  const deps = detail.value?.dependencies;
  return !deps?.length || deps.every((d) => d.marketStatus === 'ONLINE');
});

/** 未 ONLINE 依赖计数（锁定提示里的进度数字） */
const depsBlockingCount = computed(
  () => (detail.value?.dependencies ?? []).filter((d) => d.marketStatus !== 'ONLINE').length
);

/* ---------------- 闭包联审（2026-10-24）：依赖单据行内就地审 ---------------- */

/** 依赖行审核按钮可见性：有单据且 PENDING 且非自审（禁自审同主体口径，§七-7.1），
 *  且前置已清空（blockedBy 非空=闭包内还有未 ONLINE 成员，锁按钮只留提示——
 *  一层一层审：叶子清了父亲才解锁，不再靠 gate 报错试错） */
function depReviewable(d: MarketReviewDependency): boolean {
  return (
    d.marketStatus === 'PENDING' &&
    d.marketItemId != null &&
    d.ownerId !== currentUserId.value &&
    !d.blockedBy?.length
  );
}

/** 依赖就地通过：B 口径适配——未「查看」过的先弹知情确认，查看过走普通确认；
 *  审完刷新本详情（依赖状态树变 ONLINE）并通知宿主刷待审核冒泡，本 tab 不关 */
async function onApproveDep(d: MarketReviewDependency) {
  if (actingDepKey.value) {
    return;
  }
  try {
    if (!viewedDepKeys.value.has(depKey(d))) {
      await ElMessageBox.confirm(
        `尚未查看依赖「${d.name}」的内容。确认已知情并通过其上架审核？`,
        '依赖未查看',
        { confirmButtonText: '知情并通过', cancelButtonText: '先看看', type: 'warning' }
      );
    } else {
      await modal.confirm(`通过依赖「${d.name}」的上架审核？通过后立即在市场展示。`);
    }
  } catch {
    return; // 用户取消
  }
  actingDepKey.value = depKey(d);
  try {
    await market.review(d.marketItemId!, { approved: true });
    ElMessage.success(`依赖「${d.name}」已通过`);
    await reloadDetail();
    emit('dep-reviewed');
  } catch {
    /* 拦截器已提示 */
  } finally {
    actingDepKey.value = undefined;
  }
}

/** 依赖就地驳回：必填理由（写该依赖单据的 remark），审完同通过路径刷新 */
async function onRejectDep(d: MarketReviewDependency) {
  if (actingDepKey.value) {
    return;
  }
  let reason = '';
  try {
    const res = await ElMessageBox.prompt(`驳回依赖「${d.name}」，请填写驳回理由：`, '驳回上架', {
      confirmButtonText: '驳回',
      cancelButtonText: '取消',
      inputType: 'textarea',
      inputPlaceholder: '必填：说明驳回原因，便于作者修改',
      inputValidator: (v: string) => (v && v.trim() ? true : '请填写驳回理由')
    });
    reason = String(res.value ?? '').trim();
  } catch {
    return; // 用户取消
  }
  actingDepKey.value = depKey(d);
  try {
    await market.review(d.marketItemId!, { approved: false, reason });
    ElMessage.success(`依赖「${d.name}」已驳回`);
    await reloadDetail();
    emit('dep-reviewed');
  } catch {
    /* 拦截器已提示 */
  } finally {
    actingDepKey.value = undefined;
  }
}

/** 通过：直接上线。B 口径：非 ONLINE 依赖（ONLINE 豁免，各有审核单背书）有未点开看的弹知情确认；
 *  全看过或无依赖走普通确认。依赖树即本 tab 已加载的详情（审核动作在 tab 内，树就是审核现场），
 *  详情缺失（拉取失败）退化为普通确认——真未上线依赖仍被终审 gate 拒，兜底安全。
 *  查看清单留痕跟嵌套审核交互分期一起做，本期未动。 */
async function onApprove() {
  const item = detail.value?.item;
  if (!item || acting.value) {
    return;
  }
  const unviewed = (detail.value?.dependencies ?? [])
    .filter((d) => d.marketStatus !== 'ONLINE' && !viewedDepKeys.value.has(depKey(d)))
    .map((d) => `【${d.resourceType === 'CHAIN' ? '链' : '组件'}】${d.name}`);
  try {
    if (unviewed.length) {
      await ElMessageBox.confirm(
        `有 ${unviewed.length} 个未上线依赖未查看：${unviewed.slice(0, 5).join('、')}${unviewed.length > 5 ? ' 等' : ''}。确认已知情并通过审核？`,
        '依赖未查看',
        { confirmButtonText: '知情并通过', cancelButtonText: '再看看', type: 'warning' }
      );
    } else {
      await modal.confirm(`通过审核「${item.name}」？通过后立即在市场展示。`);
    }
  } catch {
    return; // 用户取消
  }
  acting.value = true;
  try {
    await market.review(item.id, { approved: true });
    ElMessage.success('已通过');
    emit('reviewed');
  } catch {
    /* 拦截器已提示 */
  } finally {
    acting.value = false;
  }
}

/** 驳回：必填理由（写入 remark） */
async function onReject() {
  const item = detail.value?.item;
  if (!item || acting.value) {
    return;
  }
  let reason = '';
  try {
    const res = await ElMessageBox.prompt(`驳回「${item.name}」，请填写驳回理由：`, '驳回上架', {
      confirmButtonText: '驳回',
      cancelButtonText: '取消',
      inputType: 'textarea',
      inputPlaceholder: '必填：说明驳回原因，便于作者修改',
      inputValidator: (v: string) => (v && v.trim() ? true : '请填写驳回理由')
    });
    reason = String(res.value ?? '').trim();
  } catch {
    return; // 用户取消
  }
  acting.value = true;
  try {
    await market.review(item.id, { approved: false, reason });
    ElMessage.success('已驳回');
    emit('reviewed');
  } catch {
    /* 拦截器已提示 */
  } finally {
    acting.value = false;
  }
}
</script>

<style lang="scss" scoped>
/* 样式自审核详情弹窗（.mkt-detail）平移：弹窗 max-height 滚动改为整 tab 滚动 */
.mrt {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--el-bg-color, #fff);
}

.mrt__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 20px;
}

/* 内容限宽居中：审核以读为主，过宽行长伤可读性 */
.mrt__inner {
  max-width: 860px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mrt__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.mrt__head-icon {
  flex-shrink: 0;
  font-size: 26px;
  margin-top: 2px;
}

.mrt__head-meta {
  min-width: 0;
  flex: 1;
}

.mrt__head-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.mrt__head-sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.mrt__head-summary {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}

.mrt__head-note {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-color-warning);

  &.is-reject {
    color: var(--el-color-danger);
  }
}

/* 非待审态提示（竞态兜底）：操作栏同步隐藏，只读看现场 */
.mrt__stale {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}

.mrt__block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mrt__h {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

/* 「查看」跳工作台 tab 按钮（P1 看得见）：标题行右侧小字按钮 */
.mrt__view {
  font-size: 12px;
  font-weight: 400;
}

.mrt__empty {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

/* —— 画布节点清单（CHAIN） —— */
.mrt__nodes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mrt__node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--el-fill-color-light, #f5f7fa);
  font-size: 12px;

  &.is-structure {
    background: var(--el-color-primary-light-9);
  }
}

.mrt__node-type {
  font-weight: 600;
  color: var(--el-text-color-primary);
  min-width: 64px;
}

.mrt__node-code {
  font-family: var(--el-font-family-mono, monospace);
  color: var(--el-color-primary);
}

.mrt__node-name {
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mrt__node-tag {
  font-size: 11px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  padding: 0 6px;
  border-radius: 4px;
}

/* —— 关键信息键值列表（COMPONENT / CONNECTOR 共用） —— */
.mrt__kv {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;

  li {
    display: flex;
    gap: 12px;

    span {
      flex-shrink: 0;
      width: 72px;
      color: var(--el-text-color-secondary);
    }

    b {
      font-weight: 500;
      color: var(--el-text-color-primary);
      word-break: break-all;

      /* 类型编码等等宽渲染，与连接器包查看 tab 口径一致 */
      &.mono {
        font-family: var(--el-font-family-mono, monospace);
      }
    }
  }
}

/* —— 闭包依赖状态树 —— */
.mrt__deps-tree {
  background: transparent;
}

.mrt__deps-tree :deep(.el-tree-node__content) {
  height: auto;
  padding: 2px 0;
}

.mrt__deps-tree :deep(.el-tree-node__content:hover) {
  background: transparent;
}

.mrt__dep {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--el-fill-color-light, #f5f7fa);
  font-size: 12px;
  /* 行高归一：行内文本盒紧凑，杜绝继承行高导致徽标/按钮视觉中线错开 */
  line-height: 1;
}

.mrt__dep-type {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  height: 18px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  background: var(--el-bg-color);
  padding: 0 6px;
  border-radius: 4px;
}

.mrt__dep-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.mrt__dep-status {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  height: 18px;
  font-size: 11px;
  padding: 0 8px;
  border-radius: 999px;

  &.is-online {
    color: var(--el-color-success);
    background: var(--el-color-success-light-9);
  }

  &.is-pending {
    color: var(--el-color-warning);
    background: var(--el-color-warning-light-9);
  }

  &.is-rejected {
    color: var(--el-color-danger);
    background: var(--el-color-danger-light-9);
  }

  &.is-none {
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-light, #f5f7fa);
  }
}

.mrt__dep-remark {
  flex-shrink: 0;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-secondary);
}

/* —— 操作栏钉 tab 底部（通过/驳回就地完成） —— */
.mrt__ops {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 12px 20px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color, #fff);
}

.mrt__ops-hint {
  margin-right: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.mrt__self {
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light, #f5f7fa);
  padding: 2px 10px;
  border-radius: 999px;
}
</style>
