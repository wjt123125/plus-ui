<template>
  <el-dialog
    :model-value="visible"
    title="试运行结果"
    width="860px"
    append-to-body
    :close-on-click-modal="true"
    @update:model-value="emit('update:visible', $event)"
  >
    <template v-if="result">
      <el-alert
        :title="resultBanner"
        :type="result.executed ? (result.success ? 'success' : 'error') : 'warning'"
        :closable="false"
        show-icon
        style="margin-bottom: 10px"
      />
      <el-alert
        v-if="result.errorMessage"
        :title="result.errorMessage"
        type="error"
        :closable="false"
        show-icon
        style="margin-bottom: 10px"
      />
      <el-alert
        v-if="result.valid === false && result.message"
        :title="result.message"
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 10px"
      />

      <el-descriptions :column="1" border size="small" style="margin-bottom: 10px">
        <el-descriptions-item label="EL 表达式">
          <el-input :model-value="result.elStr" type="textarea" :rows="3" readonly />
        </el-descriptions-item>
      </el-descriptions>

      <template v-if="result.executed">
        <!-- response 组件产出 $.response 置顶高亮 -->
        <template v-if="responsePart !== null">
          <div class="preview-result__response-title">$.response（流程响应）</div>
          <el-input
            :model-value="JSON.stringify(responsePart, null, 2)"
            type="textarea"
            :rows="4"
            readonly
            class="preview-result__response-box"
          />
        </template>

        <div class="preview-result__section-title">
          执行步骤（{{ result.steps?.length ?? 0 }}）
        </div>
        <el-table :data="result.steps ?? []" size="small" border style="margin-bottom: 10px">
          <el-table-column type="index" label="#" width="42" />
          <el-table-column label="数据空间" prop="tag" min-width="120" show-overflow-tooltip />
          <el-table-column label="节点标题" min-width="130">
            <template #default="{ row }">
              <div class="preview-result__step-nodeid">{{ row.nodeId }}</div>
              <div class="preview-result__step-title">{{ resolveStepTitle(row) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="结果" width="70">
            <template #default="{ row }">
              <el-tag size="small" :type="row.success ? 'success' : 'danger'">
                {{ row.success ? '成功' : '失败' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="耗时(ms)" prop="timeSpent" width="84" />
          <el-table-column label="执行结果" min-width="180">
            <template #default="{ row }">
              <span
                class="preview-result__step-result"
                :class="{ 'is-error': !row.success }"
                @click="emit('openStep', row)"
              >{{ stepResultText(row) }}</span>
            </template>
          </el-table-column>
        </el-table>

        <div class="preview-result__section-title">执行后上下文（JSON 快照）</div>
        <JsonCodeEditor
          :model-value="prettyContext"
          readonly
          height="280px"
        />
      </template>
    </template>
    <template #footer>
      <el-button @click="emit('update:visible', false)">关闭</el-button>
      <el-button type="success" @click="emit('reopen')">再跑一次</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { NodeStep, PreviewRunVo } from '@/api/databus/el/types';
import JsonCodeEditor from '../common/JsonCodeEditor.vue';

const props = defineProps<{
  visible: boolean;
  result: PreviewRunVo | null;
  /** 步骤标题推断依赖当前画布模型树，由 composable 注入 */
  resolveStepTitle: (row: NodeStep) => string;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  reopen: [];
  openStep: [row: NodeStep];
}>();

const resultBanner = computed(() => {
  const r = props.result;
  if (!r) return '';
  if (r.executed) return r.success ? '执行成功' : '执行失败（见步骤表与错误信息）';
  return r.valid === false ? 'EL 校验未通过，未执行' : '未执行';
});

/** 上下文快照解析为对象（后端给的是 JSON 字符串） */
const contextObj = computed<unknown>(() => {
  const raw = props.result?.contextJson;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

/** $.response 片段（response 组件固定写这里），置顶单独展示 */
const responsePart = computed<unknown>(() => {
  const obj = contextObj.value;
  if (obj && typeof obj === 'object' && 'response' in obj) {
    return (obj as Record<string, unknown>).response;
  }
  return null;
});

const prettyContext = computed(() => {
  const obj = contextObj.value;
  if (obj === null) return props.result?.contextJson ?? '';
  return JSON.stringify(obj, null, 2);
});

/** 步骤表「执行结果」列文本：成功用组件自报摘要，未报兜底「完成」；失败显示错误信息 */
function stepResultText(row: NodeStep): string {
  if (!row.success) {
    return row.errorMessage || '执行失败';
  }
  return row.summary || '完成';
}
</script>

<style scoped>
.preview-result__section-title {
  margin: 4px 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.preview-result__response-title {
  margin: 4px 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-success);
}

.preview-result__response-box {
  margin-bottom: 10px;
}

.preview-result__response-box :deep(textarea) {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  background-color: var(--el-color-success-light-9);
}

.preview-result__step-result {
  display: inline-block;
  max-width: 240px;
  overflow: hidden;
  font-size: 12px;
  color: var(--el-color-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.preview-result__step-result:hover {
  text-decoration: underline;
}

.preview-result__step-result.is-error {
  color: var(--el-color-danger);
}

.preview-result__step-nodeid {
  overflow: hidden;
  font-size: 11px;
  line-height: 1.3;
  color: var(--el-text-color-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-result__step-title {
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--el-text-color-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
