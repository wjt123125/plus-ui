<!-- 链路执行行：编码 + 成败 + 耗时，有总账记录时行尾「详情 ↗」跳执行记录 tab -->
<template>
  <div class="run-row" :class="`is-${entry.level}`">
    <span class="run-row__time">{{ entry.time }}</span>
    <span class="run-row__code">#{{ entry.code }}</span>
    <div class="run-row__text">
      <div class="run-row__line">
        <span class="run-row__result">{{ entry.level === 'success' ? '执行成功' : '执行失败' }}</span>
        <span v-if="entry.costMs != null" class="run-row__cost">{{ entry.costMs }} ms</span>
        <button v-if="entry.recordId" type="button" class="run-row__action" @click="viewRecord">
          详情
          <SvgIcon icon-class="lucide:arrow-up-right" />
        </button>
      </div>
      <div v-if="entry.level === 'error' && entry.text" class="run-row__error">{{ entry.text }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChainRunEntry } from '../../composables/useRunConsole';

defineOptions({ name: 'ChainRunRow' });

const props = defineProps<{
  entry: ChainRunEntry;
}>();

const emit = defineEmits<{
  (e: 'view-record', recordId: number | string): void;
}>();

function viewRecord() {
  if (props.entry.recordId) {
    emit('view-record', props.entry.recordId);
  }
}
</script>

<style lang="scss" scoped>
@use './_run-row.scss';
</style>
