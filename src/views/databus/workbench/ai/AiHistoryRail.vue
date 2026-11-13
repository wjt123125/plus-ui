<template>
  <div v-if="!collapsed" class="ai-hist-rail" :style="{ width: `${width}px` }">
    <!--
      会话历史栏（databus 工作台共享件）：AI 助手栏左边的**兄弟栏**，不再是 AI 栏内二级折叠。
      与 AI 栏同构——34px 头与各栏头齐平、宽度可拖、开合记 localStorage；**收起即宽度归零、
      不占位**，整栏开合的唯一入口在顶部 header。会话数据由宿主（useAgentChat.sessionList）
      喂入，点击只上抛 open，切换会话与拉历史都由状态层负责；空态仍保留提示。
    -->
    <div class="ai-hist-rail__head">
      <SvgIcon icon-class="lucide:history" class="ai-hist-rail__icon" />
      <span class="ai-hist-rail__title">会话历史</span>
      <span v-if="sessions.length" class="ai-hist-rail__count">{{ sessions.length }}</span>
      <el-tooltip content="新建会话" placement="bottom">
        <button type="button" class="ai-hist-rail__new" @click="emit('new')">
          <SvgIcon icon-class="lucide:plus" />
        </button>
      </el-tooltip>
    </div>

    <div class="ai-hist-rail__body">
      <p v-if="!sessions.length" class="ai-hist-rail__empty">暂无会话，开始提问后会在这里留存</p>
      <button
        v-for="s in sessions"
        :key="s.id"
        type="button"
        class="ai-hist-rail__item"
        :class="{ 'is-active': s.id === activeId }"
        :title="s.title"
        @click="emit('open', s)"
      >
        <span v-if="s.running" class="ai-hist-rail__dot" title="运行中" />
        <SvgIcon v-else icon-class="lucide:history" class="ai-hist-rail__item-icon" />
        <span class="ai-hist-rail__item-title">{{ s.title }}</span>
        <span v-if="s.time" class="ai-hist-rail__item-time">{{ s.time }}</span>
      </button>
    </div>

    <!-- 栏底插槽（n8n 式用户区位）：宿主注入 WorkbenchUserBar，栏自身保持零业务依赖 -->
    <div v-if="$slots.footer" class="ai-hist-rail__footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 会话历史栏 —— 与 AiAssistantRail 平级的最左栏。
 *
 * 折叠态与宽度在 useAiSessionHistory（模块级单例），两个工作台共用同一份；
 * 组件本身只消费状态、渲染列表，点某条会话上抛 open（宿主切会话并拉历史），
 * 点表头「＋新建」上抛 new（宿主新建会话桶），组件不碰接口也不存状态。
 */
import type { AiSession } from './ai.types';

withDefaults(
  defineProps<{
    /** 收起时整栏不渲染（宽度归零），开合由宿主 header 控制 */
    collapsed: boolean;
    width: number;
    /** 会话列表（useAgentChat.sessionList），空数组即走空态 */
    sessions?: AiSession[];
    /** 当前激活会话 id，用于高亮当前项 */
    activeId?: string;
  }>(),
  { sessions: () => [], activeId: '' }
);

const emit = defineEmits<{
  /** 点了历史里的某条会话，宿主负责切换并载入上下文 */
  (e: 'open', session: AiSession): void;
  /** 点了「＋新建」，宿主负责建新会话并切过去 */
  (e: 'new'): void;
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

  /* 表头新建钮：与链树头部「＋」同规格，图标按钮不抢标题视觉 */
  &__new {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: var(--app-radius-sm);
    background: none;
    color: var(--el-text-color-secondary);
    font-size: 14px;
    cursor: pointer;
    transition:
      background 0.2s,
      color 0.2s;

    &:hover {
      background: var(--el-fill-color-light, #f5f7fa);
      color: var(--el-color-primary);
    }
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

    /* 当前会话：淡主色底 + 主色标题，与「选中」语义一致 */
    &.is-active {
      background: var(--el-color-primary-light-9, #ecf5ff);

      .ai-hist-rail__item-title {
        color: var(--el-color-primary);
        font-weight: 600;
      }

      .ai-hist-rail__item-icon {
        color: var(--el-color-primary);
      }
    }
  }

  /* 运行中圆点：替代图标位，呼吸提示该会话还有 run 在跑 */
  &__dot {
    flex-shrink: 0;
    width: 6px;
    height: 6px;
    margin: 0 3.5px;
    border-radius: 50%;
    background: var(--el-color-primary);
    animation: ai-hist-rail-pulse 1.4s ease-in-out infinite;
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

  /* 栏底用户区：不加顶边线，靠列表自身留白分隔 */
  &__footer {
    flex-shrink: 0;
    padding: 6px;
  }
}

@keyframes ai-hist-rail-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.35;
  }
}
</style>
