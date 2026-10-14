<!--
  监控大盘（阶段5 · 监控体系）：指标卡片（含环比）+ 趋势折线 + 三排行榜 + 实时错误流。
  - 数据源：小时聚合宽表（databus_metric_*_hourly）只读；实时错误流读原始总账 databus_execution。
  - 空数据优先：未跑链路/未聚合时大盘从零展示，卡片显示占位、趋势区给空态而非崩图。
  - 手动聚合入口聚合「当前小时桶」便于跑完即对数（部分数据，hh:05 定时任务幂等定稿）；
    补算历史小时走 POST /databus/monitor/aggregate?hour=（权限 databus:monitor:aggregate）。
  - 大盘查询窗口上界含进行中的当前小时桶（后端 end=当前整点+1h）。
-->
<template>
  <div class="page-container">
    <div class="page-inner">
      <!-- 顶部标题栏 -->
      <div class="page-header">
        <div class="page-title-wrap">
          <h2 class="page-title">监控大盘</h2>
          <p class="page-subtitle">
            卡片、趋势和排行榜每小时自动统计一次；刚执行完的链路点「手动聚合」立刻可见。下方错误流实时更新。
          </p>
        </div>
        <div class="header-actions">
          <el-select v-model="hours" class="window-select" :disabled="loading" @change="reload">
            <el-option v-for="w in WINDOW_OPTIONS" :key="w.value" :label="w.label" :value="w.value" />
          </el-select>
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

      <!-- 指标卡片 -->
      <div class="metric-grid">
        <div v-for="card in metricCards" :key="card.key" class="metric-card">
          <div class="metric-head">
            <span class="metric-label">{{ card.label }}</span>
            <el-icon class="metric-icon"><component :is="card.icon" /></el-icon>
          </div>
          <div class="metric-value" :class="card.valueClass">
            {{ card.value }}
            <span v-if="card.suffix" class="metric-suffix">{{ card.suffix }}</span>
          </div>
          <div class="metric-foot">
            <span class="metric-foot-label">环比</span>
            <span class="metric-delta" :class="card.deltaClass">{{ card.deltaText }}</span>
          </div>
        </div>
      </div>

      <!-- 趋势 -->
      <el-card shadow="never" class="panel">
        <template #header>
          <div class="panel-head">
            <span class="panel-title">执行趋势</span>
            <span class="panel-sub">窗口内按小时聚合：成功/失败次数（左轴）与成功率（右轴）</span>
          </div>
        </template>
        <div class="trend-wrap">
          <div v-show="hasTrend" ref="trendEl" class="trend-chart" />
          <el-empty
            v-if="!hasTrend"
            description="窗口内暂无聚合数据（执行链路后点「手动聚合」立即出数，或等整点定时聚合）"
          />
        </div>
      </el-card>

      <!-- 三排行榜 -->
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
              <span class="panel-sub">平均耗时倒序</span>
            </div>
          </template>
          <el-table :data="ranking.slowNodes" size="small" empty-text="暂无节点明细（FULL 档才有）">
            <el-table-column label="节点" min-width="170" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="mono">{{ row.tag }}</span>
                <span class="node-type">{{ row.nodeType }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="chainCode" label="链路" width="120" show-overflow-tooltip>
              <template #default="{ row }"><span class="mono">#{{ row.chainCode }}</span></template>
            </el-table-column>
            <el-table-column label="均耗时" width="90" align="right">
              <template #default="{ row }">{{ formatDuration(row.avgDuration) }}</template>
            </el-table-column>
            <el-table-column label="最大" width="90" align="right">
              <template #default="{ row }">{{ formatDuration(row.maxDuration) }}</template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-card shadow="never" class="panel">
          <template #header>
            <div class="panel-head">
              <span class="panel-title">错误热点 Top</span>
              <span class="panel-sub">同指纹归并计数</span>
            </div>
          </template>
          <el-table :data="ranking.hotErrors" size="small" empty-text="暂无错误">
            <el-table-column label="错误指纹" min-width="220" show-overflow-tooltip>
              <template #default="{ row }">
                <span :title="row.errorSample || row.errorFingerprint">{{ row.errorFingerprint }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="chainCode" label="链路" width="120" show-overflow-tooltip>
              <template #default="{ row }"><span class="mono">#{{ row.chainCode }}</span></template>
            </el-table-column>
            <el-table-column prop="happenCount" label="次数" width="70" align="right" />
          </el-table>
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
</template>

<script setup name="DatabusMonitor" lang="ts">
import { DataLine, Refresh, TrendCharts, CircleCheck, CircleClose, Timer } from '@element-plus/icons-vue';
import * as echarts from 'echarts';
import { ElMessage } from 'element-plus';
import {
  monitorAggregate,
  monitorErrorStream,
  monitorOverview,
  monitorRanking,
  monitorTrend
} from '@/api/databus/monitor';
import type {
  MetricAggregateVo,
  MonitorErrorStreamVo,
  MonitorOverviewVo,
  MonitorRankingVo,
  MonitorTrendPointVo
} from '@/api/databus/monitor/types';
import { useLoading } from '@/hooks/async/useLoading';

/**
 * 监控大盘：卡片 + 趋势 + 排行榜 + 错误流。
 * 空数据是正常态（链路未跑/未到整点聚合），所有区块给空态占位，图表仅在有点时初始化，避免崩图。
 */

interface WindowOption {
  value: number;
  label: string;
}

const WINDOW_OPTIONS: WindowOption[] = [
  { value: 1, label: '最近 1 小时' },
  { value: 6, label: '最近 6 小时' },
  { value: 24, label: '最近 24 小时' },
  { value: 72, label: '最近 3 天' },
  { value: 168, label: '最近 7 天' }
];

const hours = ref(24);
const { loading, withLoading } = useLoading(true);

const overview = ref<MonitorOverviewVo | null>(null);
const trend = ref<MonitorTrendPointVo[]>([]);
const ranking = ref<MonitorRankingVo>({
  hours: 24,
  topN: 10,
  chainFailures: [],
  slowNodes: [],
  hotErrors: []
});
const errorStream = ref<MonitorErrorStreamVo[]>([]);

const trendEl = ref<HTMLDivElement>();
let trendInstance: echarts.ECharts | undefined;

const hasTrend = computed(() => trend.value.length > 0);

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

const metricCards = computed(() => {
  const o = overview.value;
  const total = buildDelta(o?.totalCount, o?.prevTotalCount);
  const failed = buildDelta(o?.failedCount, o?.prevFailedCount, true);
  const duration = buildDelta(o?.avgDuration, o?.prevAvgDuration, true);
  // 成功率为百分比绝对差（百分点），不走百分比环比
  const rateCur = o?.successRate != null ? Number(o.successRate) : null;
  const ratePrev = o?.prevSuccessRate != null ? Number(o.prevSuccessRate) : null;
  const rateDelta =
    rateCur != null && ratePrev != null
      ? { text: `${rateCur >= ratePrev ? '↑' : '↓'} ${Math.abs(rateCur - ratePrev).toFixed(2)}pp`, cls: rateCur >= ratePrev ? 'delta-good' : 'delta-bad' }
      : { text: '—', cls: 'delta-flat' };

  return [
    {
      key: 'total',
      label: '执行总次数',
      icon: TrendCharts,
      value: formatInt(o?.totalCount),
      suffix: '',
      valueClass: '',
      deltaText: total.text,
      deltaClass: total.cls
    },
    {
      key: 'rate',
      label: '成功率',
      icon: CircleCheck,
      value: o?.successRate != null ? Number(o.successRate).toFixed(2) : '—',
      suffix: o?.successRate != null ? '%' : '',
      valueClass: rateCur != null && rateCur < 90 ? 'value-warn' : 'value-good',
      deltaText: rateDelta.text,
      deltaClass: rateDelta.cls
    },
    {
      key: 'failed',
      label: '失败次数',
      icon: CircleClose,
      value: formatInt(o?.failedCount),
      suffix: '',
      valueClass: o && o.failedCount > 0 ? 'value-bad' : '',
      deltaText: failed.text,
      deltaClass: failed.cls
    },
    {
      key: 'duration',
      label: '平均耗时',
      icon: Timer,
      value: formatDuration(o?.avgDuration),
      suffix: '',
      valueClass: '',
      deltaText: duration.text,
      deltaClass: duration.cls
    }
  ];
});

/* ------------------------------ 趋势图 ------------------------------ */

const disposeTrend = () => {
  trendInstance?.dispose();
  trendInstance = undefined;
};

const renderTrend = async () => {
  await nextTick();
  if (!hasTrend.value) {
    disposeTrend();
    return;
  }
  if (!trendInstance && trendEl.value) {
    trendInstance = echarts.init(trendEl.value, 'macarons');
  }
  if (!trendInstance) {
    return;
  }
  const points = trend.value;
  trendInstance.setOption(
    {
      grid: { left: 48, right: 52, top: 36, bottom: 34 },
      tooltip: { trigger: 'axis' },
      legend: { data: ['成功', '失败', '成功率'], top: 4, right: 8 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: points.map((p) => formatHour(p.statHour))
      },
      yAxis: [
        { type: 'value', name: '次数', minInterval: 1 },
        {
          type: 'value',
          name: '成功率%',
          min: 0,
          max: 100,
          axisLabel: { formatter: '{value}%' }
        }
      ],
      series: [
        {
          name: '成功',
          type: 'line',
          smooth: true,
          stack: 'count',
          areaStyle: { opacity: 0.18 },
          symbolSize: 4,
          data: points.map((p) => p.successCount ?? 0)
        },
        {
          name: '失败',
          type: 'line',
          smooth: true,
          stack: 'count',
          areaStyle: { opacity: 0.35 },
          symbolSize: 4,
          data: points.map((p) => p.failedCount ?? 0)
        },
        {
          name: '成功率',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          symbolSize: 5,
          connectNulls: true,
          data: points.map((p) => (p.successRate != null ? Number(p.successRate) : null))
        }
      ]
    },
    true
  );
};

/* ------------------------------ 加载 ------------------------------ */

const reload = async () => {
  await withLoading(async () => {
    const [ovRes, trendRes, rankRes, streamRes] = await Promise.all([
      monitorOverview(hours.value),
      monitorTrend(hours.value),
      monitorRanking(hours.value),
      monitorErrorStream(20)
    ]);
    overview.value = ovRes.data ?? null;
    trend.value = trendRes.data ?? [];
    ranking.value =
      rankRes.data ?? { hours: hours.value, topN: 10, chainFailures: [], slowNodes: [], hotErrors: [] };
    errorStream.value = streamRes.data ?? [];
  });
  await renderTrend();
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
  trendInstance?.resize();
};

onMounted(() => {
  window.addEventListener('resize', handleResize);
  reload();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  disposeTrend();
});
</script>

<style lang="scss" scoped>
.page-container {
  padding: 24px 24px 32px;
  background: var(--el-fill-color-light, #f5f7fa);
  min-height: 100%;
}

.page-inner {
  max-width: 1320px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
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
}

.page-title {
  margin: 0;
  font-size: var(--app-font-size-title, 22px);
  font-weight: 700;
  color: var(--app-text-title, #1f2937);
}

.page-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;

  .window-select {
    width: 150px;
  }
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 1100px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.metric-card {
  background: var(--app-surface-bg, #fff);
  border: 1px solid var(--app-surface-border, #e5e7eb);
  border-radius: var(--app-radius-lg, 14px);
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.metric-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.metric-icon {
  font-size: 18px;
  color: var(--el-color-primary-light-3);
}

.metric-value {
  font-size: 28px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--app-text-title, #1f2937);
  line-height: 1.1;
}

.metric-suffix {
  font-size: 15px;
  font-weight: 500;
  margin-left: 2px;
  color: var(--el-text-color-secondary);
}

.value-good {
  color: var(--el-color-success);
}

.value-warn {
  color: var(--el-color-warning);
}

.value-bad {
  color: var(--el-color-danger);
}

.metric-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.metric-foot-label {
  color: var(--el-text-color-secondary);
}

.metric-delta {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.delta-good {
  color: var(--el-color-success);
}

.delta-bad {
  color: var(--el-color-danger);
}

.delta-flat {
  color: var(--el-text-color-secondary);
}

.panel {
  border-radius: var(--app-radius-lg, 14px);
}

.panel-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text-title, #1f2937);
}

.panel-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.trend-wrap {
  min-height: 320px;
}

.trend-chart {
  width: 100%;
  height: 320px;
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

.node-type {
  margin-left: 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.mono {
  font-family: 'JetBrains Mono', Consolas, monospace;
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
}

.stream-item {
  padding: 10px 12px;
  border: 1px solid var(--app-surface-border, #e5e7eb);
  border-radius: var(--app-radius-md, 10px);
  background: var(--el-fill-color-lighter, #fafafa);
  display: flex;
  flex-direction: column;
  gap: 6px;
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
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.stream-duration {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.stream-msg {
  font-size: 12px;
  color: var(--el-color-danger);
  word-break: break-all;
  line-height: 1.5;
}
</style>