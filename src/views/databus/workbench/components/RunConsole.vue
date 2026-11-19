<!--
  运行控制台（终端「运行」tab）：链路执行与画布试运行共用一条流。
  本组件只管列表骨架、空态、自动滚动，以及按 source 分派行组件；
  两类行的列布局与详情动作各自封装在 ChainRunRow / PreviewRunRow。
-->
<template>
  <section class="rc-console" aria-label="运行输出">
    <div ref="bodyRef" class="rc-console__body">
      <div v-if="!entries.length" class="rc-console__empty">
        暂无运行输出——执行链路或在画布上试运行，结果显示在这里
      </div>
      <template v-for="entry in entries" :key="entry.id">
        <ChainRunRow
          v-if="entry.source === 'chain'"
          :entry="entry"
          @view-record="(recordId) => onViewRecord(entry, recordId)"
        />
        <PreviewRunRow
          v-else-if="entry.source === 'preview'"
          :entry="entry"
          @view-preview="(runId) => emit('view-preview', runId, entry.title)"
        />
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useStickToBottom } from '@/hooks/scroll/useStickToBottom';
import ChainRunRow from './run/ChainRunRow.vue';
import PreviewRunRow from './run/PreviewRunRow.vue';
import { useRunConsole, type ChainRunEntry } from '../composables/useRunConsole';

defineOptions({ name: 'RunConsole' });

/** 「详情 ↗」上抛宿主：execution-record tab / 试运行结果 tab */
const emit = defineEmits<{
  (e: 'view-record', recordId: number | string, title?: string): void;
  (e: 'view-preview', runId: number, title?: string): void;
}>();

const { entries } = useRunConsole();

const bodyRef = ref<HTMLElement>();
// 新输出跟随到底部（terminal 惯例）；用户上滑查看历史时自动暂停，不再被新输出拽回
useStickToBottom(bodyRef);

function onViewRecord(entry: ChainRunEntry, recordId: number | string) {
  emit('view-record', recordId, entry.code ? `执行记录 · ${entry.code}` : undefined);
}
</script>

<style lang="scss" scoped>
.rc-console {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.rc-console__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 0 8px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  line-height: 1.7;
}

.rc-console__empty {
  padding: 24px 0;
  text-align: center;
  color: var(--el-text-color-placeholder);
}
</style>
