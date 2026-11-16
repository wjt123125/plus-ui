<!--
  试运行结果 tab：终端「运行」流点「详情」打开。
  结果本体不落库（在内存 useRunConsole，与终端同生命周期），所以刷新后 tab 只剩空态。
-->
<template>
  <div class="preview-pane">
    <el-empty
      v-if="!entry"
      description="试运行结果不跨刷新保留，请回到画布重新运行"
      :image-size="80"
    />

    <template v-else>
      <!-- 内容列与其他 pane 同口径（.db-pane-inner），但比表单页窄：结果页横向拉满会显散。
           页头不再重复 tab 标题与成败 tag——成败、时间、步骤数都并进正文结论行 -->
      <div class="preview-pane__scroll">
        <div class="db-pane-inner">
          <PreviewResultBody
            :result="entry.result"
            :resolve-step-title="resolveStepTitle"
            :request-json="entry.requestJson"
            :time="entry.time"
            @open-step="openStep"
          />
        </div>
      </div>
    </template>

    <StepDetailDrawer v-model:visible="stepVisible" :step="currentStep" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { NodeStep } from '@/api/databus/el/types';
import StepDetailDrawer from '@/views/databus/editor/components/dialogs/StepDetailDrawer.vue';
import PreviewResultBody from '@/views/databus/editor/components/dialogs/PreviewResultBody.vue';
import { useRunConsole } from '@/views/databus/workbench/composables/useRunConsole';

defineOptions({ name: 'PreviewResultPane' });

const props = defineProps<{
  /** 终端运行行 id（结果本体按它从内存运行流里取） */
  runId: number;
}>();

const { entries } = useRunConsole();

/** 只有 preview 行带完整结果；链路行点不进这里 */
const entry = computed(() => {
  const hit = entries.value.find((e) => e.id === props.runId);
  return hit && hit.source === 'preview' ? hit : null;
});

const stepVisible = ref(false);
const currentStep = ref<NodeStep | null>(null);

function openStep(row: NodeStep) {
  currentStep.value = row;
  stepVisible.value = true;
}

/** 标题快照优先（运行时的组件名），快照缺失再退 nodeId */
function resolveStepTitle(row: NodeStep): string {
  if (row.title?.trim()) {
    return row.title;
  }
  if (row.tag && entry.value?.titleByTag[row.tag]) {
    return entry.value.titleByTag[row.tag];
  }
  return row.nodeName || row.nodeId || '';
}
</script>

<style scoped>
.preview-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.preview-pane__scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

/* 结果页比表单页更窄：720px 之外全是留白，避免单行信息被拉成三截 */
.preview-pane :deep(.db-pane-inner) {
  max-width: 720px;
}
</style>
