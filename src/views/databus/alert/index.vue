<!--
  告警管理页（阶段5 · 告警引擎 v1）：规则配置 + 历史告警记录。
  - 规则页签：分页表格 + 类型/状态筛选 + 新增/编辑/删除 + 手动评估入口。
  - 记录页签：只读历史告警（状态/类型筛选 + 触发时间区间），行内展示通知结果与恢复时间。
  - 一次告警生命周期一行：FIRING 触发中、RECOVERED 已恢复（同规则持续触发不重复留存）。
-->
<template>
  <div class="page-container">
    <div class="page-inner">
      <div class="page-header">
        <div class="page-title-wrap">
          <h2 class="page-title">告警管理</h2>
          <p class="page-subtitle">
            每分钟扫描启用规则，命中即按渠道通知（邮件/Webhook/通知链路），恢复即自动收线；持续触发不重复通知。
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
          <el-button
            v-if="activeTab === 'rule'"
            v-hasPermi="['databus:alert:add']"
            type="primary"
            @click="handleAdd"
          >
            <el-icon><Plus /></el-icon>
            <span>新增规则</span>
          </el-button>
        </div>
      </div>

      <el-tabs v-model="activeTab" class="alert-tabs" @tab-change="handleTabChange">
        <!-- 规则配置 -->
        <el-tab-pane label="告警规则" name="rule">
          <div class="filter-bar">
            <el-input
              v-model="ruleQuery.ruleName"
              class="filter-item"
              placeholder="规则名称"
              clearable
              @keyup.enter="handleRuleQuery"
              @clear="handleRuleQuery"
            />
            <el-select
              v-model="ruleQuery.ruleType"
              class="filter-item"
              placeholder="全部类型"
              clearable
              @change="handleRuleQuery"
            >
              <el-option
                v-for="item in ALERT_RULE_TYPE_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
            <div class="status-bar">
              <button
                v-for="s in ENABLED_OPTIONS"
                :key="s.value"
                class="filter-tab"
                :class="{ active: ruleQuery.enabled === s.value }"
                @click="changeEnabled(s.value)"
              >
                {{ s.label }}
              </button>
            </div>
          </div>

          <div class="table-card">
            <div v-if="ruleLoading && ruleList.length === 0" class="table-skeleton">
              <el-skeleton animated :rows="7" />
            </div>
            <el-table v-else v-loading="ruleLoading" :data="ruleList">
              <el-table-column prop="ruleName" label="规则名称" min-width="160" show-overflow-tooltip />
              <el-table-column label="目标链路" min-width="150" show-overflow-tooltip>
                <template #default="{ row }"><span class="mono">#{{ row.chainCode }}</span></template>
              </el-table-column>
              <el-table-column label="类型" width="130">
                <template #default="{ row }">
                  <el-tag size="small" effect="plain">{{ ruleTypeLabel(row.ruleType) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="触发条件" min-width="170">
                <template #default="{ row }">{{ ruleConditionText(row as DatabusAlertRuleVo) }}</template>
              </el-table-column>
              <el-table-column label="状态" width="84" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.enabled === 'Y' ? 'success' : 'info'" size="small">
                    {{ row.enabled === 'Y' ? '启用' : '停用' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="通知渠道" min-width="150">
                <template #default="{ row }">
                  <el-tag
                    v-for="t in notifyTypeList(row.notifyType)"
                    :key="t"
                    size="small"
                    effect="plain"
                    class="channel-tag"
                  >
                    {{ notifyTypeLabel(t) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="130" align="center" fixed="right">
                <template #default="{ row }">
                  <el-button
                    v-hasPermi="['databus:alert:edit']"
                    link
                    type="primary"
                    size="small"
                    @click="handleUpdate(row as DatabusAlertRuleVo)"
                  >
                    编辑
                  </el-button>
                  <el-button
                    v-hasPermi="['databus:alert:remove']"
                    link
                    type="danger"
                    size="small"
                    @click="handleDelete(row as DatabusAlertRuleVo)"
                  >
                    删除
                  </el-button>
                </template>
              </el-table-column>
              <template #empty>
                <el-empty description="暂无告警规则（点「新增规则」创建第一条）" />
              </template>
            </el-table>
          </div>

          <pagination
            v-show="ruleTotal > 0"
            v-model:page="ruleQuery.pageNum"
            v-model:limit="ruleQuery.pageSize"
            :total="ruleTotal"
            @pagination="getRuleList"
          />
        </el-tab-pane>

        <!-- 历史告警记录 -->
        <el-tab-pane label="告警记录" name="record">
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
        </el-tab-pane>
      </el-tabs>
    </div>

    <AlertRuleForm ref="ruleFormRef" @success="getRuleList" />
  </div>
</template>

<script setup name="DatabusAlert" lang="ts">
import { Bell, Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  ALERT_NOTIFY_TYPE_OPTIONS,
  ALERT_RULE_TYPE_OPTIONS,
  delAlertRule,
  evaluateAlert,
  listAlertRecord,
  listAlertRule
} from '@/api/databus/alert';
import type {
  AlertEvaluateVo,
  DatabusAlertRecordQuery,
  DatabusAlertRecordVo,
  DatabusAlertRuleQuery,
  DatabusAlertRuleVo
} from '@/api/databus/alert/types';
import { useLoading } from '@/hooks/async/useLoading';
import AlertRuleForm from './AlertRuleForm.vue';

/**
 * 告警管理页：规则配置（CRUD）+ 历史告警记录（只读）+ 手动评估。
 */

const ENABLED_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'Y', label: '启用' },
  { value: 'N', label: '停用' }
];

const STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'FIRING', label: '触发中' },
  { value: 'RECOVERED', label: '已恢复' }
];

const activeTab = ref<'rule' | 'record'>('rule');
const ruleFormRef = ref<InstanceType<typeof AlertRuleForm>>();

/* ------------------------------ 规则 ------------------------------ */

const ruleList = ref<DatabusAlertRuleVo[]>([]);
const ruleTotal = ref(0);
const { loading: ruleLoading, withLoading: withRuleLoading } = useLoading(true);
const ruleLoaded = ref(false);

const ruleQuery = ref<DatabusAlertRuleQuery>({
  pageNum: 1,
  pageSize: 10,
  ruleName: '',
  chainCode: '',
  ruleType: '',
  enabled: ''
});

const getRuleList = async () => {
  await withRuleLoading(async () => {
    const res = await listAlertRule(ruleQuery.value);
    ruleList.value = res.data?.rows ?? [];
    ruleTotal.value = res.data?.total ?? 0;
    ruleLoaded.value = true;
  });
};

const handleRuleQuery = () => {
  ruleQuery.value.pageNum = 1;
  getRuleList();
};

const changeEnabled = (value: string) => {
  ruleQuery.value.enabled = value;
  handleRuleQuery();
};

const handleAdd = () => {
  ruleFormRef.value?.openDialog();
};

const handleUpdate = (row: DatabusAlertRuleVo) => {
  ruleFormRef.value?.openDialog(row.id);
};

const handleDelete = async (row: DatabusAlertRuleVo) => {
  await ElMessageBox.confirm(
    `确认删除告警规则「${row.ruleName}」？已产生的告警记录会保留，便于历史追溯。`,
    '删除确认',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
  );
  await delAlertRule(row.id as number | string);
  await getRuleList();
  ElMessage.success('删除成功');
};

/* ------------------------------ 记录 ------------------------------ */

const recordList = ref<DatabusAlertRecordVo[]>([]);
const recordTotal = ref(0);
const { loading: recordLoading, withLoading: withRecordLoading } = useLoading(true);
const recordLoaded = ref(false);
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
    recordLoaded.value = true;
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

/* ------------------------------ 页签/评估 ------------------------------ */

const handleTabChange = (name: string | number) => {
  if (name === 'rule' && !ruleLoaded.value) {
    getRuleList();
  } else if (name === 'record' && !recordLoaded.value) {
    getRecordList();
  }
};

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
    if (recordLoaded.value) {
      recordLoaded.value = false;
    }
    if (activeTab.value === 'record') {
      getRecordList();
    }
  } finally {
    evaluating.value = false;
  }
};

/* ------------------------------ 展示辅助 ------------------------------ */

const ruleTypeLabel = (type?: string) =>
  ALERT_RULE_TYPE_OPTIONS.find((item) => item.value === type)?.label ?? type ?? '-';

const ruleConditionText = (row: DatabusAlertRuleVo) => {
  const window = row.windowMinutes ?? 5;
  if (row.ruleType === 'CONSECUTIVE_FAILURE') {
    return `窗口 ${window} 分钟内连续失败 ${row.thresholdCount ?? '-'} 次`;
  }
  if (row.ruleType === 'SUCCESS_RATE') {
    return `窗口 ${window} 分钟内成功率 < ${row.thresholdRate ?? '-'}%`;
  }
  return `窗口 ${window} 分钟`;
};

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

/** 规则行通知渠道标签（逗号串 → 数组） */
const notifyTypeList = (notifyType?: string | null) =>
  (notifyType ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

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
  getRuleList();
});
</script>

<style lang="scss" scoped>
.page-container {
  padding: 24px 24px 32px;
  background: var(--el-fill-color-light, #f5f7fa);
  min-height: 100%;
}

.page-inner {
  max-width: 1200px;
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
}

.alert-tabs {
  :deep(.el-tabs__header) {
    margin-bottom: 16px;
  }
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

.channel-tag {
  margin-right: 4px;
}
</style>