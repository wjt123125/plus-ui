<script setup lang="ts">
/**
 * 完整 AI 助手页。
 *
 * 直接复用工作台侧栏的对话面板（AgentChatPanel → MarkdownBlock），
 * 会话状态在 useAgentChat 模块级单例里，与侧栏共用同一份（按会话分桶）。
 * 不再走 SnailAI 自带前端，渲染口径完全由我们自己控制。
 */
import AgentChatPanel from '@/views/databus/workbench/ai/AgentChatPanel.vue';
import { useAgentChat } from '@/views/databus/workbench/ai/useAgentChat';

defineOptions({ name: 'AiChatPage' });

const { createSession } = useAgentChat();

function onNewSession() {
  createSession();
}
</script>

<template>
  <div class="ai-chat-page">
    <div class="ai-chat-head">
      <span class="ai-chat-head__title">数据总线助手</span>
      <el-button text size="small" @click="onNewSession">新会话</el-button>
    </div>
    <div class="ai-chat-body">
      <AgentChatPanel class="ai-chat-panel" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.ai-chat-page {
  height: calc(100vh - 123px);
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--app-surface-bg);
  border-radius: var(--app-radius-base);
  overflow: hidden;
}

.ai-chat-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.ai-chat-head__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

/* 整页比侧栏宽得多，正文与输入区收进一列，避免长行读不动 */
.ai-chat-body {
  flex: 1;
  min-height: 0;
  display: flex;
  justify-content: center;
}

.ai-chat-panel {
  width: 100%;
  max-width: 880px;
}

@media (max-width: 768px) {
  .ai-chat-page {
    height: calc(100vh - 88px);
  }
}
</style>