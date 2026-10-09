<!--
  执行记录页（设计档 §4）：总账分页列表 + 详情抽屉 + 手动执行入口。
  - 筛选：链路编码模糊 / 状态胶囊（全部/成功/失败/进行中）/ 开始时间日期区间。
  - 行点击或「详情」开抽屉（总账 IO + FULL 节点明细行）；列表白名单不带大字段。
  - 「手动执行」弹正式执行弹窗；从链路卡片跳转时带 query.recordId 自动开抽屉。
-->
<template>
  <div class="page-container">
    <div class="page-inner">
      <!-- 顶部标题栏 -->
      <div class="page-header">
        <div class="page-title-wrap">
          <h2 class="page-title">执行记录</h2>
          <p class="page-subtitle">链路正式执行的审计台账，只增不改；OFF 档不留记录，BASIC 记总账，FULL 另记每步明细。</p>
        </div>
        <div class="header-actions">
          <button
            v-hasPermi="['databus:execution:remove']"
            class="cleanup-btn"
            :disabled="cleaning"
            @click="handleCleanup"
          >
            <el-icon><Delete /></el-icon>
            <span>{{ cleaning ? '清理中…' : '清理过期记录' }}</span>
          </button>
          <button
            v-hasPermi="['databus:execution:execute']"
            class="add-btn"
            @click="handleManualExecute"
          >
            <el-icon><VideoPlay /></el-icon>
            <span>手动执行</span>
          </button>
        </div>
      </div>

      <!-- 筛选行 -->
      <div class="filter-bar">
        <el-select
          v-model="queryParams.chainCode"
          class="chain-select"
          filterable
          allow-create
          default-first-option
          clearable
          :loading="chainLoading"
          placeholder="选择或输入链路编码 / 名称搜索"
          @change="handleChainChange"
          @clear="handleQuery"
        >
          <el-option
            v-for="c in chainOptions"
            :key="String(c.id)"
            :label="`${c.chainName}（#${c.chainCode}）`"
            :value="c.chainCode"
          >
            <span class="opt-name">{{ c.chainName }}</span>
            <span class="opt-code">#{{ c.chainCode }}</span>
          </el-option>
        </el-select>
        <el-date-picker
          v-model="dateRange"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始时间起"
          end-placeholder="开始时间止"
          value-format="YYYY-MM-DD HH:mm:ss"
          :shortcuts="dateShortcuts"
          clearable
          @change="handleDateChange"
        />
      </div>

      <!-- 状态胶囊 -->
      <div class="status-bar">
        <button
          v-for="s in STATUS_OPTIONS"
          :key="s.value"
          class="filter-tab"
          :class="{ active: queryParams.status === s.value }"
          @click="changeStatus(s.value)"
        >
          {{ s.label }}
        </button>
      </div>

      <!-- 记录表：首屏用骨架屏占位，翻页/筛选仍走表格遮罩 loading -->
      <div class="table-card">
        <div v-if="loading && recordList.length === 0" class="table-skeleton">
          <el-skeleton animated :rows="9" />
        </div>
        <el-table v-else v-loading="loading" :data="recordList" @row-click="openDetail">
          <el-table-column prop="chainCode" label="链路编码" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="mono">#{{ row.chainCode }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="92" align="center">
            <template #default="{ row }">
              <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="开始时间" width="172" class-name="num-cell">
            <template #default="{ row }">{{ formatTime(row.startTime) }}</template>
          </el-table-column>
          <el-table-column label="结束时间" width="172" class-name="num-cell">
            <template #default="{ row }">{{ formatTime(row.endTime) }}</template>
          </el-table-column>
          <el-table-column label="总耗时" width="100" align="right" class-name="num-cell">
            <template #default="{ row }">{{ formatDuration(row.duration) }}</template>
          </el-table-column>
          <el-table-column prop="errorMsg" label="错误信息" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <span :class="{ 'error-text': row.errorMsg }">{{ row.errorMsg || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" align="center" fixed="right">
            <template #default="{ row }">
              <el-button
                v-hasPermi="['databus:execution:query']"
                link
                type="primary"
                size="small"
                @click.stop="openDetail(row as DatabusExecutionVo)"
              >
                详情
              </el-button>
              <el-button
                v-hasPermi="['databus:execution:execute']"
                link
                type="success"
                size="small"
                @click.stop="handleRerunRow(row as DatabusExecutionVo)"
              >
                重跑
              </el-button>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty description="暂无执行记录（手动执行一条已发布链路产生首条记录）" />
          </template>
        </el-table>
      </div>

      <pagination
        v-show="total > 0"
        v-model:page="queryParams.pageNum"
        v-model:limit="queryParams.pageSize"
        :total="total"
        @pagination="getList"
      />
    </div>

    <ManualExecuteDialog
      v-model:visible="executeDialogVisible"
      @executed="handleExecuted"
    />
    <ExecutionDetailDrawer
      v-model:visible="detailVisible"
      :record-id="detailId"
      @rerun="handleRerunDone"
    />
  </div>
</template>

<script setup name="DatabusExecution" lang="ts">
import { Delete, VideoPlay } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { cleanupExecution, listExecution, rerunExecution } from '@/api/databus/execution';
import { useChainOptions } from '@/views/databus/editor/composables/useChainOptions';
import type {
  DatabusExecutionQuery,
  DatabusExecutionResult,
  DatabusExecutionVo,
  ExecutionCleanupResult
} from '@/api/databus/execution/types';
import { useLoading } from '@/hooks/async/useLoading';
import { useRoute } from 'vue-router';
import ExecutionDetailDrawer from './ExecutionDetailDrawer.vue';
import ManualExecuteDialog from './ManualExecuteDialog.vue';

/**
 * 执行记录页：纯只读台账 + 执行入口。列表点击行开抽屉；
 * 手动执行/重跑完成后凭返回的 recordId 直接打开新记录详情（afterFlow 已同步落库）。
 */

interface StatusOption {
  value: string;
  label: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  { value: '', label: '全部' },
  { value: 'SUCCESS', label: '成功' },
  { value: 'FAILED', label: '失败' },
  { value: 'RUNNING', label: '进行中' }
];

const dateShortcuts = [
  {
    text: '最近1小时',
    value: () => {
      const end = new Date();
      const start = new Date(end.getTime() - 3600 * 1000);
      return [start, end];
    }
  },
  {
    text: '今天',
    value: () => {
      const end = new Date();
      const start = new Date(end.setHours(0, 0, 0, 0));
      return [start, new Date()];
    }
  },
  {
    text: '最近7天',
    value: () => {
      const end = new Date();
      const start = new Date(end.getTime() - 7 * 24 * 3600 * 1000);
      return [start, end];
    }
  }
];

const { loading, withLoading } = useLoading(true);

const recordList = ref<DatabusExecutionVo[]>([]);
const total = ref(0);

const dateRange = ref<[string, string] | null>(null);
const queryParams = ref<DatabusExecutionQuery>({
  pageNum: 1,
  pageSize: 10,
  chainCode: undefined,
  status: '',
  beginTime: undefined,
  endTime: undefined
});

const executeDialogVisible = ref(false);
const detailVisible = ref(false);
const detailId = ref<number | string | null>(null);

/**
 * 链路建议：共享 useChainOptions 数据通道（与编辑器切换器/CHAIN 引用选择器同源缓存）。
 * 不按状态过滤、含模板——历史记录里的链路此刻可能已下线/草稿/转模板，仍要能选到精确编码。
 */
const {
  chains: chainOptions,
  loading: chainLoading,
  ensure: ensureChainOptions
} = useChainOptions(() => ({ pageNum: 1, pageSize: 1000 }));

const route = useRoute();

/** 分页查询 */
const getList = async () => {
  await withLoading(async () => {
    const res = await listExecution(queryParams.value);
    recordList.value = res.data?.rows ?? [];
    total.value = res.data?.total ?? 0;
  });
};

const handleQuery = () => {
  queryParams.value.pageNum = 1;
  getList();
};

const changeStatus = (value: string) => {
  queryParams.value.status = value;
  handleQuery();
};

const handleDateChange = (val: [string, string] | null) => {
  queryParams.value.beginTime = val?.[0];
  queryParams.value.endTime = val?.[1];
  handleQuery();
};

/**
 * 链路选择/自由输入变化（el-select filterable + allow-create）：
 * 选中建议项 → 值为精确 chainCode；手动输入回车创建 → 值为编码片段走后端 LIKE。
 * el-select 清空时会给空串，统一归一成 undefined 防止把空串当模糊条件。
 */
const handleChainChange = (val: string | undefined) => {
  queryParams.value.chainCode = val || undefined;
  handleQuery();
};

const handleManualExecute = () => {
  executeDialogVisible.value = true;
};

/** 保留期清理：二次确认后调手动端点（与凌晨定时任务同入口），报删除行数并刷新 */
const cleaning = ref(false);

const handleCleanup = async () => {
  await ElMessageBox.confirm(
    '将物理清理保留期（默认 30 天，以后端配置为准）之前的执行记录及节点明细，删除后不可恢复。是否继续？',
    '清理过期记录',
    { type: 'warning', confirmButtonText: '确定清理', cancelButtonText: '取消' }
  );
  cleaning.value = true;
  try {
    const res = await cleanupExecution();
    const data: ExecutionCleanupResult = res.data;
    ElMessage.success(
      `清理完成：删除执行记录 ${data.executionDeleted} 条、节点明细 ${data.nodeDeleted} 行`
      + (data.truncated ? '（达到单轮上限，剩余下次继续）' : '')
    );
    await getList();
  } finally {
    cleaning.value = false;
  }
};

/** 手动执行完成：提示成败 + 刷新列表；有 recordId 直接打开新记录详情 */
const handleExecuted = async (result: DatabusExecutionResult) => {
  if (result.success) {
    ElMessage.success(`执行成功，耗时 ${formatDuration(result.costTime)}`);
  } else {
    ElMessage.error(`执行失败：${result.message || '未知错误'}`);
  }
  await getList();
  if (result.recordId) {
    openDetailById(result.recordId);
  }
};

/** 表格行/详情按钮 */
const openDetail = (row: DatabusExecutionVo) => {
  openDetailById(row.id);
};

const openDetailById = (id: number | string) => {
  detailId.value = id;
  detailVisible.value = true;
};

/** 列表行内重跑：二次确认 → 调接口 → 打开新记录 */
const handleRerunRow = async (row: DatabusExecutionVo) => {
  await ElMessageBox.confirm(
    `确认以原始入参重跑链路 #${row.chainCode}？将产生一条新执行记录，原记录不变。`,
    '重跑确认',
    { type: 'warning', confirmButtonText: '重跑', cancelButtonText: '取消' }
  );
  const res = await rerunExecution(row.id);
  await handleRerunDone(res.data);
};

/** 抽屉内重跑完成：切到新记录（抽屉 watch 自动重载）+ 刷新列表 */
const handleRerunDone = async (result: DatabusExecutionResult) => {
  if (result.success) {
    ElMessage.success(`重跑成功，耗时 ${formatDuration(result.costTime)}`);
  } else {
    ElMessage.error(`重跑失败：${result.message || '未知错误'}`);
  }
  await getList();
  if (result.recordId) {
    detailId.value = result.recordId;
    detailVisible.value = true;
  }
};

const statusTagType = (status: string): 'success' | 'danger' | 'warning' => {
  if (status === 'SUCCESS') return 'success';
  if (status === 'FAILED') return 'danger';
  return 'warning';
};

const statusLabel = (status: string) => {
  if (status === 'SUCCESS') return '成功';
  if (status === 'FAILED') return '失败';
  if (status === 'RUNNING') return '进行中';
  return status;
};

const formatTime = (t?: string | null) => {
  if (!t) return '-';
  return t.replace('T', ' ').slice(0, 19);
};

const formatDuration = (ms?: number | null) => {
  if (ms === null || ms === undefined) return '-';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(3)} s`;
};

onMounted(() => {
  // 链路建议（共享缓存）与记录列表并行加载（互不阻塞）
  ensureChainOptions().catch(() => {});
  getList();
  // 从链路卡片执行后跳转携带 recordId：自动打开详情抽屉
  const rid = route.query.recordId;
  if (rid !== undefined && rid !== null && rid !== '') {
    openDetailById(String(rid));
  }
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

.cleanup-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  border-radius: var(--app-radius-md, 10px);
  border: 1px solid var(--el-color-danger-light-5, #fde2e2);
  background: var(--el-bg-color, #fff);
  color: var(--el-color-danger);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;

  &:hover:not(:disabled) {
    border-color: var(--el-color-danger);
    background: var(--el-color-danger-light-9, #fef0f0);
  }

  &:active:not(:disabled) {
    border-color: var(--el-color-danger);
    background: var(--el-color-danger-light-8, #fde2e2);
  }

  &:focus-visible {
    outline: 2px solid var(--el-color-danger);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}

.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border: none;
  border-radius: var(--app-radius-md, 10px);
  background: var(--el-color-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover {
    background: var(--el-color-primary-light-3);
  }

  &:active {
    background: var(--el-color-primary-dark-2);
  }

  &:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 2px;
  }
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.chain-select {
  width: 320px;
  max-width: 100%;

  :deep(.el-select__wrapper) {
    border-radius: var(--app-radius-md, 10px);
    min-height: 40px;
    box-shadow: 0 0 0 1.5px var(--el-border-color, #e8eaec) inset;
    transition: box-shadow 0.2s ease;
  }

  &:focus-within :deep(.el-select__wrapper) {
    box-shadow:
      0 0 0 1.5px var(--el-color-primary) inset,
      0 0 0 3px rgba(var(--el-color-primary-rgb, 22, 104, 220), 0.12);
  }
}

/* el-option 内容在本 SFC 模板内编译（自带 scope id），下拉虽 teleport 到 body 仍可命中，故不用 :deep */
.opt-name {
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.opt-code {
  float: right;
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: 'JetBrains Mono', Consolas, monospace;
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

  &:active:not(.active) {
    background: var(--el-fill-color-light, #f5f7fa);
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

/* 时间/耗时等数字列：等宽数字，翻页时列宽不抖动 */
:deep(.num-cell) {
  font-variant-numeric: tabular-nums;
}

.mono {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
}

.error-text {
  color: var(--el-color-danger);
}
</style>
