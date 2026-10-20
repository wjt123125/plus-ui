<!--
  执行记录正文（原 ExecutionDetailDrawer 剥壳，2026-10-20 管理页 tab 化，databus-workspace-tabs.md §10 步骤3）。
  工作台 execution-record tab 与执行路由瘦壳裸页共用同一份，故不含 el-drawer；
  结构：总账（状态/耗时/错误/入参/出参 + 重跑）+ FULL 档节点明细时序表（BASIC 档显示空态提示）。
  自取数（recordId 变化即重载）；重跑仅 emit 上抛，由宿主决定开新记录 tab 还是切内部视图。
  红线：无路由依赖、不 import Layout、不自行 router.push。
-->
<template>
  <div v-loading="loading" class="exec-record">
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
        <el-descriptions :column="3" border size="small">
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
          <el-table-column prop="tag" label="tag（数据空间）" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="node-cell" :style="{ paddingLeft: depthPx(row) }" :title="ownerTip(row)">
                <span v-if="row.depth" class="node-subchain">↳ </span>{{ row.tag }}
              </span>
            </template>
          </el-table-column>
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

    <el-empty v-else-if="!loading" description="执行记录不存在或已被清理" />
  </div>
</template>

<script setup lang="ts" name="ExecutionRecordBody">
import { RefreshRight } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { getExecution, rerunExecution } from '@/api/databus/execution';
import type { DatabusExecutionResult, ExecutionDetailVo } from '@/api/databus/execution/types';
import JsonCodeEditor from '@/views/databus/editor/components/common/JsonCodeEditor.vue';

const props = defineProps<{
  /** 要展示的记录主键（雪花 id 超 2^53，故与 VO 同宽）；变化即重载 */
  recordId?: number | string | null;
}>();

const emit = defineEmits<{
  /** 重跑完成（宿主据此打开新记录 / 刷新列表） */
  rerun: [result: DatabusExecutionResult];
}>();

const detail = ref<ExecutionDetailVo>();
const loading = ref(false);
const rerunning = ref(false);

/** 加载详情 */
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
  () => props.recordId,
  (id) => {
    if (id !== null && id !== undefined && id !== '') {
      loadDetail(id);
    } else {
      detail.value = undefined;
    }
  },
  { immediate: true }
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

/** 子链行缩进：depth×16px（主链 0/null 顶格，与试运行明细同一视觉规则） */
const depthPx = (row: { depth?: number | null }) => `${(row.depth ?? 0) * 16}px`;

/** 子链行悬停提示所属链；主链行无提示 */
const ownerTip = (row: { depth?: number | null; ownerChain?: string | null }) =>
  row.depth ? `所属子链：${row.ownerChain ?? '-'}` : undefined;
</script>

<style lang="scss" scoped>
.exec-record {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
  padding: 20px 24px 32px;
  background: var(--el-bg-color, #fff);
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

.node-cell {
  display: inline-block;
  white-space: nowrap;
}

.node-subchain {
  color: var(--el-color-primary);
  font-weight: 600;
}
</style>