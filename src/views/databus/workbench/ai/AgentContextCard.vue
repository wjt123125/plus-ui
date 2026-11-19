<!--
  会话上下文卡（§22.3）：已发消息里的上下文以行内卡片呈现。
  形态对齐 Trae：无边框无底色，前置一个统一的会话图标 + 序号，文字沿用输入框的字体；
  点整行打开详情。输入区的卡片是 AgentComposer 的命令式芯片，不走本组件。
-->
<template>
  <span class="ctx-card" :title="item.title">
    <SvgIcon class="ctx-card__lead-icon" icon-class="lucide:message-square-more" />
    <button type="button" class="ctx-card__main" @click="emit('open', $event.currentTarget as HTMLElement)">
      <span class="ctx-card__quote">{{ prefix }}{{ quote }}</span>
      <span v-if="item.note" class="ctx-card__note">· {{ item.note }}</span>
    </button>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AgentContextItem } from './contextTypes';

defineOptions({ name: 'AgentContextCard' });

const props = defineProps<{
  item: AgentContextItem;
  /** 同组内的序号，从 1 起；多条上下文靠它区分 */
  index?: number;
}>();

const emit = defineEmits<{
  /** 带上触发元素，详情浮层贴在这张卡片旁边 */
  open: [anchor: HTMLElement];
}>();

/** 序号与来源角标一一对应：同一条上下文在画布角标和会话卡片上看到的是同一个数字 */
const prefix = computed(() => (props.index ? `${props.index}. ` : ''));

/** preview 生成时已截过，这里只兜住历史数据里更长的预览 */
const quote = computed(() => {
  const text = props.item.preview || props.item.title;
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
});
</script>

<style lang="scss" scoped>
.ctx-card {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  vertical-align: middle;
  /* 宽度跟着内容走，到上限才截断：短引文不会拖一条长空白 */
  width: fit-content;
  max-width: 160px;
  height: 24px;
  padding: 0 2px 0 0;
  border-radius: 6px;
  transition: background-color 0.15s;

  &:hover {
    background: var(--db-bg-hover, rgba(120, 120, 128, 0.08));
  }
}

.ctx-card__lead-icon {
  flex: none;
  width: 14px;
  height: 14px;
  color: var(--db-ink-muted, #6e6e73);
}

/* 与输入框同一套字：13px / 1.75 行高，卡片和正文才像一体 */
.ctx-card__main {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--db-ink-secondary, #3a3a3c);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.75;
  text-align: left;
  cursor: pointer;
}

.ctx-card__quote {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ctx-card__note {
  min-width: 0;
  max-width: 50%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--db-ink-muted, #6e6e73);
}
</style>
