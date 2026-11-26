<script setup lang="ts">
/**
 * 运行健康（2026-11-26）
 *
 * 库存脚本件在应用启动时由 ScriptComponentStartupRegistrar 编译并注册，
 * 失败件不阻断启动、但无法执行。诊断信息原先以警示条形式挤在资源树头部，
 * 占用导航位置且截断长错误；这里按「导航面 ↔ 诊断面分离」独立成 tab：
 * - 本 pane 自取数：tab 激活、切段（失败/正常）时重取，避免修好后旧快照残留；
 *   取数入口收敛到「切 tab」本身，不再单设刷新钮（少一个按钮，行为也更符合直觉）；
 * - 资源树只保留树头 E 装饰码（与叶子同形制，点击开本页）。
 *
 * 页面结构对齐物料管理（MarketManagePane）：页头 + 分段 + 列表体，
 * 「失败 / 正常」件数内联在段标签后（不做右上角角标：件数一多就会压到相邻段），
 * 也不在页头另起一对 stat-pill（同一信息不重复表达）。
 * 行也同物料治理口径：行上只留状态与名称，操作收进行尾「更多」菜单；
 * 失败详情默认折叠，点行才展开（错误动辄十几行，默认铺开会淹掉主信息）。
 * 异常沿用资源树的装饰码 E（同语义同色），让树头、树叶、诊断页只有一种异常符号。
 * 错误文本先沿用后端整串 message，不做结构化解析（二期再拆 line/column）。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { listScriptRuntime } from '@/api/databus/component';
import type { ScriptRuntime } from '@/api/databus/component/types';
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';
import SessionMoreMenu from '@/views/databus/workbench/components/SessionMoreMenu.vue';
import DbSeg, { type DbSegOption } from '../components/DbSeg.vue';

const props = withDefaults(
  defineProps<{
    /** 当前 tab 是否处于激活态：切回来时重新取数，避免显示修复前的旧结论 */
    active?: boolean;
    /** 宿主主动刷新令牌（tab 右键「刷新」等），变化即重取 */
    refreshToken?: number;
  }>(),
  { active: false, refreshToken: 0 }
);

const emit = defineEmits<{
  (e: 'open-component', code: string, name: string): void;
  (e: 'edit', code: string, name: string): void;
}>();

useLucideSubset();

const items = ref<ScriptRuntime[]>([]);
const loading = ref(false);

const failed = computed(() => items.value.filter((i) => !i.healthy));
const healthy = computed(() => items.value.filter((i) => i.healthy));
const failedCount = computed(() => failed.value.length);
const healthyCount = computed(() => healthy.value.length);

/** 分段视角（本 pane 唯一一层 tab）：默认停在诊断段；只有「首次进入且确实没有失败件」才落到「正常」 */
type HealthView = 'failed' | 'ok';
const view = ref<HealthView>('failed');
/** 用户是否手动点过分段：点过就尊重选择，切到空的「失败」段也要允许（给空态提示，不再强行弹回） */
let userPickedView = false;

const viewOptions = computed<DbSegOption[]>(() => [
  { label: '失败', value: 'failed', badge: failedCount.value },
  { label: '正常', value: 'ok', badge: healthyCount.value }
]);

function onViewChange(value: string | number) {
  view.value = value as HealthView;
  userPickedView = true;
  // 切段即刷新：数据是启动期快照，切段的动机通常就是「看看现在好没好」，不再单设刷新钮
  void load();
}

/**
 * 失败行的错误展开态：默认全部折叠。
 * javac 错误动辄十几行，默认铺开会把「有几件失败」这个主信息淹掉；
 * 行内只留结论，点行展开完整文本（同物料治理行「点行看详情」的交互口径）。
 */
const openErrors = ref<Record<string, boolean>>({});

function isErrorOpen(code: string): boolean {
  return !!openErrors.value[code];
}

function toggleError(code: string) {
  openErrors.value[code] = !openErrors.value[code];
}

/** 行副标题：版本 / 失败时间 / 结论（同物料行 summary 口径，不另起右侧 info 列） */
function failSummary(item: ScriptRuntime): string {
  const parts: string[] = [];
  if (item.version != null) parts.push(`v${item.version}`);
  if (item.failedAt) parts.push(fmtTime(item.failedAt));
  parts.push('启动期编译失败');
  return parts.join(' · ');
}

/** 行操作收进「更多」菜单（与物料治理行长操作同一套 SessionMoreMenu） */
const rowMenuItems = [
  { command: 'open', label: '打开组件', icon: 'lucide:code' },
  { command: 'edit', label: '去修复', icon: 'lucide:pencil' },
  { command: 'copy', label: '复制错误', icon: 'lucide:copy' }
];

function onRowCommand(item: ScriptRuntime, command: string) {
  if (command === 'open') {
    emit('open-component', item.componentCode, item.componentCode);
  } else if (command === 'edit') {
    emit('edit', item.componentCode, item.componentCode);
  } else if (command === 'copy') {
    void copyError(item);
  }
}

async function load() {
  if (loading.value) return;
  loading.value = true;
  try {
    items.value = (await listScriptRuntime()).data ?? [];
    // 只有「用户还没自己选过段」时才把空的失败段让位给正常段；
    // 否则手动切到「失败」后会被这次回填弹回去，看起来像点不动
    if (!failedCount.value && !userPickedView) {
      view.value = 'ok';
    }
  } catch {
    // 接口失败保留上次快照：诊断页被清空比短暂旧数据更容易误导
  } finally {
    loading.value = false;
  }
}

/** ISO 时间 → 本地可读：后端返回 yyyy-MM-ddTHH:mm:ss，直接截断 T 即可 */
function fmtTime(v?: string | null): string {
  return v ? v.replace('T', ' ').slice(0, 19) : '';
}

async function copyError(item: ScriptRuntime) {
  try {
    await navigator.clipboard.writeText(item.error || '');
    ElMessage.success('错误信息已复制');
  } catch {
    ElMessage.warning('复制失败，请手动选择文本');
  }
}

watch(
  () => props.active,
  (v) => {
    if (v) void load();
  }
);
watch(
  () => props.refreshToken,
  () => {
    if (props.active) void load();
  }
);
onMounted(() => {
  void load();
});
</script>

<template>
  <div class="health-pane">
    <div class="health-pane__scroll">
      <div class="db-pane-inner">
        <div class="page-header">
          <div class="page-title-wrap">
            <h2 class="page-title">运行健康</h2>
            <p class="page-subtitle">
              库存脚本件在应用启动时编译并注册；失败件不影响启动，但无法执行。修复后重新保存或重启服务即恢复。
            </p>
          </div>
        </div>

        <!-- 分段承载「失败 / 正常」两个视角，件数内联在段标签后（不钉角标：件数多时会压到相邻段） -->
        <div class="health-pane__scopes">
          <DbSeg :options="viewOptions" :model-value="view" @change="onViewChange">
            <template #item="{ option }">
              {{ option.label }}
              <span
                v-if="option.badge"
                class="health-pane__count"
                :class="{ 'is-bad': option.value === 'failed' }"
              >
                {{ option.badge }}
              </span>
            </template>
          </DbSeg>
        </div>

        <div v-loading="loading" class="health-pane__body">
          <!-- 失败件：诊断主区。列表/行走全局基元（.db-list--framed + .db-row），与物料管理同一套视觉；
               行上默认只给结论，错误文本点行展开（完整的 javac 原文不截断） -->
          <template v-if="view === 'failed'">
            <ul v-if="failedCount" class="db-list db-list--framed">
              <li
                v-for="item in failed"
                :key="item.componentCode"
                class="db-row is-clickable db-float health-fail"
                @click="toggleError(item.componentCode)"
              >
                <span class="db-row__icon"><span class="health-pane__mark is-error">E</span></span>
                <div class="db-row__meta">
                  <div class="db-row__line">
                    <span class="db-row__name health-fail__code">{{ item.componentCode }}</span>
                  </div>
                  <div class="db-row__summary">{{ failSummary(item) }}</div>
                  <!-- 完整 javac 文本默认折叠，点行才展开 -->
                  <pre v-if="isErrorOpen(item.componentCode)" class="health-fail__error">{{
                    item.error || '启动期注册失败（无错误详情）'
                  }}</pre>
                </div>
                <!-- 行操作收进「更多」菜单（同物料治理），行上只留状态与名称。
                     不再挂折叠小三角：它与三点同处行尾必定打架，展开态本来就由内容本身可见 -->
                <SessionMoreMenu
                  class="db-row__more"
                  :items="rowMenuItems"
                  aria-label="更多操作"
                  @command="(cmd: string) => onRowCommand(item, cmd)"
                />
              </li>
            </ul>
            <!-- 空的失败段是可停留的：给「没有异常件」的结论，而不是把人弹到正常段 -->
            <el-empty v-else description="没有异常件，脚本件均启动正常" :image-size="72" />
          </template>

          <!-- 正常件：同一套行列表，只做存在性交代，不抢诊断主区 -->
          <template v-else>
            <ul v-if="healthyCount" class="db-list db-list--framed">
              <li v-for="item in healthy" :key="item.componentCode" class="db-row">
                <SvgIcon class="db-row__icon health-ok__icon" icon-class="lucide:circle-check" />
                <div class="db-row__meta">
                  <div class="db-row__line">
                    <span class="db-row__name health-fail__code">{{ item.componentCode }}</span>
                  </div>
                  <div class="db-row__summary">启动期编译并注册成功</div>
                </div>
                <div class="db-row__aside db-mono">
                  <span v-if="item.version != null">v{{ item.version }}</span>
                </div>
              </li>
            </ul>

            <div v-else class="health-empty">
              <SvgIcon icon-class="lucide:circle-check" class="health-empty__icon" />
              <p class="health-empty__title">{{ items.length ? '全部脚本件运行正常' : '暂无库存脚本件' }}</p>
              <p class="health-empty__hint">
                {{
                  items.length
                    ? '应用启动时全部编译并注册成功。'
                    : '把组件执行体切到 Java 脚本后，这里会显示启动期检查结果。'
                }}
              </p>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* 骨架同 MonitorPane：吃满宿主高度，滚动收在内层 */
.health-pane {
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: transparent;
}

.health-pane__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.page-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.page-title {
  margin: 0;
  font-size: var(--app-font-size-title, 22px);
  font-weight: 700;
  letter-spacing: -0.025em;
  color: var(--db-ink, #1c1c1e);
}

.page-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

/* 分段行：与物料管理视角段同一行距口径（本页无搜索，故只放分段） */
.health-pane__scopes {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

/* 段内计数：内联在标签后，段宽随内容自适应——
   若做成钉在右上角的角标，件数一多（三位数）就会压到相邻段文字上，这里改内联后不存在该问题。
   等宽数字保证 9→10→100 时不抖动 */
.health-pane__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 16px;
  margin-left: 6px;
  padding: 0 5px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  color: #1a9e66;
  background: rgba(45, 210, 136, 0.16);

  &.is-bad {
    color: var(--el-color-danger, #f56c6c);
    background: rgba(245, 108, 108, 0.14);
  }
}

.health-pane__body {
  min-height: 120px;
}

/* 异常装饰码 E：与资源树叶子 .tree-node__mark.is-error 同形制（字重/字号/圆角/语义色） */
.health-pane__mark {
  flex-shrink: 0;
  min-width: 12px;
  padding: 0 3px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
  color: var(--el-color-danger, #f56c6c);
}

/* 失败行：错误文本是多行块，行内容需顶对齐（默认居中会让 E 码悬在半空）；
   右侧留出三点菜单的位置（.db-row__more 绝对定位在行右上角），
   否则展开的错误文本会从按钮下面穿过去 */
.health-fail {
  align-items: flex-start;
  padding-right: 44px;
}

.health-fail__code {
  font-family: var(--db-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

/* 行内错误附注：弱于行名，等宽 + 保留换行；不额外加底色/边框，视觉仍是「一行一条」 */
.health-fail__error {
  margin: 6px 0 0;
  font-family: var(--db-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.health-ok__icon {
  font-size: 16px;
  color: #2dd288;
}

.health-empty {
  padding: 32px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
}

.health-empty__icon {
  font-size: 28px;
  color: #2dd288;
}

.health-empty__title {
  margin: 8px 0 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--db-ink, #1c1c1e);
}

.health-empty__hint {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>