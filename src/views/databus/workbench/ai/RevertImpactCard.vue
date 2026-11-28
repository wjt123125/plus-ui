<!--
  回退影响确认卡：点「回退到本轮对话发起前」后一律先摊开这一轮将撤销 / 将跳过 / 受影响的清单，
  用户确认后才真正执行。撤回是必须实现的能力，这张卡只负责告知，不替用户拦掉可撤项。
  刻意不复用 AgentCard 协议：那张卡会回执进模型上下文，这张只是本地的一次确认。
-->
<template>
  <div ref="rootRef" class="revert-card" tabindex="-1" @keydown="onKeydown">
    <div class="revert-card__head">
      <span class="revert-card__icon"><SvgIcon icon-class="lucide:undo-2" /></span>
      <span class="revert-card__title">回退到本轮对话发起前</span>
    </div>
    <p class="revert-card__summary">
      <span>将撤销 <b>{{ preview.revert.length }}</b> 项</span>
      <template v-if="preview.skip.length">
        <span class="revert-card__sep">·</span>
        <span>跳过 <b>{{ preview.skip.length }}</b> 项</span>
      </template>
      <template v-if="preview.affected.length">
        <span class="revert-card__sep">·</span>
        <span>影响 <b>{{ preview.affected.length }}</b> 条链路</span>
      </template>
    </p>

    <div class="revert-card__groups">
      <section v-if="preview.revert.length" class="revert-card__group">
        <p class="revert-card__group-head">将撤销</p>
        <ul class="revert-card__list">
          <li v-for="item in preview.revert" :key="keyOf(item)" class="revert-card__item">
            <span class="revert-card__dot is-revert" />
            <span class="revert-card__name" :title="nameOf(item)">{{ nameOf(item) }}</span>
            <span class="revert-card__meta">{{ actionText(item) }}</span>
          </li>
        </ul>
      </section>

      <section v-if="preview.skip.length" class="revert-card__group">
        <p class="revert-card__group-head">将跳过</p>
        <ul class="revert-card__list">
          <li v-for="item in preview.skip" :key="keyOf(item)" class="revert-card__item">
            <span class="revert-card__dot is-skip" />
            <span class="revert-card__name" :title="nameOf(item)">{{ nameOf(item) }}</span>
            <span class="revert-card__reason">{{ item.reason || '当前状态无法回退' }}</span>
          </li>
        </ul>
      </section>

      <section v-if="preview.affected.length" class="revert-card__group">
        <p class="revert-card__group-head">受影响的引用方</p>
        <ul class="revert-card__list">
          <li v-for="item in preview.affected" :key="keyOf(item)" class="revert-card__item">
            <span class="revert-card__dot is-ref" />
            <span class="revert-card__name" :title="nameOf(item)">{{ nameOf(item) }}</span>
            <span class="revert-card__reason">{{ item.reason || '引用了将被撤销的资源' }}</span>
          </li>
        </ul>
      </section>
    </div>

    <div class="revert-card__actions">
      <button type="button" class="revert-card__cancel" :disabled="busy" @click="emit('cancel')">
        <span>取消</span>
        <kbd class="revert-card__key">Esc</kbd>
      </button>
      <button type="button" class="revert-card__confirm" :disabled="busy" @click="emit('confirm')">
        {{ busy ? '回退中…' : confirmLabel }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import type { AgentRollbackVo, AgentRevertPreviewVo } from '@/api/databus/agent/types';

const props = defineProps<{
  preview: AgentRevertPreviewVo;
  /** 正在落库回退：锁住两个按钮，避免重复提交 */
  busy?: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();

const rootRef = ref<HTMLElement>();

/** 有跳过项时在按钮上标出数量，让用户知道确认后仍有少量资源留在原处 */
const confirmLabel = computed(() =>
  props.preview.skip.length ? `确认回退（跳过 ${props.preview.skip.length} 项）` : '确认回退'
);

function keyOf(item: AgentRollbackVo) {
  return `${item.resourceType}:${item.resourceId}`;
}

function nameOf(item: AgentRollbackVo) {
  return item.resourceName || item.resourceCode || String(item.resourceId);
}

function actionText(item: AgentRollbackVo) {
  if (item.action === 'RESTORE') {
    return '写回改动';
  }
  if (item.action === 'DELETE') {
    return item.resourceType === 'CHAIN' ? '撤销新建' : '撤回组件';
  }
  return '';
}

/** Esc 取消；Enter 不确认，破坏性操作只认显式点击 */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !props.busy) {
    event.preventDefault();
    event.stopPropagation();
    emit('cancel');
  }
}

onMounted(() => {
  void nextTick(() => rootRef.value?.focus());
});
</script>

<style scoped lang="scss">
.revert-card {
  box-sizing: border-box;
  width: 100%;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--db-fill, rgba(60, 60, 67, 0.06));
  /* 危险色只出现在描边与图标上，底色保持中性，不整块铺红 */
  box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--db-red, #ff3b30) 26%, transparent);
  outline: none;
}

.revert-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.revert-card__icon {
  display: inline-flex;
  color: var(--db-red, #ff3b30);
  font-size: 14px;
}

.revert-card__title {
  color: var(--db-ink, #1c1c1e);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
}

.revert-card__summary {
  margin: 4px 0 0;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 12px;
  line-height: 1.6;
}

.revert-card__summary b {
  color: var(--db-ink-secondary, #3a3a3c);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.revert-card__sep {
  margin: 0 4px;
}

.revert-card__groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

.revert-card__group-head {
  margin: 0 0 4px;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.5;
}

.revert-card__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.revert-card__item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 3px 0;
  font-size: 12.5px;
  line-height: 1.55;
}

.revert-card__dot {
  flex: none;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--db-ink-muted, #6e6e73);
}

.revert-card__dot.is-revert {
  background: var(--db-red, #ff3b30);
}

.revert-card__dot.is-skip {
  background: var(--db-orange, #ff9500);
}

.revert-card__dot.is-ref {
  background: var(--db-accent, #1c1c1e);
}

.revert-card__name {
  flex: none;
  max-width: 55%;
  overflow: hidden;
  color: var(--db-ink-primary, #1d1d1f);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.revert-card__meta {
  flex: none;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 11.5px;
}

.revert-card__reason {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 11.5px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.revert-card__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

/* 取消：极浅灰底，与 AgentCard 的次级按钮同一套观感 */
.revert-card__cancel {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px 0 16px;
  border: 0;
  border-radius: 8px;
  background: var(--db-fill, rgba(60, 60, 67, 0.07));
  color: var(--db-ink-secondary, #3a3a3c);
  font-size: 12.5px;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}

.revert-card__cancel:hover:not(:disabled) {
  background: var(--db-bg-hover, rgba(120, 120, 128, 0.14));
  color: var(--db-ink, #1c1c1e);
}

/* 确认：墨黑实心，与发送 / 确认执行同一套语言 */
.revert-card__confirm {
  height: 28px;
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  background: var(--db-ink, #1c1c1e);
  color: var(--db-bg-solid, #fff);
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.15s,
    opacity 0.15s;
}

.revert-card__confirm:hover:not(:disabled) {
  background: var(--db-ink-secondary, #3a3a3c);
}

.revert-card__cancel:disabled,
.revert-card__confirm:disabled {
  opacity: 0.5;
  cursor: default;
}

.revert-card__key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border: 0;
  border-radius: 5px;
  background: color-mix(in srgb, currentColor 18%, transparent);
  color: inherit;
  font-family: inherit;
  font-size: 10.5px;
  line-height: 1;
}
</style>