<!--
  告警记录 pane（2026-10-20 管理页 tab 化，databus-workspace-tabs.md §10 步骤4）。
  平移自原 alert/index.vue 的「告警记录」页签：只读历史告警（状态/类型/时间区间筛选），
  行内展示通知结果与恢复时间；「立即评估」入口随页头一起搬来。
  告警规则的 CRUD 已收进设置 tab 的「告警规则」组（SettingsPane），此处不再承载。
  红线：无路由依赖、不 import Layout、不自行 router.push。
-->
<template>
  <div class="alert-pane">
    <div class="alert-pane__scroll">
      <div class="alert-pane__inner">
        <div class="page-header">
          <div class="page-title-wrap">
            <h2 class="page-title">告警记录</h2>
            <p class="page-subtitle">
              一次告警生命周期一行：FIRING 触发中、RECOVERED 已恢复（同规则持续触发不重复留存），恢复即自动收线。
            </p>
          </div>
          <div class="header-actions">
            <el-button
              v-hasPermi="['databus:alert:evaluate']"
              :loading="evaluating"
              @click="handleEvaluate"
            >
              <el-icon><Bell /></el-icon>
              <span>立即评估</span>
            </el-button>
          </div>
        </div>

        <div class="filter-bar">
          <el-input
            v-model="recordQuery.ruleName"
            class="filter-item"
            placeholder="规则名称"
            clearable
            @keyup.enter="handleRecordQuery"
            @clear="handleRecordQuery"
          />
          <el-input
            v-model="recordQuery.chainCode"
            class="filter-item"
            placeholder="链路编码"
            clearable
            @keyup.enter="handleRecordQuery"
            @clear="handleRecordQuery"
          />
          <el-date-picker
            v-model="recordDateRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="触发时间起"
            end-placeholder="触发时间止"
            value-format="YYYY-MM-DD HH:mm:ss"
            clearable
            @change="handleRecordDateChange"
          />
          <div class="status-bar">
            <button
              v-for="s in STATUS_OPTIONS"
              :key="s.value"
              class="filter-tab"
              :class="{ active: recordQuery.status === s.value }"
              @click="changeRecordStatus(s.value)"
            >
              {{ s.label }}
            </button>
          </div>
        </div>

        <div class="table-card">
          <div v-if="recordLoading && recordList.length === 0" class="table-skeleton">
            <el-skeleton animated :rows="7" />
          </div>
          <el-table v-else v-loading="recordLoading" :data="recordList">
            <el-table-column prop="ruleName" label="规则名称" min-width="150" show-overflow-tooltip />
            <el-table-column label="目标链路" min-width="140" show-overflow-tooltip>
              <template #default="{ row }"><span class="mono">#{{ row.chainCode }}</span></template>
            </el-table-column>
            <el-table-column label="类型" width="120">
              <template #default="{ row }">
                <el-tag size="small" effect="plain">{{ ruleTypeLabel(row.alertType) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="row.status === 'FIRING' ? 'danger' : 'success'" size="small">
                  {{ row.status === 'FIRING' ? '触发中' : '已恢复' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="message" label="告警摘要" min-width="200" show-overflow-tooltip />
            <el-table-column label="通知" width="100" align="center">
              <template #default="{ row }">
                <el-tooltip
                  :content="notifyDetailText(row.notifyDetail)"
                  :disabled="!row.notifyDetail"
                  placement="top"
                >
                  <span :class="notifyCls(row.notifyStatus)">{{ notifyLabel(row.notifyStatus) }}</span>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column label="触发时间" width="170" class-name="num-cell">
              <template #default="{ row }">{{ formatTime(row.triggerTime) }}</template>
            </el-table-column>
            <el-table-column label="恢复时间" width="170" class-name="num-cell">
              <template #default="{ row }">{{ formatTime(row.recoverTime) }}</template>
            </el-table-column>
            <template #empty>
              <el-empty description="暂无告警记录（规则命中后产生首条）" />
            </template>
          </el-table>
        </div>

        <pagination
          v-show="recordTotal > 0"
          v-model:page="recordQuery.pageNum"
          v-model:limit="recordQuery.pageSize"
          :total="recordTotal"
          @pagination="getRecordList"
        />
      </div>
    </div>
  </div>
</template>

<script setup name="AlertPane" lang="ts">
import { Bell } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import {
  ALERT_NOTIFY_TYPE_OPTIONS,
  ALERT_RULE_TYPE_OPTIONS,
  evaluateAlert,
  listAlertRecord
} from '@/api/databus/alert';
import type {
  AlertEvaluateVo,
  DatabusAlertRecordQuery,
  DatabusAlertRecordVo
} from '@/api/databus/alert/types';
import { useLoading } from '@/hooks/async/useLoading';

/**
 * 告警记录 pane：只读历史告警列表（分页/筛选）+ 手动评估。
 */

const STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'FIRING', label: '触发中' },
  { value: 'RECOVERED', label: '已恢复' }
];

/* ------------------------------ 记录 ------------------------------ */

const recordList = ref<DatabusAlertRecordVo[]>([]);
const recordTotal = ref(0);
const { loading: recordLoading, withLoading: withRecordLoading } = useLoading(true);
const recordDateRange = ref<[string, string] | null>(null);

const recordQuery = ref<DatabusAlertRecordQuery>({
  pageNum: 1,
  pageSize: 10,
  ruleName: '',
  chainCode: '',
  alertType: '',
  status: '',
  beginTime: undefined,
  endTime: undefined
});

const getRecordList = async () => {
  await withRecordLoading(async () => {
    const res = await listAlertRecord(recordQuery.value);
    recordList.value = res.data?.rows ?? [];
    recordTotal.value = res.data?.total ?? 0;
  });
};

const handleRecordQuery = () => {
  recordQuery.value.pageNum = 1;
  getRecordList();
};

const changeRecordStatus = (value: string) => {
  recordQuery.value.status = value;
  handleRecordQuery();
};

const handleRecordDateChange = (val: [string, string] | null) => {
  recordQuery.value.beginTime = val?.[0];
  recordQuery.value.endTime = val?.[1];
  handleRecordQuery();
};

/* ------------------------------ 评估 ------------------------------ */

const evaluating = ref(false);

const handleEvaluate = async () => {
  evaluating.value = true;
  try {
    const res = await evaluateAlert();
    const data: AlertEvaluateVo = res.data;
    ElMessage.success(
      `评估完成：扫描 ${data.ruleCount} 条规则，触发 ${data.firedCount} 条、恢复 ${data.recoveredCount} 条，`
      + `通知成功 ${data.notifySuccess} / 失败 ${data.notifyFailed}，耗时 ${data.costMillis} ms`
    );
    await getRecordList();
  } finally {
    evaluating.value = false;
  }
};

/* ------------------------------ 展示辅助 ------------------------------ */

const ruleTypeLabel = (type?: string) =>
  ALERT_RULE_TYPE_OPTIONS.find((item) => item.value === type)?.label ?? type ?? '-';

const notifyLabel = (status?: string | null) => {
  if (status === 'SUCCESS') return '已发送';
  if (status === 'PARTIAL') return '部分成功';
  if (status === 'DISPATCHED') return '已投递';
  if (status === 'FAILED') return '发送失败';
  if (status === 'SKIPPED') return '未配置';
  return '-';
};

const notifyCls = (status?: string | null) => {
  if (status === 'SUCCESS' || status === 'DISPATCHED') return 'notify-ok';
  if (status === 'FAILED') return 'notify-bad';
  if (status === 'PARTIAL') return 'notify-warn';
  return '';
};

const notifyTypeLabel = (type: string) =>
  ALERT_NOTIFY_TYPE_OPTIONS.find((item) => item.value === type)?.label ?? type;

/** 逐渠道通知明细（JSON → 可读文本，tooltip 展示） */
const notifyDetailText = (detail?: string | null) => {
  if (!detail) return '';
  try {
    const parsed = JSON.parse(detail) as Record<string, string>;
    return Object.entries(parsed)
      .map(([channel, status]) => `${notifyTypeLabel(channel)}：${status}`)
      .join('\n');
  } catch {
    return detail;
  }
};

const formatTime = (t?: string | null) => {
  if (!t) return '-';
  return t.replace('T', ' ').slice(0, 19);
};

onMounted(() => {
  getRecordList();
});
</script>

<style lang="scss" scoped>
/* pane 骨架：吃满宿主高度，滚动收在内层（外层不出现双滚动条） */
.alert-pane {
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--el-fill-color-light, #f5f7fa);
}

.alert-pane__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.alert-pane__inner {
  max-width: 1200px;
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
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.filter-item {
  width: 200px;
  max-width: 100%;
}

.status-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-tab {
  padding: 6px 16px;
  border-radius: var(--app-radius-md, 10px);
  border: 1px solid var(--el-border-color, #e8eaec);
  background: var(--el-bg-color, #fff);
  color: var(--el-text-color-regular, #363b41);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    color 0.2s ease,
    background-color 0.2s ease,
    border-color 0.2s ease;

  &:hover {
    border-color: var(--el-color-primary);
    color: var(--el-color-primary);
  }

  &.active {
    background-color: var(--el-color-primary);
    border-color: var(--el-color-primary);
    color: #fff;
  }

  &:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 2px;
  }
}

.table-card {
  background: var(--app-surface-bg, #fff);
  border: 1px solid var(--app-surface-border, #e5e7eb);
  border-radius: var(--app-radius-lg, 14px);
  padding: 8px;
}

.table-skeleton {
  padding: 16px 16px 8px;
}

:deep(.num-cell) {
  font-variant-numeric: tabular-nums;
}

.mono {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
}

.notify-ok {
  color: var(--el-color-success);
}

.notify-warn {
  color: var(--el-color-warning);
}

.notify-bad {
  color: var(--el-color-danger);
}
</style>