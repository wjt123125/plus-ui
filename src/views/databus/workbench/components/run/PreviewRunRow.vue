<!--
  试运行行（画布「试运行」跑完写进终端的一条摘要）。
  终端只放语义摘要，大块结果进结果 tab——所以行尾是「详情 ↗」而不是就地展开。
-->
<template>
  <div
    class="run-row"
    :class="`is-${entry.level}`"
    data-context-type="preview-run"
    :data-context-anchor="`preview-${entry.id}`"
    :data-context-asset-type="entry.chainId ? 'chain' : undefined"
    :data-context-asset-id="entry.chainId ?? undefined"
    :data-context-asset-name="entry.title"
  >
    <span class="run-row__time">{{ entry.time }}</span>
    <span class="run-row__code" :title="entry.code">#{{ entry.code }}</span>
    <div class="run-row__text">
      <div class="run-row__line">
        <span class="run-row__source" :title="entry.title">{{ entry.title }}</span>
        <span class="run-row__result">{{ entry.level === 'success' ? '试运行通过' : '试运行失败' }}</span>
        <span v-if="entry.costMs" class="run-row__cost">{{ entry.costMs }} ms</span>
        <button type="button" class="run-row__action" @click="emit('view-preview', entry.id)">
          详情
          <SvgIcon icon-class="lucide:arrow-up-right" />
        </button>
      </div>
      <FoldableErrorText v-if="entry.level === 'error' && entry.text" class="run-row__error" :text="entry.text" />
    </div>
  </div>
</template>

<script setup lang="ts">
import FoldableErrorText from '@/views/databus/components/FoldableErrorText.vue';
import type { PreviewRunEntry } from '../../composables/useRunConsole';

defineOptions({ name: 'PreviewRunRow' });

defineProps<{
  entry: PreviewRunEntry;
}>();

const emit = defineEmits<{
  'view-preview': [runId: number];
}>();
</script>

<style lang="scss" scoped>
@use './_run-row.scss';

.run-row__source {
  overflow: hidden;
  max-width: 320px;
  color: var(--el-text-color-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
