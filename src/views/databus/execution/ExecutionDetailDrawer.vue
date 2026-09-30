<!--
  执行记录详情抽屉：总账（状态/耗时/错误/入参/出参）+ FULL 档节点明细时序表。
  - BASIC 档无节点行，显示空态提示；FULL 档节点行可展开看 input/output JSON 快照。
  - 抽屉内可「重跑」：调 rerun 后由父组件打开新记录详情（本抽屉保持由父组件切换 id 重新加载）。
-->
<template>
  <el-drawer
    :model-value="visible"
    title="执行记录详情"
    size="72%"
    append-to-body
    destroy-on-close
    close-on-click-modal
    @update:model-value="emit('update:visible', $event)"
  >
    <div v-loading="loading" class="detail-body">
      <template v-if="detail">
        <!-- 总账区 -->
        <div class="section">
          <div class="section-head">
            <span class="section-title">执行总账</span>
            <el-tag :type="statusTagType(detail.execution.status)" effect="dark" size="small">
              {{ statusLabel(detail.execution.status) }}
            </el-tag>
            <el-button
              v-hasPermi="['databus:execution:execute']"
              class="rerun-btn"
              type="primary"
              size="small"
              :loading="rerunning"
              @click="handleRerun"
            >
              <el-icon><RefreshRight /></el-icon>重跑
            </el-button>
          </div>
          <el-descriptions :column="3" border size="small" class="master-desc">
            <el-descriptions-item label="链路编码">
              #{{ detail.execution.chainCode }}
            </el-descriptions-item>
            <el-descriptions-item label="开始时间">
              {{ formatTime(detail.execution.startTime) }}
            </el-descriptions-item>
            <el-descriptions-item label="结束时间">
              {{ formatTime(detail.execution.endTime) }}
            </el-descriptions-item>
            <el-descriptions-item label="总耗时">
              {{ formatDuration(detail.execution.duration) }}
            </el-descriptions-item>
            <el-descriptions-item label="记录id" :span="2">
              <span class="mono">{{ detail.execution.id }}</span>
            </el-descriptions-item>
            <el-descriptions-item v-if="detail.execution.errorMsg" label="错误信息" :span="3">
              <span class="error-text">{{ detail.execution.errorMsg }}</span>
            </el-descriptions-item>
          </el-descriptions>

          <div class="json-grid">
            <div class="json-block">
              <div class="json-label">执行入参（重跑依据）</div>
              <JsonCodeEditor
                :model-value="pretty(detail.execution.requestData)"
                height="220px"
                readonly
              />
            </div>
            <div class="json-block">
              <div class="json-label">最终输出（执行结束数据树）</div>
              <JsonCodeEditor
                :model-value="pretty(detail.execution.responseData)"
                height="220px"
                readonly
              />
            </div>
          </div>
        </div>

        <!-- 节点明细区（FULL） -->
        <div class="section">
          <div class="section-head">
            <span class="section-title">节点明细</span>
            <span class="section-sub">共 {{ detail.nodes.length }} 行（按开始时间排序）</span>
          </div>
          <el-alert
            v-if="detail.nodes.length === 0"
            title="该记录为 BASIC 基础档，不采集节点级明细；FULL 档才记录每个节点的输入/输出/分支。"
            type="info"
            :closable="false"
            show-icon
          />
          <el-table
            v-else
            :data="detail.nodes"
            size="small"
            border
            row-key="id"
            class="node-table"
          >
            <el-table-column type="expand">
              <template #default="{ row }">
                <div class="node-io">
                  <div class="json-block">
                    <div class="json-label">节点前数据树快照</div>
                    <JsonCodeEditor :model-value="pretty(row.inputJson)" height="200px" readonly />
                  </div>
                  <div class="json-block">
                    <div class="json-label">节点后数据空间快照</div>
                    <JsonCodeEditor :model-value="pretty(row.outputJson)" height="200px" readonly />
                  </div>
                </div>
                <div v-if="row.errorMsg" class="node-error">错误：{{ row.errorMsg }}</div>
              </template>
            </el-table-column>
            <el-table-column label="#" type="index" width="44" align="center" />
            <el-table-column prop="tag" label="tag（数据空间）" min-width="140" show-overflow-tooltip />
            <el-table-column prop="nodeType" label="节点类型" min-width="110" show-overflow-tooltip />
            <el-table-column label="分支" min-width="120" show-overflow-tooltip>
              <template #default="{ row }">
                <el-tag v-if="row.branchInfo" size="small" type="warning">{{ row.branchInfo }}</el-tag>
                <span v-else class="text-muted">-</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="80" align="center">
              <template #default="{ row }">
                <el-tag :type="row.status === 'SUCCESS' ? 'success' : 'danger'" size="small">
                  {{ row.status === 'SUCCESS' ? '成功' : '失败' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="耗时" width="92" align="right">
              <template #default="{ row }">{{ formatDuration(row.duration) }}</template>
            </el-table-column>
            <el-table-column label="开始时间" width="168">
              <template #default="{ row }">{{ formatTime(row.startTime) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </template>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { RefreshRight } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { getExecution, rerunExecution } from '@/api/databus/execution';
import type { DatabusExecutionResult, ExecutionDetailVo } from '@/api/databus/execution/types';
import JsonCodeEditor from '@/views/databus/editor/components/common/JsonCodeEditor.vue';

const props = defineProps<{
  visible: boolean;
  /** 要展示的记录 id；父组件切换 id 后自动重新加载 */
  recordId?: number | string | null;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  /** 重跑完成（父组件据此打开新记录详情） */
  rerun: [result: DatabusExecutionResult];
}>();

const detail = ref<ExecutionDetailVo>();
const loading = ref(false);
const rerunning = ref(false);

/** 加载详情（recordId 变化或抽屉打开时） */
const loadDetail = async (id: number | string) => {
  loading.value = true;
  try {
    const res = await getExecution(id);
    detail.value = res.data;
  } finally {
    loading.value = false;
  }
};

watch(
  () => [props.visible, props.recordId] as const,
  ([visible, id]) => {
    if (visible && id !== null && id !== undefined && id !== '') {
      loadDetail(id);
    }
    if (!visible) {
      detail.value = undefined;
    }
  }
);

const handleRerun = async () => {
  if (!detail.value) return;
  rerunning.value = true;
  try {
    const res = await rerunExecution(detail.value.execution.id);
    ElMessage.success('重跑已发起');
    emit('rerun', res.data);
  } finally {
    rerunning.value = false;
  }
};

const statusTagType = (status: string): 'success' | 'danger' | 'warning' | 'info' => {
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

const pad = (n: number) => String(n).padStart(2, '0');

/** 时间格式化：后端 LocalDateTime 序列化为 'yyyy-MM-ddTHH:mm:ss'，精确到秒 */
const formatTime = (t?: string | null) => {
  if (!t) return '-';
  return t.replace('T', ' ').slice(0, 19);
};

/** 耗时人话化：<1s 显示毫秒，否则秒（3 位小数） */
const formatDuration = (ms?: number | null) => {
  if (ms === null || ms === undefined) return '-';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(3)} s`;
};

/** JSON 美化展示：空值给空串，非法或普通文本原样返回 */
const pretty = (raw?: string | null) => {
  if (!raw) return '';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
};
</script>

<style lang="scss" scoped>
.detail-body {
  padding: 0 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.section-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.rerun-btn {
  margin-left: auto;
}

.mono {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
}

.error-text {
  color: var(--el-color-danger);
  white-space: pre-wrap;
  word-break: break-all;
}

.json-grid,
.node-io {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.json-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.json-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.node-error {
  margin-top: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
  border-radius: 4px;
  word-break: break-all;
}

.text-muted {
  color: var(--el-text-color-placeholder);
}
</style>
