<!--
  当前阶段：一条可变的状态行，可展开回看本次做了哪些操作。
  运行中标题套白光胶囊；结束后收成一句汇总。展开内容只活在内存里（阶段不落库）。
  头部与展开体沿用思考块的同一套排版（12px 灰字标题 + 边框箭头、左侧引导线 + 12.5px 灰字）。
-->
<template>
  <div class="agent-stage">
    <button
      type="button"
      class="agent-stage__head"
      :class="{ 'is-open': open }"
      :disabled="!expandable"
      :aria-expanded="expandable ? open : undefined"
      @click="toggle"
    >
      <span v-if="running" class="agent-stage__title db-live-chip">{{ stage.title }}</span>
      <span v-else class="agent-stage__text">{{ summary }}</span>
      <span v-if="expandable" class="agent-stage__chev" />
    </button>
    <div v-if="expandable && open" class="agent-stage__body">
      <div
        v-for="item in finished"
        :key="item.stepId"
        class="agent-stage__item"
        :class="`is-${item.status}`"
      >
        <span class="agent-stage__item-dot" />
        <span class="agent-stage__item-title">{{ item.title }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AgentStageSegment } from './useAgentChat';
import { AGENT_STEP_STATUS_RUNNING } from '@/constants/databus-agent';

const props = defineProps<{ stage: AgentStageSegment }>();

/** 展开/收起会让整条消息高度突变，宿主据此暂停贴底跟随 */
const emit = defineEmits<{ toggle: [open: boolean] }>();

const { t } = useI18n();

const open = ref(false);

const running = computed(() => props.stage.status === AGENT_STEP_STATUS_RUNNING);

/** 运行中的那一条已经由头部标题承载，展开体只列已结束的调用 */
const finished = computed(() => props.stage.items.filter((i) => i.status !== AGENT_STEP_STATUS_RUNNING));

/** 没有可展开的明细时不给箭头，避免点开一片空白 */
const expandable = computed(() => finished.value.length > 0);

const summary = computed(() => {
  if (props.stage.completed <= 0) {
    return t('ai.stage.failed');
  }
  return props.stage.failed > 0
    ? t('ai.stage.summaryFailed', { completed: props.stage.completed, failed: props.stage.failed })
    : t('ai.stage.summary', { completed: props.stage.completed });
});

function toggle() {
  if (!expandable.value) {
    return;
  }
  open.value = !open.value;
  emit('toggle', open.value);
}
</script>

<style scoped lang="scss">
.agent-stage {
  min-width: 0;
  margin: 0 0 8px;
}

/* 与思考块标题同一套字号/灰度、同一套内边距 */
.agent-stage__head {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 2px 6px 2px 0;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 12px;
  line-height: 1.6;
  text-align: left;
  cursor: pointer;
}

.agent-stage__head:disabled {
  cursor: default;
}

.agent-stage__head:not(:disabled):hover {
  color: var(--db-ink-secondary, #3a3a3c);
}

.agent-stage__title {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-weight: 600;
  color: var(--db-ink-muted, #6e6e73);
}

/* 胶囊自带内边距，这里不需要再用负边距对齐 */
.agent-stage__title.db-live-chip {
  margin-left: 0;
}

.agent-stage__text {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 与思考块同款边框箭头 */
.agent-stage__chev {
  flex: none;
  width: 6px;
  height: 6px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg) translateY(-1px);
  transition: transform 0.15s;
}

.agent-stage__head.is-open .agent-stage__chev {
  transform: rotate(-135deg) translateY(-1px);
}

/* 展开体与思考块正文同款：左侧引导线 + 小一号灰字 */
.agent-stage__body {
  max-height: 260px;
  overflow: auto;
  margin-top: 4px;
  padding-left: 10px;
  border-left: 2px solid var(--db-rule, rgba(60, 60, 67, 0.12));
}

.agent-stage__item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--db-ink-muted, #6e6e73);
}

.agent-stage__item-dot {
  flex: none;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--db-gray, #8e8e93);
}

.agent-stage__item.is-failed .agent-stage__item-dot {
  background: var(--db-red, #ff3b30);
}

.agent-stage__item-title {
  min-width: 0;
  flex: 0 1 auto;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
