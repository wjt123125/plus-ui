<template>
  <div v-if="!collapsed" class="ai-rail" :style="{ width: `${width}px` }">
    <!--
      AI 对话栏（databus 工作台共享件，v1 空壳）：欢迎空态 + 禁用输入框。
      宽度可自由拖拽（不设上下限）、开合记 localStorage。**收起即宽度归零、不占位**——原 44px mini rail 形态与
      根 div 上的 @click 已废除（它是「点收起无反应」Bug 的载体），开合的唯一入口在顶部 header。
      预留 select 事件钩子：后续 AI 助手可驱动资源树选中/右栏开 tab，载荷语义由消费页面定义。
    -->
    <div class="ai-rail__head">
      <el-icon class="ai-rail__spark"><MagicStick /></el-icon>
      <span class="ai-rail__title">{{ title }}</span>
    </div>

    <div class="ai-rail__body">
      <div class="ai-rail__welcome">
        <el-icon class="ai-rail__welcome-icon"><MagicStick /></el-icon>
        <p class="ai-rail__welcome-title">{{ welcomeTitle }}</p>
        <p class="ai-rail__welcome-desc">{{ welcomeDesc }}</p>
      </div>
    </div>

    <div class="ai-rail__input">
      <el-input disabled type="textarea" :rows="3" resize="none" :placeholder="inputPlaceholder" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { MagicStick } from '@element-plus/icons-vue';

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

defineEmits<{
  /** 预留：AI 选中某个业务对象（编码 / 链路 id），宿主做树联动 + 开 tab */
  (e: 'select', payload: string): void;
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
    color: var(--el-color-primary);
    font-size: 17px;
  }

  &__head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 12px 10px;
    border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
    flex-shrink: 0;
  }

  &__title {
    font-size: 14px;
    font-weight: 700;
    color: var(--el-text-color-primary, #1d2129);
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
    font-size: 34px;
    padding: 14px;
    border-radius: 14px;
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9, #ecf2ff);
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
    padding: 10px 12px 14px;
    border-top: 1px solid var(--el-border-color-lighter, #ebeef5);
  }
}
</style>
