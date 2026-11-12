<template>
  <div v-if="!collapsed" class="ai-rail" :style="{ width: `${width}px` }">
    <!--
      AI 对话栏（databus 工作台共享件，v1 空壳）：欢迎空态 + 禁用输入框。
      宽度可自由拖拽、开合记 localStorage。**收起即宽度归零、不占位**——原 44px mini rail 形态与
      根 div 上的 @click 已废除（它是「点收起无反应」Bug 的载体），整栏开合的唯一入口在顶部 header。
      「会话历史」是本栏左边的兄弟栏（AiHistoryRail 共享件），不再内嵌于此；本栏收起或被拖到最窄时
      历史栏会单向连带收起（联动在宿主的 bindHistoryToAi 里），历史栏自身展开仍走 header。
      预留 select 事件钩子：后续 AI 助手可驱动资源树选中/右栏开 tab，载荷语义由消费页面定义。
    -->
    <!-- 头部 30px：与工作台顶部 header、会话历史栏头、右栏抽屉 tab、资源树头同一条水平线 -->
    <div class="ai-rail__head">
      <SvgIcon class="ai-rail__spark" icon-class="lucide:sparkle-filled" />
      <span class="ai-rail__title">{{ title }}</span>
      <el-tooltip content="新会话" placement="bottom">
        <button type="button" class="ai-rail__head-btn" @click="emit('new-session')">
          <SvgIcon icon-class="lucide:message-square-plus" />
        </button>
      </el-tooltip>
    </div>

    <!-- 默认插槽：宿主注入真实对话面板（AgentChatPanel）时接管 body + input 区，栏只留头部 -->
    <div v-if="$slots.default" class="ai-rail__panel">
      <slot />
    </div>

    <template v-else>
      <div class="ai-rail__body">
        <div class="ai-rail__welcome">
          <SvgIcon class="ai-rail__welcome-icon" icon-class="lucide:sparkle-filled" />
          <p class="ai-rail__welcome-title">{{ welcomeTitle }}</p>
          <p class="ai-rail__welcome-desc">{{ welcomeDesc }}</p>
        </div>
      </div>

      <div class="ai-rail__input">
        <el-input disabled type="textarea" :rows="3" resize="none" :placeholder="inputPlaceholder" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useLucideSubset } from '../composables/useLucideSubset';

withDefaults(
  defineProps<{
    /** 收起时整栏不渲染（宽度归零），开合由宿主 header 控制 */
    collapsed: boolean;
    width: number;
    title?: string;
    welcomeTitle?: string;
    welcomeDesc?: string;
    inputPlaceholder?: string;
  }>(),
  {
    title: 'AI 助手',
    welcomeTitle: 'AI 助手',
    welcomeDesc: '用自然语言完成查询、配置与排障。',
    inputPlaceholder: 'AI 助手开发中，敬请期待…'
  }
);

/** 身份图标走 lucide 子集，离线可用（与工作台其它图标同源） */
useLucideSubset();

const emit = defineEmits<{
  /** 预留：AI 选中某个业务对象（编码 / 链路 id），宿主做树联动 + 开 tab */
  (e: 'select', payload: string): void;
  /** 点了「新会话」，宿主负责开一轮空白对话 */
  (e: 'new-session'): void;
}>();
</script>

<style lang="scss" scoped>
.ai-rail {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--el-bg-color, #fff);
  border-right: 1px solid var(--el-border-color-lighter, #ebeef5);
  height: 100%;
  overflow: hidden;

  &__spark {
    flex: none;
    color: var(--db-blue, #007aff);
    font-size: 15px;
  }

  &__head {
    display: flex;
    align-items: center;
    gap: 8px;
    /* 34px：与顶部 header / 右栏抽屉 tab / 资源树头齐平（point 4） */
    height: 34px;
    flex-shrink: 0;
    padding: 0 8px 0 12px;
    border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
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

  &__head-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: var(--app-radius-sm);
    background: none;
    cursor: pointer;
    color: var(--el-text-color-secondary);
    font-size: 15px;
    transition: all 0.2s;

    &:hover {
      background: var(--el-fill-color-light, #f5f7fa);
      color: var(--el-color-primary);
    }
  }

  &__panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  &__body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px 14px;
  }

  &__welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 8px;
    padding: 48px 8px 0;
  }

  &__welcome-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    padding: 14px;
    border-radius: 14px;
    color: var(--db-blue, #007aff);
    background: rgba(0, 122, 255, 0.1);
  }

  &__welcome-title {
    margin: 6px 0 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--el-text-color-primary, #1d2129);
  }

  &__welcome-desc {
    margin: 0;
    font-size: 12px;
    line-height: 1.7;
    color: var(--el-text-color-secondary);
  }

  &__input {
    flex-shrink: 0;
    padding: 10px 12px 12px;
  }
}
</style>
