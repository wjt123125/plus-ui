<template>
  <el-drawer
    :model-value="visible"
    title="步骤明细"
    size="42%"
    append-to-body
    close-on-click-modal
    @update:model-value="emit('update:visible', $event)"
  >
    <template v-if="step">
      <el-descriptions :column="1" border size="small" style="margin-bottom: 12px">
        <el-descriptions-item label="数据空间">{{ step.tag || '-' }}</el-descriptions-item>
        <el-descriptions-item label="组件">{{ step.nodeName || step.nodeId || '-' }}</el-descriptions-item>
        <el-descriptions-item label="结果">
          <el-tag size="small" :type="step.success ? 'success' : 'danger'">
            {{ step.success ? '成功' : '失败' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="耗时">{{ step.timeSpent ?? '-' }} ms</el-descriptions-item>
        <el-descriptions-item label="开始时间">{{ step.startTime || '-' }}</el-descriptions-item>
        <el-descriptions-item label="结束时间">{{ step.endTime || '-' }}</el-descriptions-item>
      </el-descriptions>

      <el-alert
        v-if="!step.success && step.errorMessage"
        :title="step.errorMessage"
        type="error"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
      />

      <div class="step-detail__section-title">数据明细（{{ step.tag ? '$.' + step.tag : '本步' }} 快照）</div>
      <JsonCodeEditor
        v-if="prettyStepDetail"
        :model-value="prettyStepDetail"
        readonly
        height="320px"
      />
      <el-empty v-else description="本步未产出数据明细" :image-size="60" />
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { NodeStep } from '@/api/databus/el/types';
import JsonCodeEditor from '../common/JsonCodeEditor.vue';

const props = defineProps<{
  visible: boolean;
  step: NodeStep | null;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

/** 抽屉中数据明细的 2 空格缩进 JSON（后端给的是当场序列化的 JSON 字符串，非法时原样展示） */
const prettyStepDetail = computed(() => {
  const raw = props.step?.detailJson;
  if (!raw) return '';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
});
</script>

<style scoped>
.step-detail__section-title {
  margin: 4px 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
</style>
