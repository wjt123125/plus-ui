<template>
  <div v-if="!collapsed" class="ai-hist-rail" :style="{ width: `${width}px` }">
    <!--
      会话历史栏（databus 工作台共享件）：AI 助手栏左边的**兄弟栏**，不再是 AI 栏内二级折叠。
      与 AI 栏同构——34px 头与各栏头齐平、宽度可拖、开合记 localStorage；**收起即宽度归零、
      不占位**，整栏开合的唯一入口在顶部 header。列表用 v-show 之外的常规渲染：
      v1 无会话后端（宿主传空数组走空态），将来接入接口后再评估是否需要保活滚动位。
    -->
    <div class="ai-hist-rail__head">
      <SvgIcon icon-class="lucide:history" class="ai-hist-rail__icon" />
      <span class="ai-hist-rail__title">会话历史</span>
      <span v-if="sessions.length" class="ai-hist-rail__count">{{ sessions.length }}</span>
    </div>

    <div class="ai-hist-rail__body">
      <p v-if="!sessions.length" class="ai-hist-rail__empty">暂无会话，开始提问后会在这里留存</p>
      <button
        v-for="s in sessions"
        :key="s.id"
        type="button"
        class="ai-hist-rail__item"
        :title="s.title"
        @click="emit('open', s)"
      >
        <SvgIcon icon-class="lucide:history" class="ai-hist-rail__item-icon" />
        <span class="ai-hist-rail__item-title">{{ s.title }}</span>
        <span v-if="s.time" class="ai-hist-rail__item-time">{{ s.time }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 会话历史栏 —— 与 AiAssistantRail 平级的最左栏。
 *
 * 折叠态与宽度在 useAiSessionHistory（模块级单例），两个工作台共用同一份；
 * 组件本身只消费状态、渲染列表，点击某次会话上抛 open 由宿主载入上下文。
 */
import type { AiSession } from './ai.types';

withDefaults(
  defineProps<{
    /** 收起时整栏不渲染（宽度归零），开合由宿主 header 控制 */
    collapsed: boolean;
    width: number;
    /** 会话列表；v1 无会话后端，宿主传空数组即走空态 */
    sessions?: AiSession[];
  }>(),
  { sessions: () => [] }
);

const emit = defineEmits<{
  /** 点了历史里的某次会话，宿主负责载入上下文 */
  (e: 'open', session: AiSession): void;
}>();
</script>

<style lang="scss" scoped>
.ai-hist-rail {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: var(--el-bg-color, #fff);
  border-right: 1px solid var(--el-border-color-lighter, #ebeef5);

  &__head {
    display: flex;
    align-items: center;
    gap: 8px;
    /* 34px：与顶部 header / AI 栏头 / 右栏抽屉 tab 同一条水平线 */
    height: 34px;
    flex-shrink: 0;
    padding: 0 8px 0 12px;
    border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
  }

  &__icon {
    flex-shrink: 0;
    font-size: 15px;
    color: var(--el-color-primary);
  }

  &__title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 700;
    color: var(--el-text-color-primary, #1d2129);
  }

  &__count {
    flex-shrink: 0;
    padding: 0 6px;
    border-radius: 8px;
    background: var(--el-fill-color, #f0f2f5);
    font-size: 11px;
    font-weight: 600;
    line-height: 16px;
    color: var(--el-text-color-secondary);
    font-variant-numeric: tabular-nums;
  }

  /* 整栏高度都归列表，滚动交给 body（旧二级折叠 220px 上限已随提级废除） */
  &__body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 6px 6px 8px;
  }

  &__empty {
    margin: 4px 6px 6px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--el-text-color-placeholder, #a8abb2);
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    height: 26px;
    padding: 0 6px;
    border: none;
    border-radius: var(--app-radius-sm);
    background: none;
    cursor: pointer;
    text-align: left;
    transition: background 0.2s;

    &:hover {
      background: var(--el-fill-color-light, #f5f7fa);
    }
  }

  &__item-icon {
    flex-shrink: 0;
    font-size: 13px;
    color: var(--el-text-color-placeholder, #a8abb2);
  }

  &__item-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: var(--el-text-color-primary, #1d2129);
  }

  &__item-time {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--el-text-color-placeholder, #a8abb2);
    font-variant-numeric: tabular-nums;
  }
}
</style>
