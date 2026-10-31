<!--
  监控大盘 pane（2026-10-20 管理页 tab 化，databus-workspace-tabs.md §10 步骤4）。
  整体平移自原 monitor/index.vue：8 指标卡片（含环比）+ 量质/速度双趋势图 + 链路健康全景表
  + 三排行榜 + 实时错误流。既是工作台 monitor-overview tab 的内容，也是路由瘦壳
  （monitor/index.vue）的内核，故：
    - 无路由依赖、不 import Layout、不自行 router.push；「告警中」卡片点击一律 emit('open-alert')
    - active prop：工作台用 v-show 保活，非激活 tab 处于 display:none，echarts 此时 init 得到 0×0，
      故激活时重渲染图表（同 ChainCanvasPane 的 :active 约定）
  - 数据源：小时聚合宽表（databus_metric_*_hourly）只读；实时错误流读原始总账 databus_execution。
  - P95/P99 口径：小时桶分位不可跨桶/跨链加权合并，窗口卡片取窗口内最劣值、趋势图取桶内值（后端口径）。
  - 空数据优先：未跑链路/未聚合时大盘从零展示，卡片显示占位、图表区给空态而非崩图。
  - 手动聚合入口聚合「当前小时桶」便于跑完即对数（部分数据，hh:05 定时任务幂等定稿）。
-->
<template>
  <div class="monitor-pane">
    <div class="monitor-pane__scroll">
      <div class="monitor-pane__inner">
        <!-- 顶部标题栏 -->
        <div class="page-header">
          <div class="page-title-wrap">
            <h2 class="page-title">监控大盘</h2>
            <p class="page-subtitle">
              卡片、趋势和排行榜每小时自动统计一次；刚执行完的链路点「手动聚合」立刻可见。下方错误流实时更新。
            </p>
          </div>
          <div class="header-actions">
            <div class="seg-control" role="group" aria-label="时间范围">
              <button
                v-for="p in WINDOW_PRESETS"
                :key="p.value"
                type="button"
                class="seg-item"
                :class="{ active: !customRange && hours === p.value }"
                :disabled="loading"
                @click="selectPreset(p.value)"
              >
                {{ p.label }}
              </button>
              <el-popover
                v-model:visible="rangeVisible"
                placement="bottom-end"
                :width="320"
                trigger="click"
                :teleported="false"
              >
                <template #reference>
                  <button
                    type="button"
                    class="seg-item seg-item-custom"
                    :class="{ active: !!customRange }"
                    :disabled="loading"
                    :title="customTitle"
                  >
                    {{ customLabel }}
                  </button>
                </template>
                <div class="shortcut-list">
                  <button
                    v-for="s in CUSTOM_SHORTCUTS"
                    :key="s.value"
                    type="button"
                    class="shortcut-chip"
                    @click="applyShortcut(s.value)"
                  >
                    {{ s.label }}
                  </button>
                </div>
                <el-date-picker
                  v-model="customRange"
                  type="daterange"
                  value-format="YYYY-MM-DD"
                  :teleported="false"
                  start-placeholder="开始日期"
                  end-placeholder="结束日期"
                  style="width: 100%"
                  @change="handleCustomRange"
                />
              </el-popover>
            </div>
            <el-button :loading="loading" @click="reload">
              <el-icon><Refresh /></el-icon>
              <span>刷新</span>
            </el-button>
            <el-button
              v-hasPermi="['databus:monitor:aggregate']"
              type="primary"
              :loading="aggregating"
              @click="handleAggregate"
            >
              <el-icon><DataLine /></el-icon>
              <span>手动聚合</span>
            </el-button>
          </div>
        </div>

        <!-- 指标卡片（8 宫格） -->
        <div class="metric-grid">
          <div
            v-for="card in metricCards"
            :key="card.key"
            class="metric-card"
            :class="{ 'is-clickable': !!card.onClick }"
            @click="card.onClick?.()"
          >
            <svg
              v-if="card.spark.length > 0"
              class="metric-spark"
              width="60"
              height="24"
              viewBox="0 0 60 24"
              aria-hidden="true"
            >
              <!-- 两点以上画折线；只有单点时只画端点，不伪造趋势 -->
              <polyline
                v-if="card.spark.length > 1"
                :points="sparkPoints(card.spark)"
                fill="none"
                :stroke="card.sparkColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <circle v-else cx="57" cy="12" r="2" :fill="card.sparkColor" />
            </svg>
            <div class="metric-head">
              <span class="metric-label">{{ card.label }}</span>
              <Icon class="metric-icon" :icon="`lucide:${card.icon}`" />
            </div>
            <div class="metric-value" :class="card.valueClass">
              {{ card.value }}
              <span v-if="card.suffix" class="metric-suffix">{{ card.suffix }}</span>
            </div>
            <div class="metric-foot">
              <span class="metric-foot-label">{{ card.deltaLabel ?? '环比' }}</span>
              <span class="metric-delta" :class="card.deltaClass">{{ card.deltaText }}</span>
            </div>
          </div>
        </div>

        <!-- 趋势双图：量质 + 速度 -->
        <div class="trend-grid">
          <el-card shadow="never" class="panel">
            <template #header>
              <div class="panel-head">
                <span class="panel-title">量质趋势</span>
                <span class="panel-sub">窗口内按小时聚合：成功/失败次数（左轴）与成功率（右轴）</span>
              </div>
            </template>
            <div class="trend-wrap">
              <div v-show="hasTrend" ref="volumeEl" class="trend-chart" />
              <el-empty
                v-if="!hasTrend"
                description="窗口内暂无聚合数据（执行链路后点「手动聚合」立即出数，或等整点定时聚合）"
              />
            </div>
          </el-card>

          <el-card shadow="never" class="panel">
            <template #header>
              <div class="panel-head">
                <span class="panel-title">耗时趋势</span>
                <span class="panel-sub">平均 / P95 / P99（毫秒）；P95/P99 取桶内各链路最劣值</span>
              </div>
            </template>
            <div class="trend-wrap">
              <div v-show="hasTrend" ref="speedEl" class="trend-chart" />
              <el-empty v-if="!hasTrend" description="窗口内暂无聚合数据" />
            </div>
          </el-card>
        </div>

        <!-- 链路健康全景 -->
        <el-card shadow="never" class="panel">
          <template #header>
            <div class="panel-head">
              <span class="panel-title">链路健康</span>
              <span class="panel-sub">窗口内每个链路的量质速度全景（按调用量倒序，成功率低于 90% 标红）</span>
            </div>
          </template>
          <el-table v-if="chainHealth.length > 0" :data="chainHealth" size="small">
            <el-table-column prop="chainCode" label="链路编码" min-width="170" show-overflow-tooltip>
              <template #default="{ row }"><span class="mono">#{{ row.chainCode }}</span></template>
            </el-table-column>
            <el-table-column prop="totalCount" label="调用量" width="90" align="right" />
            <el-table-column prop="successCount" label="成功" width="80" align="right" />
            <el-table-column prop="failedCount" label="失败" width="80" align="right">
              <template #default="{ row }">
                <span :class="{ 'text-bad': row.failedCount > 0 }">{{ row.failedCount }}</span>
              </template>
            </el-table-column>
            <el-table-column label="成功率" width="110" align="right">
              <template #default="{ row }">
                <span :class="{ 'rate-bad': isBadRate(row.successRate) }">{{ formatRate(row.successRate) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="平均耗时" width="110" align="right">
              <template #default="{ row }">{{ formatDuration(row.avgDuration) }}</template>
            </el-table-column>
            <el-table-column label="P95 耗时" width="110" align="right">
              <template #default="{ row }">{{ formatDuration(row.p95Duration) }}</template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="窗口内暂无链路执行" :image-size="80" />
        </el-card>

        <!-- 排行榜：失败榜表格 + 节点耗时/错误热点条形图 -->
        <div class="rank-grid">
          <el-card shadow="never" class="panel">
            <template #header>
              <div class="panel-head">
                <span class="panel-title">链路失败 Top</span>
                <span class="panel-sub">失败次数倒序</span>
              </div>
            </template>
            <el-table :data="ranking.chainFailures" size="small" :show-header="true" empty-text="暂无失败链路">
              <el-table-column prop="chainCode" label="链路编码" min-width="150" show-overflow-tooltip>
                <template #default="{ row }"><span class="mono">#{{ row.chainCode }}</span></template>
              </el-table-column>
              <el-table-column prop="failedCount" label="失败" width="70" align="right" />
              <el-table-column prop="totalCount" label="总数" width="70" align="right" />
              <el-table-column label="成功率" width="90" align="right">
                <template #default="{ row }">{{ formatRate(row.successRate) }}</template>
              </el-table-column>
            </el-table>
          </el-card>

          <el-card shadow="never" class="panel">
            <template #header>
              <div class="panel-head">
                <span class="panel-title">节点耗时 Top</span>
                <span class="panel-sub">平均耗时倒序（前 8）</span>
              </div>
            </template>
            <div v-show="slowNodeList.length > 0" ref="nodeBarEl" class="bar-chart" />
            <el-empty v-if="slowNodeList.length === 0" description="暂无节点明细（FULL 档才有）" :image-size="80" />
          </el-card>

          <el-card shadow="never" class="panel">
            <template #header>
              <div class="panel-head">
                <span class="panel-title">错误热点 Top</span>
                <span class="panel-sub">同指纹归并计数（前 8）</span>
              </div>
            </template>
            <div v-show="hotErrorList.length > 0" ref="errorBarEl" class="bar-chart" />
            <el-empty v-if="hotErrorList.length === 0" description="暂无错误" :image-size="80" />
          </el-card>
        </div>

        <!-- 实时错误流 -->
        <el-card shadow="never" class="panel">
          <template #header>
            <div class="panel-head">
              <span class="panel-title">实时错误流</span>
              <span class="panel-sub">最近失败执行（直读总账，不等整点聚合）</span>
            </div>
          </template>
          <div v-if="errorStream.length === 0" class="stream-empty">
            <el-empty description="暂无失败执行" :image-size="80" />
          </div>
          <div v-else class="stream-list">
            <div v-for="item in errorStream" :key="String(item.id)" class="stream-item">
              <div class="stream-line1">
                <el-tag type="danger" size="small" effect="plain">FAILED</el-tag>
                <span class="mono stream-chain">#{{ item.chainCode }}</span>
                <span class="stream-time">{{ formatTime(item.startTime) }}</span>
                <span class="stream-duration">{{ formatDuration(item.duration) }}</span>
              </div>
              <div class="stream-msg">{{ item.errorMsg || '（无错误信息）' }}</div>
            </div>
          </div>
        </el-card>
      </div>
    </div>
  </div>
</template>

<script setup name="MonitorPane" lang="ts">
import { DataLine, Refresh } from '@element-plus/icons-vue';
import { Icon } from '@iconify/vue';
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';
import * as echarts from 'echarts';
import { ElMessage } from 'element-plus';
import {
  monitorAggregate,
  monitorChainHealth,
  monitorErrorStream,
  monitorOverview,
  monitorRanking,
  monitorTrend
} from '@/api/databus/monitor';
import type {
  ChainHealthVo,
  MetricAggregateVo,
  MonitorErrorStreamVo,
  MonitorOverviewVo,
  MonitorRankingVo,
  MonitorTrendPointVo
} from '@/api/databus/monitor/types';
import { useLoading } from '@/hooks/async/useLoading';
import { usePersisted } from '@/views/databus/workbench/composables/usePersisted';

// 离线注入 lucide 子集，避免运行时联网拉图标
useLucideSubset();

/**
 * 监控大盘 pane：8 卡片 + 量质/速度双趋势图 + 链路健康全景 + 排行榜 + 错误流。
 * 空数据是正常态（链路未跑/未到整点聚合），所有区块给空态占位，图表仅在有点时初始化，避免崩图。
 */

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true });

const emit = defineEmits<{ (e: 'open-alert'): void }>();

interface WindowPreset {
  value: number;
  label: string;
}

/** 高频区间做成常驻分段项，低频区间走「自定义」日期范围 */
const WINDOW_PRESETS: WindowPreset[] = [
  { value: 1, label: '1 小时' },
  { value: 6, label: '6 小时' },
  { value: 24, label: '24 小时' },
  { value: 168, label: '7 天' }
];

const toDateStr = (ts: number) => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * 时间窗口选项：持久化「选项」而非「时间点」。昨天的日期今天看就是旧值，
 * 预设/快捷项必须按当前时刻重算，绝对日历区间才会原样保存。
 *  - preset：常驻分段项（1/6/24/168 小时）
 *  - shortcut：自定义弹层里的相对快捷项（12/48/72/336/720 小时）
 *  - custom：手动勾选的绝对日期区间
 */
type WindowSelection =
  | { kind: 'preset'; hours: number }
  | { kind: 'shortcut'; hours: number }
  | { kind: 'custom'; range: [string, string]; hours: number };

const selection = usePersisted<WindowSelection>('databus.monitor.window', {
  kind: 'preset',
  hours: 24
});

/** 按持久化选项反推初始自定义区间：快捷项按 now 重算，预置项为空，绝对区间原样 */
const restoreCustomRange = (sel: WindowSelection): string[] | null => {
  if (sel.kind === 'custom') {
    return sel.range;
  }
  if (sel.kind === 'shortcut') {
    const end = Date.now();
    return [toDateStr(end - sel.hours * 3600000), toDateStr(end)];
  }
  return null;
};

const hours = ref(selection.value.hours);
/** 自定义区间（YYYY-MM-DD 两个值），为空时表示用预设区间 */
const customRange = ref<string[] | null>(restoreCustomRange(selection.value));
/** 自定义弹层显隐，点快捷项后需要手动关掉 */
const rangeVisible = ref(false);

/** 自定义弹层里的常用区间：与分段项的 1 小时 / 6 小时 / 24 小时 / 7 天不重复 */
const CUSTOM_SHORTCUTS: WindowPreset[] = [
  { value: 12, label: '最近 12 小时' },
  { value: 48, label: '最近 2 天' },
  { value: 72, label: '最近 3 天' },
  { value: 336, label: '最近 14 天' },
  { value: 720, label: '最近 30 天' }
];

/** 点快捷区间：按「当前时刻往前推 N 小时」算，顺手把按钮文案换成实际日期；只持久化选项 */
const applyShortcut = (h: number) => {
  const end = Date.now();
  customRange.value = [toDateStr(end - h * 3600000), toDateStr(end)];
  hours.value = h;
  selection.value = { kind: 'shortcut', hours: h };
  rangeVisible.value = false;
  reload();
};

/** 按钮文案只留 MM-DD，避免日期全量展开把分段控件撑宽、挤掉后面的按钮 */
const shortDate = (date: string) => (date ?? '').slice(5);

const customLabel = computed(() =>
  customRange.value
    ? `${shortDate(customRange.value[0])} ~ ${shortDate(customRange.value[1])}`
    : '自定义'
);

const customTitle = computed(() =>
  customRange.value ? customRange.value.join(' ~ ') : '自定义时间范围'
);

const selectPreset = (value: number) => {
  const changed = hours.value !== value || !!customRange.value;
  customRange.value = null;
  hours.value = value;
  selection.value = { kind: 'preset', hours: value };
  if (changed) {
    reload();
  }
};

/** 日期范围折算成小时数：起止都含当天的 24 小时 */
const handleCustomRange = (value: string[] | null) => {
  if (!value || value.length !== 2) {
    customRange.value = null;
    selection.value = { kind: 'preset', hours: hours.value };
    return;
  }
  const start = new Date(`${value[0]}T00:00:00`).getTime();
  const end = new Date(`${value[1]}T23:59:59`).getTime();
  hours.value = Math.max(24, Math.round((end - start) / 3600000));
  selection.value = { kind: 'custom', range: [value[0], value[1]], hours: hours.value };
  reload();
};
const { loading, withLoading } = useLoading(true);

const overview = ref<MonitorOverviewVo | null>(null);
const trend = ref<MonitorTrendPointVo[]>([]);
const chainHealth = ref<ChainHealthVo[]>([]);
const ranking = ref<MonitorRankingVo>({
  hours: 24,
  topN: 10,
  chainFailures: [],
  slowNodes: [],
  hotErrors: []
});
const errorStream = ref<MonitorErrorStreamVo[]>([]);

const volumeEl = ref<HTMLDivElement>();
const speedEl = ref<HTMLDivElement>();
const nodeBarEl = ref<HTMLDivElement>();
const errorBarEl = ref<HTMLDivElement>();
let volumeInstance: echarts.ECharts | undefined;
let speedInstance: echarts.ECharts | undefined;
let nodeBarInstance: echarts.ECharts | undefined;
let errorBarInstance: echarts.ECharts | undefined;

const hasTrend = computed(() => trend.value.length > 0);
const slowNodeList = computed(() => ranking.value.slowNodes.slice(0, 8));
const hotErrorList = computed(() => ranking.value.hotErrors.slice(0, 8));

/* ------------------------------ 卡片数据 ------------------------------ */

/**
 * 环比百分比：上一窗口为 0/空时无法计算，返回 null 表示「无对比基准」。
 */
const deltaPercent = (cur?: number | null, prev?: number | null): number | null => {
  if (cur === null || cur === undefined || prev === null || prev === undefined || prev === 0) {
    return null;
  }
  return ((cur - prev) / prev) * 100;
};

/**
 * 环比展示：升/降箭头 + 数值；无基准显示「—」。
 * @param inverse 为 true 时「上升」视为变差（如失败次数、耗时）
 */
const buildDelta = (cur?: number | null, prev?: number | null, inverse = false) => {
  const pct = deltaPercent(cur, prev);
  if (pct === null) {
    return { text: '—', cls: 'delta-flat' };
  }
  const rounded = Math.abs(pct) < 0.05 ? 0 : pct;
  if (rounded === 0) {
    return { text: '持平', cls: 'delta-flat' };
  }
  const up = rounded > 0;
  const better = inverse ? !up : up;
  return {
    text: `${up ? '↑' : '↓'} ${Math.abs(rounded).toFixed(1)}%`,
    cls: better ? 'delta-good' : 'delta-bad'
  };
};

interface MetricCard {
  key: string;
  label: string;
  icon: string;
  value: string;
  suffix: string;
  valueClass: string;
  deltaLabel?: string;
  deltaText: string;
  deltaClass: string;
  /** 趋势小图数据（来自整点聚合序列），少于 2 个点不画 */
  spark: number[];
  /** 小图描边色，跟随指标语义 */
  sparkColor: string;
  onClick?: () => void;
}

/**
 * 趋势小图路径：min-max 归一化铺满高度（60×24），与原型 E 的 sparklineSVG 同口径。
 * 只算坐标，颜色与透明度由样式控制。
 */
function sparkPoints(data: number[], w = 60, h = 24): string {
  if (data.length < 2) {
    return '';
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  return data
    .map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(' ');
}

const metricCards = computed<MetricCard[]>(() => {
  const o = overview.value;
  const total = buildDelta(o?.totalCount, o?.prevTotalCount);
  const failed = buildDelta(o?.failedCount, o?.prevFailedCount, true);
  const avg = buildDelta(o?.avgDuration, o?.prevAvgDuration, true);
  const p95 = buildDelta(o?.p95Duration, o?.prevP95Duration, true);
  const p99 = buildDelta(o?.p99Duration, o?.prevP99Duration, true);
  const chains = buildDelta(o?.activeChainCount, o?.prevActiveChainCount);
  // 成功率为百分比绝对差（百分点），不走百分比环比
  const rateCur = o?.successRate != null ? Number(o.successRate) : null;
  const ratePrev = o?.prevSuccessRate != null ? Number(o.prevSuccessRate) : null;
  const rateDelta =
    rateCur != null && ratePrev != null
      ? {
          text: `${rateCur >= ratePrev ? '↑' : '↓'} ${Math.abs(rateCur - ratePrev).toFixed(2)}pp`,
          cls: rateCur >= ratePrev ? 'delta-good' : 'delta-bad'
        }
      : { text: '—', cls: 'delta-flat' };
  const firing = o?.firingAlertCount ?? 0;

  // 各指标的趋势序列（整点聚合，null 视为缺样本剔除，避免把缺失画成 0）
  const series = {
    total: trend.value.map((p) => p.totalCount),
    rate: trend.value
      .map((p) => p.successRate)
      .filter((v) => v != null)
      .map((v) => Number(v)),
    failed: trend.value.map((p) => p.failedCount),
    duration: trend.value.map((p) => p.avgDuration).filter((v): v is number => v != null),
    p95: trend.value.map((p) => p.p95Duration).filter((v): v is number => v != null),
    p99: trend.value.map((p) => p.p99Duration).filter((v): v is number => v != null),
    chains: trend.value.map((p) => p.chainCount).filter((v): v is number => v != null)
  };

  return [
    {
      key: 'total',
      label: '执行总次数',
      icon: 'chart-line',
      spark: series.total,
      sparkColor: 'var(--db-blue, #007aff)',
      value: formatInt(o?.totalCount),
      suffix: '',
      valueClass: '',
      deltaText: total.text,
      deltaClass: total.cls
    },
    {
      key: 'rate',
      label: '成功率',
      icon: 'circle-check',
      spark: series.rate,
      sparkColor: 'var(--db-green, #34c759)',
      value: o?.successRate != null ? Number(o.successRate).toFixed(2) : '—',
      suffix: o?.successRate != null ? '%' : '',
      valueClass: rateCur != null && rateCur < 90 ? 'value-warn' : 'value-good',
      deltaText: rateDelta.text,
      deltaClass: rateDelta.cls
    },
    {
      key: 'failed',
      label: '失败次数',
      icon: 'circle-x',
      spark: series.failed,
      sparkColor: 'var(--db-red, #ff3b30)',
      value: formatInt(o?.failedCount),
      suffix: '',
      valueClass: o && o.failedCount > 0 ? 'value-bad' : '',
      deltaText: failed.text,
      deltaClass: failed.cls
    },
    {
      key: 'duration',
      label: '平均耗时',
      icon: 'timer',
      spark: series.duration,
      sparkColor: 'var(--db-blue, #007aff)',
      value: formatDuration(o?.avgDuration),
      suffix: '',
      valueClass: '',
      deltaText: avg.text,
      deltaClass: avg.cls
    },
    {
      key: 'p95',
      label: 'P95 耗时',
      icon: 'gauge',
      spark: series.p95,
      sparkColor: 'var(--db-blue, #007aff)',
      value: formatDuration(o?.p95Duration),
      suffix: '',
      valueClass: '',
      deltaText: p95.text,
      deltaClass: p95.cls
    },
    {
      key: 'p99',
      label: 'P99 耗时',
      icon: 'alarm-clock',
      spark: series.p99,
      sparkColor: 'var(--db-blue, #007aff)',
      value: formatDuration(o?.p99Duration),
      suffix: '',
      valueClass: '',
      deltaText: p99.text,
      deltaClass: p99.cls
    },
    {
      key: 'chains',
      label: '活跃链路',
      icon: 'link',
      spark: series.chains,
      sparkColor: 'var(--db-gray, #8e8e93)',
      value: formatInt(o?.activeChainCount),
      suffix: '',
      valueClass: '',
      deltaText: chains.text,
      deltaClass: chains.cls
    },
    {
      key: 'firing',
      label: '告警中',
      icon: 'bell',
      spark: [], // 告警数不在整点聚合序列里，无趋势可画
      sparkColor: 'var(--db-red, #ff3b30)',
      value: formatInt(firing),
      suffix: '',
      valueClass: firing > 0 ? 'value-bad' : 'value-good',
      deltaLabel: '实时',
      deltaText: firing > 0 ? '有告警待处理' : '一切正常',
      deltaClass: firing > 0 ? 'delta-bad' : 'delta-flat',
      onClick: () => emit('open-alert')
    }
  ];
});

/* ------------------------------ 趋势图 ------------------------------ */

const disposeChart = (instance?: echarts.ECharts) => {
  instance?.dispose();
  return undefined;
};

/* ------------------------------ 图表皮肤（Apple 风格） ------------------------------ */

const cssVar = (el: HTMLElement, name: string, fallback: string) => {
  const value = getComputedStyle(el).getPropertyValue(name).trim();
  return value || fallback;
};

/** 从容器继承 --db-* 令牌，明暗主题自动跟随，不写死颜色 */
const chartSkin = (el: HTMLElement) => ({
  ink: cssVar(el, '--db-ink', '#1c1c1e'),
  inkMuted: cssVar(el, '--db-ink-muted', '#6e6e73'),
  rule: cssVar(el, '--db-rule', 'rgba(60, 60, 67, 0.12)'),
  surface: cssVar(el, '--db-bg-solid', '#ffffff')
});

type ChartSkin = ReturnType<typeof chartSkin>;

/** 坐标轴：干掉轴线和刻度，只留极浅分隔线 */
const axisSkin = (skin: ChartSkin, withSplitLine = true) => ({
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: skin.inkMuted, fontSize: 11 },
  splitLine: withSplitLine ? { lineStyle: { color: skin.rule, width: 1 } } : { show: false }
});

/** 提示框：白卡片 + 12px 圆角 + 柔和投影 */
const tooltipSkin = (skin: ChartSkin) => ({
  backgroundColor: skin.surface,
  borderWidth: 0,
  borderRadius: 12,
  padding: [10, 12],
  textStyle: { color: skin.ink, fontSize: 12 },
  extraCssText: 'box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12); border-radius: 12px;'
});

/** 图例：小圆点 + 11px 弱化文字，不要默认的方形图标 */
const legendSkin = (skin: ChartSkin) => ({
  icon: 'circle',
  itemWidth: 8,
  itemHeight: 8,
  itemGap: 16,
  top: 0,
  right: 0,
  textStyle: { color: skin.inkMuted, fontSize: 11 }
});

/** 面积渐变：顶部有色 → 底部透明 */
const areaFill = (rgb: string, alpha = 0.18) =>
  new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: `rgba(${rgb}, ${alpha})` },
    { offset: 1, color: `rgba(${rgb}, 0)` }
  ]);

const renderVolumeChart = () => {
  volumeInstance = disposeChart(volumeInstance);
  if (!hasTrend.value || !volumeEl.value) {
    return;
  }
  const skin = chartSkin(volumeEl.value);
  volumeInstance = echarts.init(volumeEl.value);
  const points = trend.value;
  volumeInstance.setOption(
    {
      color: ['#007AFF', '#FF3B30', '#34C759'],
      grid: { left: 8, right: 8, top: 34, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: skin.rule } },
        ...tooltipSkin(skin)
      },
      legend: { data: ['成功', '失败', '成功率'], ...legendSkin(skin) },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: points.map((p) => formatHour(p.statHour)),
        ...axisSkin(skin, false)
      },
      yAxis: [
        { type: 'value', minInterval: 1, ...axisSkin(skin) },
        {
          type: 'value',
          min: 0,
          max: 100,
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { formatter: '{value}%', color: skin.inkMuted, fontSize: 11 }
        }
      ],
      series: [
        {
          name: '成功',
          type: 'line',
          smooth: 0.35,
          symbol: 'none',
          stack: 'count',
          lineStyle: { width: 2 },
          areaStyle: { color: areaFill('0, 122, 255', 0.16) },
          emphasis: { focus: 'series' },
          data: points.map((p) => p.successCount ?? 0)
        },
        {
          name: '失败',
          type: 'line',
          smooth: 0.35,
          symbol: 'none',
          stack: 'count',
          lineStyle: { width: 2 },
          areaStyle: { color: areaFill('255, 59, 48', 0.16) },
          emphasis: { focus: 'series' },
          data: points.map((p) => p.failedCount ?? 0)
        },
        {
          name: '成功率',
          type: 'line',
          yAxisIndex: 1,
          smooth: 0.35,
          symbol: 'none',
          connectNulls: true,
          lineStyle: { width: 1.5 },
          emphasis: { focus: 'series' },
          data: points.map((p) => (p.successRate != null ? Number(p.successRate) : null))
        }
      ]
    },
    true
  );
};

const renderSpeedChart = () => {
  speedInstance = disposeChart(speedInstance);
  if (!hasTrend.value || !speedEl.value) {
    return;
  }
  const skin = chartSkin(speedEl.value);
  speedInstance = echarts.init(speedEl.value);
  const points = trend.value;
  speedInstance.setOption(
    {
      color: ['#007AFF', '#FF9500', '#FF3B30'],
      grid: { left: 8, right: 8, top: 34, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: skin.rule } },
        valueFormatter: (v: unknown) => formatDuration(Number(v)),
        ...tooltipSkin(skin)
      },
      legend: { data: ['平均', 'P95', 'P99'], ...legendSkin(skin) },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: points.map((p) => formatHour(p.statHour)),
        ...axisSkin(skin, false)
      },
      yAxis: { type: 'value', ...axisSkin(skin) },
      series: [
        {
          name: '平均',
          type: 'line',
          smooth: 0.35,
          symbol: 'none',
          connectNulls: true,
          lineStyle: { width: 2 },
          areaStyle: { color: areaFill('0, 122, 255', 0.14) },
          emphasis: { focus: 'series' },
          data: points.map((p) => p.avgDuration ?? null)
        },
        {
          name: 'P95',
          type: 'line',
          smooth: 0.35,
          symbol: 'none',
          connectNulls: true,
          lineStyle: { width: 1.5 },
          emphasis: { focus: 'series' },
          data: points.map((p) => p.p95Duration ?? null)
        },
        {
          name: 'P99',
          type: 'line',
          smooth: 0.35,
          symbol: 'none',
          connectNulls: true,
          lineStyle: { width: 1.5 },
          emphasis: { focus: 'series' },
          data: points.map((p) => p.p99Duration ?? null)
        }
      ]
    },
    true
  );
};

/* ------------------------------ 排行榜条形图 ------------------------------ */

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

const escapeHtml = (s?: string | null) => (s ?? '').replace(/[&<>"']/g, (c) => ESCAPE_MAP[c] ?? c);

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s);

const renderNodeBar = () => {
  nodeBarInstance = disposeChart(nodeBarInstance);
  const nodes = slowNodeList.value;
  if (nodes.length === 0 || !nodeBarEl.value) {
    return;
  }
  const skin = chartSkin(nodeBarEl.value);
  nodeBarInstance = echarts.init(nodeBarEl.value);
  nodeBarInstance.setOption(
    {
      grid: { left: 8, right: 40, top: 8, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const n = nodes[p.dataIndex];
          if (!n) return '';
          return [
            `<b>${escapeHtml(n.tag)}</b> <span style="color:${skin.inkMuted}">${escapeHtml(n.nodeType)}</span>`,
            `链路：#${escapeHtml(n.chainCode)}`,
            `平均：${formatDuration(n.avgDuration)} / 最大：${formatDuration(n.maxDuration)}`,
            `调用：${n.totalCount} 次`
          ].join('<br/>');
        },
        ...tooltipSkin(skin)
      },
      xAxis: { type: 'value', ...axisSkin(skin) },
      yAxis: {
        type: 'category',
        inverse: true,
        data: nodes.map((_, i) => `#${i + 1}`),
        ...axisSkin(skin, false),
        axisLabel: {
          color: skin.inkMuted,
          fontSize: 11,
          formatter: (val: string) => {
            const n = nodes[Number(val.slice(1)) - 1];
            return truncate(n ? n.tag : val, 12);
          }
        }
      },
      series: [
        {
          name: '平均耗时',
          type: 'bar',
          barWidth: 8,
          showBackground: true,
          backgroundStyle: { color: 'rgba(120, 120, 128, 0.08)', borderRadius: [0, 4, 4, 0] },
          itemStyle: {
            borderRadius: [0, 4, 4, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: 'rgba(0, 122, 255, 0.55)' },
              { offset: 1, color: '#007AFF' }
            ])
          },
          data: nodes.map((n) => n.avgDuration ?? 0)
        }
      ]
    },
    true
  );
};

const renderErrorBar = () => {
  errorBarInstance = disposeChart(errorBarInstance);
  const rows = hotErrorList.value;
  if (rows.length === 0 || !errorBarEl.value) {
    return;
  }
  const skin = chartSkin(errorBarEl.value);
  errorBarInstance = echarts.init(errorBarEl.value);
  errorBarInstance.setOption(
    {
      grid: { left: 8, right: 40, top: 8, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const r = rows[p.dataIndex];
          if (!r) return '';
          return [
            `<b>${escapeHtml(r.errorFingerprint)}</b>`,
            `链路：#${escapeHtml(r.chainCode)}`,
            `发生：${r.happenCount} 次`
          ].join('<br/>');
        },
        ...tooltipSkin(skin)
      },
      xAxis: { type: 'value', minInterval: 1, ...axisSkin(skin) },
      yAxis: {
        type: 'category',
        inverse: true,
        data: rows.map((_, i) => `#${i + 1}`),
        ...axisSkin(skin, false),
        axisLabel: {
          color: skin.inkMuted,
          fontSize: 11,
          formatter: (val: string) => {
            const r = rows[Number(val.slice(1)) - 1];
            return truncate(r ? r.errorFingerprint : val, 16);
          }
        }
      },
      series: [
        {
          name: '发生次数',
          type: 'bar',
          barWidth: 8,
          showBackground: true,
          backgroundStyle: { color: 'rgba(120, 120, 128, 0.08)', borderRadius: [0, 4, 4, 0] },
          itemStyle: {
            borderRadius: [0, 4, 4, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: 'rgba(255, 59, 48, 0.55)' },
              { offset: 1, color: '#FF3B30' }
            ])
          },
          data: rows.map((r) => r.happenCount ?? 0)
        }
      ]
    },
    true
  );
};

/* ------------------------------ 加载 ------------------------------ */

const renderCharts = async () => {
  await nextTick();
  renderVolumeChart();
  renderSpeedChart();
  renderNodeBar();
  renderErrorBar();
};

const reload = async () => {
  await withLoading(async () => {
    const [ovRes, trendRes, healthRes, rankRes, streamRes] = await Promise.all([
      monitorOverview(hours.value),
      monitorTrend(hours.value),
      monitorChainHealth(hours.value),
      monitorRanking(hours.value),
      monitorErrorStream(20)
    ]);
    overview.value = ovRes.data ?? null;
    trend.value = trendRes.data ?? [];
    chainHealth.value = healthRes.data ?? [];
    ranking.value =
      rankRes.data ?? { hours: hours.value, topN: 10, chainFailures: [], slowNodes: [], hotErrors: [] };
    errorStream.value = streamRes.data ?? [];
  });
  await renderCharts();
};

const aggregating = ref(false);

/**
 * 当前整点小时参数（后端按 yyyy-MM-ddTHH:mm:ss 解析后截断到小时）。
 * 手动聚合默认只补上一个完整小时，测试/对数场景要看当前小时必须显式传当前桶；
 * 该桶为部分数据，hh:05 定时任务会用上一小时全量数据幂等覆盖。
 */
const currentHourParam = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00:00`;
};

const handleAggregate = async () => {
  aggregating.value = true;
  try {
    const res = await monitorAggregate(currentHourParam());
    const data: MetricAggregateVo = res.data;
    ElMessage.success(
      `${formatTime(data.statHour).slice(0, 16)} 起的数据已统计（本小时数据每小时第 5 分钟自动重算）：链路 ${data.chainRows} 行 / 节点 ${data.nodeRows} 行 / 错误 ${data.errorRows} 行，耗时 ${data.costMillis} ms`
    );
    await reload();
  } finally {
    aggregating.value = false;
  }
};

/* ------------------------------ 格式化 ------------------------------ */

const formatInt = (n?: number | null) => (n === null || n === undefined ? '—' : String(n));

const formatRate = (r?: number | string | null) => (r === null || r === undefined ? '—' : `${Number(r).toFixed(2)}%`);

/**
 * 成功率是否低于 90%（链路健康/失败榜标红阈值）。
 */
const isBadRate = (r?: number | string | null) => {
  if (r === null || r === undefined) return false;
  return Number(r) < 90;
};

const formatDuration = (ms?: number | null) => {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(3)} s`;
};

const formatTime = (t?: string | null) => {
  if (!t) return '-';
  return t.replace('T', ' ').slice(0, 19);
};

const formatHour = (t: string) => {
  if (!t) return '';
  return t.replace('T', ' ').slice(5, 16);
};

/* ------------------------------ 生命周期 ------------------------------ */

const handleResize = () => {
  volumeInstance?.resize();
  speedInstance?.resize();
  nodeBarInstance?.resize();
  errorBarInstance?.resize();
};

// 工作台非激活 tab 处于 display:none，echarts 此时 init 得到 0×0，激活时须重渲染（同 ChainCanvasPane）
watch(
  () => props.active,
  (v) => {
    if (v) {
      void renderCharts();
    }
  }
);

onMounted(() => {
  window.addEventListener('resize', handleResize);
  reload();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  volumeInstance = disposeChart(volumeInstance);
  speedInstance = disposeChart(speedInstance);
  nodeBarInstance = disposeChart(nodeBarInstance);
  errorBarInstance = disposeChart(errorBarInstance);
});
</script>

<style lang="scss" scoped>
/* pane 骨架：吃满宿主高度，滚动收在内层（外层不出现双滚动条） */
.monitor-pane {
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--db-bg, #f2f2f7);
}

.monitor-pane__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.monitor-pane__inner {
  max-width: 1320px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px 24px 32px;
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

.header-actions {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  flex: 0 0 auto;
  gap: 12px;
}

/* 分段控件：4 个高频区间 + 自定义，一次点击直达（替代 9 项下拉） */
.seg-control {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: var(--db-r-control, 10px);
  background: var(--db-bg-hover, rgba(120, 120, 128, 0.08));
}

.seg-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  padding: 5px 12px;
  border-radius: 8px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
  color: var(--db-ink-muted, #6e6e73);
  cursor: pointer;
  transition: all var(--db-dur-fast, 0.14s) var(--db-ease, ease);

  &:hover:not(:disabled) {
    color: var(--db-ink, #1c1c1e);
  }

  &.active {
    background: var(--db-bg-solid, #ffffff);
    color: var(--db-ink, #1c1c1e);
    box-shadow: var(--db-shadow-xs, 0 1px 2px rgba(0, 0, 0, 0.04));
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

/* 自定义段固定宽度：选中后文案变长也不会把整排按钮挤走 */
.seg-item-custom {
  width: 112px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 自定义弹层里的常用区间快捷项 */
.shortcut-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.shortcut-chip {
  border: 0.5px solid var(--db-rule, rgba(60, 60, 67, 0.12));
  background: transparent;
  padding: 4px 10px;
  border-radius: var(--db-r-pill, 999px);
  font-family: inherit;
  font-size: 12px;
  color: var(--db-ink-secondary, #3a3a3c);
  cursor: pointer;
  transition: all var(--db-dur-fast, 0.14s) var(--db-ease, ease);

  &:hover {
    border-color: var(--db-rule-strong, rgba(60, 60, 67, 0.24));
    background: var(--db-bg-hover, rgba(120, 120, 128, 0.08));
  }
}

/* 指标区：一整块容器，内部用 0.5px 细线分割（不是 8 张独立卡片） */
.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
  background: var(--db-bg-card, #fff);
  backdrop-filter: saturate(180%) blur(18px);
  -webkit-backdrop-filter: saturate(180%) blur(18px);
  border-radius: var(--db-r-card, 14px);
  box-shadow:
    var(--db-shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.06)),
    inset 0 0 0 0.5px var(--db-rule, rgba(60, 60, 67, 0.12));
}

.metric-card {
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: relative;
  box-shadow:
    inset 1px 0 0 var(--db-rule, rgba(60, 60, 67, 0.12)),
    inset 0 1px 0 var(--db-rule, rgba(60, 60, 67, 0.12));
  transition:
    transform var(--db-dur-normal, 0.22s) var(--db-spring, cubic-bezier(0.34, 1.56, 0.64, 1)),
    box-shadow var(--db-dur-normal, 0.22s) var(--db-spring, cubic-bezier(0.34, 1.56, 0.64, 1)),
    background var(--db-dur-normal, 0.22s) var(--db-ease, ease);
}

/* 第一列去掉左线、第一行去掉上线，避免容器边缘出现双线 */
.metric-card:nth-child(4n + 1) {
  box-shadow: inset 0 1px 0 var(--db-rule, rgba(60, 60, 67, 0.12));
}

.metric-card:nth-child(-n + 4) {
  box-shadow: inset 1px 0 0 var(--db-rule, rgba(60, 60, 67, 0.12));
}

/* hover：从整块里浮起来，补回完整圆角 + 大阴影 */
.metric-card.is-clickable {
  cursor: pointer;
}

.metric-card:hover {
  transform: scale(1.025) translateY(-2px);
  border-radius: var(--db-r-card, 14px);
  background: var(--db-bg-solid, #fff);
  box-shadow:
    var(--db-shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.12)),
    inset 0 0 0 0.5px var(--db-rule-strong, rgba(60, 60, 67, 0.24));
  z-index: 5;
}

@media (max-width: 1100px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .metric-card:nth-child(4n + 1) {
    box-shadow:
      inset 1px 0 0 var(--db-rule, rgba(60, 60, 67, 0.12)),
      inset 0 1px 0 var(--db-rule, rgba(60, 60, 67, 0.12));
  }

  .metric-card:nth-child(2n + 1) {
    box-shadow: inset 0 1px 0 var(--db-rule, rgba(60, 60, 67, 0.12));
  }

  .metric-card:nth-child(-n + 2) {
    box-shadow: inset 1px 0 0 var(--db-rule, rgba(60, 60, 67, 0.12));
  }
}

.metric-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.metric-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--db-ink-muted, #6e6e73);
}

/* 趋势小图：右上角，压到 0.4 透明度只做形状提示，不抢数字 */
.metric-spark {
  position: absolute;
  right: var(--db-p-lg, 16px);
  top: 40px;
  opacity: 0.4;
  pointer-events: none;
}

.metric-icon {
  font-size: 18px;
  color: var(--db-ink-muted, #6e6e73);
}

.metric-value {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  color: var(--db-ink, #1c1c1e);
  line-height: 1;
}

.metric-suffix {
  font-size: 15px;
  font-weight: 500;
  margin-left: 2px;
  color: var(--db-ink-muted, #6e6e73);
}

.value-good {
  color: var(--db-green, #34c759);
}

.value-warn {
  color: var(--db-orange, #ff9500);
}

.value-bad {
  color: var(--db-red, #ff3b30);
}

.metric-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.metric-foot-label {
  color: var(--db-ink-muted, #6e6e73);
}

.metric-delta {
  font-family: var(--db-font-mono, 'JetBrains Mono', 'SF Mono', monospace);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.delta-good {
  color: var(--db-green, #34c759);
}

.delta-bad {
  color: var(--db-red, #ff3b30);
}

.delta-flat {
  color: var(--db-ink-muted, #6e6e73);
}

.trend-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 1100px) {
  .trend-grid {
    grid-template-columns: 1fr;
  }
}

.panel {
  border-radius: var(--db-r-card, 14px);
}

.panel-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--db-ink);
}

.panel-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.trend-wrap {
  min-height: 300px;
}

.trend-chart {
  width: 100%;
  height: 300px;
}

.bar-chart {
  width: 100%;
  height: 300px;
}

.rank-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 1100px) {
  .rank-grid {
    grid-template-columns: 1fr;
  }
}

.text-bad {
  color: var(--el-color-danger);
  font-weight: 600;
}

.rate-bad {
  color: var(--el-color-danger);
  font-weight: 700;
}

.mono {
  font-family: var(--db-font-mono);
  font-size: 12px;
}

.stream-empty {
  padding: 8px 0;
}

.stream-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 360px;
  overflow-y: auto;
  overflow-x: hidden;
}

.stream-item {
  padding: 10px 12px;
  border: none;
  border-radius: var(--db-r-control, 10px);
  background: var(--db-bg-solid, #fff);
  box-shadow: inset 0 0 0 0.5px var(--db-rule, rgba(60, 60, 67, 0.12));
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: background var(--db-dur-fast, 0.14s) var(--db-ease, ease);
}

.stream-item:hover {
  background: var(--db-bg-hover, rgba(120, 120, 128, 0.08));
}

.stream-line1 {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stream-chain {
  font-weight: 600;
}

.stream-time {
  font-size: 12px;
  font-family: var(--db-font-mono, 'JetBrains Mono', 'SF Mono', monospace);
  color: var(--db-ink-muted, #6e6e73);
  font-variant-numeric: tabular-nums;
}

.stream-duration {
  margin-left: auto;
  font-size: 12px;
  font-family: var(--db-font-mono, 'JetBrains Mono', 'SF Mono', monospace);
  color: var(--db-ink-muted, #6e6e73);
  font-variant-numeric: tabular-nums;
}

.stream-msg {
  font-size: 12px;
  color: var(--db-red, #ff3b30);
  word-break: break-all;
  line-height: 1.5;
}
</style>