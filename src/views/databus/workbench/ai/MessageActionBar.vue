<template>
  <div v-if="role && (inlineActions.length || moreActions.length || isReply)" class="msg-actions" :class="`is-${role}`">
    <button
      v-for="action in inlineActions"
      :key="action.key"
      type="button"
      class="msg-actions__btn"
      :title="action.label"
      :aria-label="action.label"
      :disabled="action.disabled?.(ctx)"
      @click="action.run(ctx)"
    >
      <SvgIcon :icon-class="action.icon" />
    </button>
    <!-- 「更多」常驻：这一期还没有更多动作，先留着入口，后续注册即可长出菜单项 -->
    <el-dropdown
      v-if="showMore"
      trigger="click"
      placement="bottom-end"
      popper-class="db-menu-popper"
      @command="runMore"
    >
      <button type="button" class="msg-actions__btn" title="更多" aria-label="更多">
        <!-- 实心横排三点（跨页规范）：直接内联 SVG，不吃图标字体/子集 -->
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle cx="2.5" cy="8" r="1.1" fill="currentColor" />
          <circle cx="8" cy="8" r="1.1" fill="currentColor" />
          <circle cx="13.5" cy="8" r="1.1" fill="currentColor" />
        </svg>
      </button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item
            v-for="action in moreActions"
            :key="action.key"
            class="db-menu-item"
            :command="action.key"
            :disabled="action.disabled?.(ctx)"
          >
            <SvgIcon :icon-class="action.icon" />
            <span>{{ action.label }}</span>
          </el-dropdown-item>
          <el-dropdown-item v-if="!moreActions.length" class="db-menu-item" disabled>
            <span>暂无更多操作</span>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
/**
 * 通用消息工具栏。
 *
 * 只负责「渲染注册表里的动作」，不内置任何具体工具；具体有哪些按钮由 messageActions.ts
 * 的注册结果决定，因此新增工具不用改这个组件，也不用改调用方。
 * 显隐由所在消息行控制（hover 才出现），这里只负责布局与对齐。
 */
import { computed } from 'vue';
import type { AgentChatMessage } from './useAgentChat';
import {
  messageActionList,
  type MessageAction,
  type MessageActionContext,
  type MessageActionDeps,
  type MessageActionRole
} from './messageActions';

const props = defineProps<{
  /** 工具栏所属消息 */
  message: AgentChatMessage;
  /** 同一轮的提问 */
  question?: AgentChatMessage;
  /** 同一轮的回复 */
  reply?: AgentChatMessage;
  /** 是否最后一轮（重试只对最后一轮开放） */
  lastTurn: boolean;
  /** 会话是否有 run 在跑 */
  running: boolean;
  /** 面板提供的能力实现 */
  deps: MessageActionDeps;
}>();

const role = computed<MessageActionRole | null>(() =>
  props.message.role === 'system' ? null : props.message.role
);

const isReply = computed(() => role.value === 'assistant');

const ctx = computed<MessageActionContext>(() => ({
  message: props.message,
  question: props.question,
  reply: props.reply,
  lastTurn: props.lastTurn,
  running: props.running,
  deps: props.deps
}));

const inlineActions = computed<MessageAction[]>(() =>
  role.value ? messageActionList(role.value, 'inline', ctx.value) : []
);

const moreActions = computed<MessageAction[]>(() =>
  role.value ? messageActionList(role.value, 'more', ctx.value) : []
);

const showMore = computed(() => isReply.value || moreActions.value.length > 0);

/** 「更多」菜单点选：按 key 找回注册项再执行 */
function runMore(key: string) {
  void moreActions.value.find((action) => action.key === key)?.run(ctx.value);
}
</script>

<style lang="scss" scoped>
.msg-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 24px;
  margin-top: 2px;

  /* 只对 AI 侧右对齐拉齐气泡起点；用户侧由外层列容器控制靠右 */
  &.is-assistant {
    justify-content: flex-start;
  }
}

/* 图标钮：默认安静，hover 才给底色；工具栏整体显隐由外层 .agent-chat__row:hover 控制 */
.msg-actions__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: var(--db-r-tag, 7px);
  background: transparent;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 13px;
  cursor: pointer;
  transition:
    background var(--db-dur-fast, 0.14s) var(--db-ease, ease),
    color var(--db-dur-fast, 0.14s) var(--db-ease, ease);

  &:hover:not(:disabled) {
    background: var(--db-bg-hover, rgb(120 120 128 / 8%));
    color: var(--db-ink, #1c1c1e);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}
</style>