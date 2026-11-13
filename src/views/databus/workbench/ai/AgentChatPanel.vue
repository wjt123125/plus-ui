<template>
  <div class="agent-chat">
    <div ref="bodyRef" class="agent-chat__body">
      <!-- 空态：与 AiAssistantRail 原欢迎块同款 -->
      <div v-if="!messages.length" class="agent-chat__welcome">
        <SvgIcon class="agent-chat__welcome-icon" icon-class="lucide:sparkle-filled" />
        <p class="agent-chat__welcome-title">DB Copilot</p>
        <p class="agent-chat__welcome-desc">
          用自然语言定位链路与组件、解释编排意图、排查脚本编译与执行问题。
        </p>
      </div>

      <div v-for="m in messages" :key="m.id" class="agent-chat__row" :class="`is-${m.role}`">
        <!-- 系统行：错误提示、画布更新被丢弃等结论性提示 -->
        <div v-if="m.role === 'system'" class="agent-chat__system" :class="{ 'is-error': isErrorNotice(m) }">
          <span class="agent-chat__system-text">{{ noticeText(m) }}</span>
        </div>
        <!-- 用户消息：原样纯文本，不解析 Markdown -->
        <div v-else-if="m.role === 'user'" class="agent-chat__bubble">
          <div v-if="m.refs?.length" class="agent-chat__refs is-bubble">
            <span
              v-for="r in m.refs"
              :key="`${r.type}-${r.id ?? r.code}`"
              class="agent-chat__ref"
              :style="{ '--ref-color': refMeta(r.type).color }"
              :title="`打开${refMeta(r.type).label}：${r.name}`"
              @click="openRef(r)"
            >
              <SvgIcon class="agent-chat__ref-icon" :icon-class="refMeta(r.type).icon" />
              <span class="agent-chat__ref-name">{{ r.name }}</span>
            </span>
          </div>
          <p v-if="textOf(m)" class="agent-chat__text">{{ textOf(m) }}</p>
        </div>
        <!-- AI 消息：上方是身份行，正文按段渲染。text 段走 Markdown，thinking 折叠，notice 独立成块 -->
        <div v-else class="agent-chat__col">
          <div class="agent-chat__who">
            <SvgIcon class="agent-chat__who-icon" icon-class="lucide:sparkle-filled" />
            <span>DB Copilot</span>
          </div>
          <div class="agent-chat__bubble" :class="{ 'is-error': m.status === 'error' }">
            <template v-for="(seg, i) in m.segments" :key="i">
              <!-- 正文开始后思考就收起：展开的是过程，不是结果 -->
              <ThinkingBlock
                v-if="seg.kind === 'thinking'"
                :text="seg.text"
                :streaming="m.status === 'streaming' && !hasText(m)"
              />
              <p v-else-if="seg.kind === 'notice'" class="agent-chat__notice">{{ seg.text }}</p>
              <MarkdownBlock v-else :text="seg.text" />
            </template>
            <!-- 还没吐字时用一个空行光标表示「在跑」，有正文后正文本身就是进度 -->
            <p v-if="m.status === 'streaming' && !hasText(m)" class="agent-chat__text">
              <span class="agent-chat__cursor" />
            </p>
          </div>
        </div>
      </div>

      <!-- 建议：贴在最后一条回答末尾，点一下直接发送（形态对齐 Trae，内容仍是本地写死） -->
      <div v-if="showFollowUps" class="agent-chat__followups">
        <button
          v-for="s in suggestions"
          :key="s"
          type="button"
          class="agent-chat__pill"
          @click="pickSuggestion(s)"
        >
          <span class="agent-chat__pill-text">{{ s }}</span>
          <span class="agent-chat__pill-arrow">↗</span>
        </button>
      </div>
    </div>

    <!-- 输入区：整块灰底无边框，底部一行快捷键提示 + 单颗圆形动作按钮 -->
    <div class="agent-chat__input">
      <div class="agent-chat__composer">
        <!-- 引用卡：资源树/画布右键加入的链路或组件，随这条问题一起发出去 -->
        <div v-if="refs.length" class="agent-chat__refs">
          <span
            v-for="r in refs"
            :key="`${r.type}-${r.id ?? r.code}`"
            class="agent-chat__ref"
            :style="{ '--ref-color': refMeta(r.type).color }"
            :title="`打开${refMeta(r.type).label}：${r.name}`"
            @click="openRef(r)"
          >
            <SvgIcon class="agent-chat__ref-icon" :icon-class="refMeta(r.type).icon" />
            <span class="agent-chat__ref-name">{{ r.name }}</span>
            <button
              type="button"
              class="agent-chat__ref-close"
              title="移除引用"
              @click.stop="removeRef(r)"
            >
              <SvgIcon icon-class="lucide:x" />
            </button>
          </span>
        </div>
        <el-input
          ref="inputRef"
          v-model="draft"
          type="textarea"
          :rows="2"
          resize="none"
          :placeholder="inputPlaceholder"
          @keydown="onKeydown"
        />
        <div class="agent-chat__toolbar">
          <!-- 左侧工具区：回到这次对话前（按服务端快照整体回滚）+ 后续附件入口 -->
          <div class="agent-chat__tools">
            <button
              type="button"
              class="agent-chat__tool"
              title="回到这次对话前"
              :disabled="running || rollbackRunning"
              @click="backToBeforeConversation"
            >
              <SvgIcon icon-class="lucide:history" />
              <span>回到这次对话前</span>
            </button>
          </div>
          <button v-if="running" type="button" class="agent-chat__send is-stop" @click="stop">
            <SvgIcon icon-class="lucide:square" class="agent-chat__stop-icon" />
          </button>
          <button
            v-else
            type="button"
            class="agent-chat__send"
            :disabled="!draft.trim() && !refs.length"
            @click="submit"
          >
            <SvgIcon icon-class="lucide:send-filled" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * AI 助手对话面板（工作台侧栏薄壳，v1 切片 1：说话）。
 *
 * 只做消息流 + 输入框，不吃会话历史；状态在 useAgentChat（模块级单例，收起侧栏不丢）。
 * SnailAI 不可达或流断开时，错误以系统行呈现。
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { listAgentHistory, rollbackRun } from '@/api/databus/agent';
import { useLucideSubset } from '../composables/useLucideSubset';
import MarkdownBlock from './MarkdownBlock.vue';
import ThinkingBlock from './ThinkingBlock.vue';
import { useAgentChat, type AgentChatMessage, type AgentSegment } from './useAgentChat';
import { useAgentRefs, type AgentRefItem } from './useAgentRefs';
import { refMeta } from './agentRefTypes';

defineOptions({ name: 'AgentChatPanel' });

useLucideSubset();

const emit = defineEmits<{
  /** 回滚完成：宿主据此重建画布、关掉已删除链路的 tab */
  'agent-rolled-back': [chains: { chainId: number | string; deleted: boolean }[]];
  /** 点引用卡：跳转由宿主承接，面板不感知工作台内部路由 */
  'ref-open': [ref: AgentRefItem];
}>();

const inputPlaceholder = '@ 添加上下文，/ 使用命令和技能';

/** 聚焦浮层的示例问题：v1 本地写死，后续换后端下发只替数据源 */
const suggestions = [
  '这条链路为什么跑不通？',
  '解释一下当前组件的编排意图',
  '脚本编译失败，帮我定位问题',
  '这个连接器的参数该怎么填？'
];

const { conversationId, messages, running, send, stop, newSession, appendSystem, restore } =
  useAgentChat();

/** 引用卡：只暂存在本面板，发出去即清空 */
const { refs, removeRef, clearRefs } = useAgentRefs();

/** 点引用卡：交给宿主决定开画布还是开详情 */
function openRef(item: AgentRefItem) {
  emit('ref-open', item);
}

/** 把某一类段落拼成纯文本（用户气泡、系统行、空态判断都只要这一种） */
function segmentText(message: AgentChatMessage, kind: AgentSegment['kind']): string {
  return message.segments
    .filter((s) => s.kind === kind)
    .map((s) => s.text)
    .join('');
}

const textOf = (message: AgentChatMessage) => segmentText(message, 'text');
const noticeText = (message: AgentChatMessage) => segmentText(message, 'notice');
const hasText = (message: AgentChatMessage) => textOf(message).length > 0;
/** 系统行里的错误提示（连接断开等）单独用警示色，与普通提示区分 */
const isErrorNotice = (message: AgentChatMessage) =>
  message.segments.some((s) => s.kind === 'notice' && s.eventCode === 'error');

const draft = ref('');
const bodyRef = ref<HTMLElement>();
const inputRef = ref<{ focus: () => void }>();

/** 把引用段拼到问题末尾再发；只有引用没打字也允许发 */
function sendWithRefs(text: string) {
  const picked = [...refs.value];
  draft.value = '';
  clearRefs();
  void send(text.trim(), picked);
}

/** 只在「最后一条是已结束的 AI 回答」时给建议：跑的过程中和用户刚说完都不打扰 */
const showFollowUps = computed(() => {
  if (running.value) {
    return false;
  }
  const last = messages.value[messages.value.length - 1];
  return last?.role === 'assistant' && last.status !== 'streaming';
});

/** 点建议直接发送，和 Trae 一致；流式中忽略 */
function pickSuggestion(text: string) {
  if (running.value || !text.trim()) {
    return;
  }
  sendWithRefs(text);
  // 点完建议把光标交回输入框，接着打字不用再点一次
  void nextTick(() => inputRef.value?.focus());
}

function submit() {
  if (running.value || (!draft.value.trim() && !refs.value.length)) {
    return;
  }
  sendWithRefs(draft.value);
}

/** Enter 发送、Shift+Enter 换行；输入法组词中的 Enter 不抢 */
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) {
    return;
  }
  event.preventDefault();
  submit();
}

/** 消息有增改（流式追加）就贴底，保持最新一条可见 */
watch(
  messages,
  () => {
    void nextTick(() => {
      const el = bodyRef.value;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  },
  { deep: true }
);

// 画布/草稿推送不在这里回显：它们由工作台按四分支处理（弹窗确认、重画、开 tab），
// 而 payload.message 是推送中心用的短文案（「画布已更新：xxx」），
// 既与 AI 正文重复、又会在用户选择「丢弃」时显示成假的「已更新」，且只能排在回复之后。
// 只有真正需要让用户知道的结果（如丢弃画布更新、错误）才由操作方 appendSystem。

// 刷新后只问一句后端有没有还在跑的 run：旧 SSE 无法续接，这里只提示、不重放、也不停别的标签页
onMounted(() => {
  void restore();
});

/* ---------------- 回到这次对话前（按 run 整体回滚） ---------------- */

const rollbackRunning = ref(false);

/**
 * 回滚只针对最近一次已结束的 run：撤销这次对话的改动，不跨 run。
 * 服务端对本 run 动过的每条链取最早一份快照，新建的删掉、改过的写回。
 */
async function backToBeforeConversation() {
  if (!conversationId.value) {
    appendSystem('还没有对话记录，暂无可回滚的 AI 操作。', 'agent:rollback');
    return;
  }
  rollbackRunning.value = true;
  try {
    const { data: runs } = await listAgentHistory(conversationId.value);
    const last = (runs ?? []).toReversed().find((run) => run.status !== 'RUNNING');
    if (!last) {
      appendSystem('这次对话还没有可回滚的操作。', 'agent:rollback');
      return;
    }
    try {
      await ElMessageBox.confirm(
        '将撤销这次对话对链路的全部改动：新建的链路会删除，改过的链路会写回对话前的结构。是否继续？',
        '回到这次对话前',
        { confirmButtonText: '回滚', cancelButtonText: '取消', type: 'warning' }
      );
    } catch {
      return;
    }
    const { data } = await rollbackRun(last.runId);
    const chains = data ?? [];
    if (!chains.length) {
      appendSystem('这次对话没有改动任何链路。', 'agent:rollback');
      return;
    }
    ElMessage.success('已回到这次对话前');
    emit('agent-rolled-back', chains);
  } catch {
    appendSystem('回滚失败，链路未被改动。', 'agent:rollback');
  } finally {
    rollbackRunning.value = false;
  }
}

defineExpose({ newSession });
</script>

<style lang="scss" scoped>
.agent-chat {
  /* 引用类型色：新增类型在 agentRefTypes.ts 注册，这里补一个同名变量即可 */
  --db-ref-chain: #5457d6;
  --db-ref-component: #0f8f6f;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.agent-chat__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;

  /* 默认滚动条在这类窄侧栏里最显廉价，收细到 6px */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 3px;
    background: rgba(60, 60, 67, 0.16);
  }

  &::-webkit-scrollbar-thumb:hover {
    background: rgba(60, 60, 67, 0.3);
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }
}

/* 空态：沿用 AiAssistantRail 原欢迎块尺寸 */
.agent-chat__welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  padding: 48px 8px 0;
}

.agent-chat__welcome-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  padding: 14px;
  border-radius: var(--db-r-card, 14px);
  color: var(--db-blue, #007aff);
  background: rgba(0, 122, 255, 0.1);
}

.agent-chat__welcome-title {
  margin: 6px 0 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--db-ink, #1c1c1e);
}

.agent-chat__welcome-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--db-ink-muted, #6e6e73);
}

.agent-chat__row {
  display: flex;
  margin-bottom: 12px;

  &.is-user {
    justify-content: flex-end;
  }

  &.is-assistant {
    justify-content: flex-start;
  }
}

/* AI 侧不加底色，靠身份行和位置区分；用户气泡与输入框同一种灰，视觉上是「我说的话」 */
.agent-chat__col {
  min-width: 0;
  max-width: 100%;
}

/* 身份行：小胶囊托住图标和名字，比纯文字更有「发言人」感 */
.agent-chat__who {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 6px;
  padding: 2px 8px 2px 6px;
  border-radius: 6px;
  background: var(--db-bg-hover, rgba(120, 120, 128, 0.08));
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.6;
  color: var(--db-ink-muted, #6e6e73);
}

.agent-chat__who-icon {
  flex: none;
  font-size: 12px;
  color: var(--db-blue, #007aff);
}

.agent-chat__bubble {
  max-width: 86%;
  font-size: 13px;
  line-height: 1.75;
  word-break: break-word;
  color: var(--db-ink, #1c1c1e);

  /* AI 正文占满可用宽度：表格、代码块在窄侧栏里才有横向空间 */
  .agent-chat__col & {
    max-width: 100%;
  }

  .is-user & {
    padding: 9px 12px;
    border-radius: 12px;
    background: var(--db-bg-hover, rgba(120, 120, 128, 0.08));
  }

  &.is-error {
    padding: 9px 12px;
    border-radius: 12px;
    background: var(--el-color-danger-light-9, #fef0f0);
    color: var(--el-color-danger, #f56c6c);
  }
}

/* 段内提示（工具事件、能力限制）：比正文更轻，靠色阶和字号区分 */
.agent-chat__notice {
  margin: 0 0 8px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--db-ink-muted, #6e6e73);
}

.agent-chat__text {
  margin: 0;
  white-space: pre-wrap;
}

/* 流式光标：在当前气泡末尾闪一条竖线 */
.agent-chat__cursor {
  display: inline-block;
  width: 2px;
  height: 13px;
  margin-left: 2px;
  vertical-align: -2px;
  background: var(--el-color-primary);
  animation: agent-cursor-blink 1s steps(1) infinite;
}

@keyframes agent-cursor-blink {
  50% {
    opacity: 0;
  }
}

/* 系统行：整行浅底提示条，左对齐读得清；错误另用警示色 */
.agent-chat__system {
  flex: 1;
  min-width: 0;
  margin: 10px 0;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--db-ink-muted, #6e6e73);

  &.is-error {
    color: var(--el-color-danger, #f56c6c);
  }
}

.agent-chat__system-text {
  display: block;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--db-bg-hover, rgba(120, 120, 128, 0.08));
  word-break: break-word;
}

.agent-chat__system.is-error .agent-chat__system-text {
  background: var(--el-color-danger-light-9, #fef0f0);
}

.agent-chat__input {
  position: relative;
  flex-shrink: 0;
  padding: 8px 12px 12px;
}

/* 建议 pill：贴在最后一条回答下方，点一下直接发下一句 */
.agent-chat__followups {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 2px 0 6px;
}

.agent-chat__pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 5px 10px;
  border: 0;
  border-radius: 999px;
  background: var(--db-bg-hover, rgba(120, 120, 128, 0.08));
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
  color: var(--db-ink-secondary, #3a3a3c);
  cursor: pointer;
  transition:
    background-color 0.15s,
    color 0.15s;

  &:hover {
    background: rgba(120, 120, 128, 0.16);
    color: var(--db-ink, #1c1c1e);
  }
}

.agent-chat__pill-text {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.agent-chat__pill-arrow {
  flex: none;
  font-size: 11px;
  opacity: 0.45;
}

/* 输入块：灰底 + 半根发丝线界定边界，聚焦转白并把线加深（不加蓝环，保持安静） */
.agent-chat__composer {
  display: flex;
  flex-direction: column;
  padding: 12px 12px 8px;
  border-radius: var(--db-r-card, 14px);
  background: var(--db-bg-hover, rgba(120, 120, 128, 0.08));
  box-shadow: inset 0 0 0 0.5px var(--db-rule, rgba(60, 60, 67, 0.12));
  transition:
    background-color 0.15s,
    box-shadow 0.15s;

  &:focus-within {
    background: var(--db-bg-solid, #fff);
    box-shadow:
      inset 0 0 0 0.5px var(--db-rule-strong, rgba(60, 60, 67, 0.24)),
      var(--db-shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.06));
  }
}

/* 引用卡条：单行横排，多了横向滚，别把输入区顶高 */
.agent-chat__refs {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

/* 已发出的气泡：引用卡换行铺开，去掉描边、底色更淡，让正文占主导 */
.agent-chat__refs.is-bubble {
  flex-wrap: wrap;
  overflow: visible;
  margin: 0;
}

/* 间距只加在「有正文跟在后面」时，纯引用消息里的卡片才在气泡中垂直居中 */
.agent-chat__refs.is-bubble + .agent-chat__text {
  margin-top: 6px;
}

.agent-chat__refs.is-bubble .agent-chat__ref {
  padding: 0 8px;
  background: color-mix(in srgb, var(--ref-color, var(--db-ink-muted, #6e6e73)) 6%, transparent);
  box-shadow: none;
}

.agent-chat__ref {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 5px;
  max-width: 190px;
  height: 24px;
  padding: 0 2px 0 8px;
  border-radius: 6px;
  /* 底色与描边都从类型色派生：只有图标与极淡 tint 着色，正文保持中性 */
  background: color-mix(in srgb, var(--ref-color, var(--db-ink-muted, #6e6e73)) 8%, transparent);
  box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--ref-color, var(--db-ink-muted, #6e6e73)) 24%, transparent);
  font-size: 12px;
  line-height: 1;
  color: var(--db-ink-secondary, #3a3a3c);
  cursor: pointer;
  transition:
    background 0.15s,
    box-shadow 0.15s;

  &:hover {
    background: color-mix(in srgb, var(--ref-color, var(--db-ink-muted, #6e6e73)) 14%, transparent);
    box-shadow: inset 0 0 0 0.5px
      color-mix(in srgb, var(--ref-color, var(--db-ink-muted, #6e6e73)) 34%, transparent);
  }
}

/* 气泡里的卡片更淡，hover 同样只往上加一档，不引入描边抢戏 */
.agent-chat__refs.is-bubble .agent-chat__ref:hover {
  background: color-mix(in srgb, var(--ref-color, var(--db-ink-muted, #6e6e73)) 12%, transparent);
  box-shadow: inset 0 0 0 0.5px
    color-mix(in srgb, var(--ref-color, var(--db-ink-muted, #6e6e73)) 30%, transparent);
}

.agent-chat__ref-icon {
  flex: none;
  color: var(--ref-color, var(--db-ink-muted, #6e6e73));
}

.agent-chat__ref-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-chat__ref-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  font-size: 11px;
  color: var(--db-ink-muted, #6e6e73);
  cursor: pointer;
  border: 0;
  border-radius: 4px;
  background: transparent;
}

.agent-chat__ref-close:hover {
  color: var(--db-ink-primary, #1d1d1f);
  background: var(--db-bg-hover, rgba(120, 120, 128, 0.12));
}

.agent-chat__composer :deep(.el-textarea__inner) {
  padding: 0;
  border: none;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
  font-size: 13px;
  line-height: 1.75;
  color: var(--db-ink-secondary, #3a3a3c);

  &::placeholder {
    color: var(--db-ink-muted, #6e6e73);
  }

  &:focus {
    box-shadow: none;
  }
}

.agent-chat__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
}

/* 左侧工具区：留白占位，后续放上传附件等图标按钮 */
.agent-chat__tools {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 2px;
}

/* 「回到 AI 动手前」：低调文字钮，hover 才显底色 */
.agent-chat__tool {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;

  &:hover:not(:disabled) {
    background: var(--db-hover, rgb(0 0 0 / 5%));
    color: var(--db-ink, #1d1d1f);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .svg-icon {
    width: 14px;
    height: 14px;
  }
}

/* 发送/停止：同尺寸圆角方形按钮，图标面性、主题色填充 */
.agent-chat__send {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: var(--db-r-control, 10px);
  background: rgba(0, 122, 255, 0.12);
  color: var(--db-blue, #007aff);
  font-size: 17px;
  cursor: pointer;
  transition:
    background-color 0.15s,
    transform 0.1s;

  &:hover:not(:disabled) {
    background: rgba(0, 122, 255, 0.22);
  }

  &:active:not(:disabled) {
    transform: scale(0.94);
  }

  &:disabled {
    background: var(--db-bg-hover, rgba(120, 120, 128, 0.08));
    color: var(--db-ink-muted, #6e6e73);
    cursor: not-allowed;
  }

  &.is-stop {
    background: transparent;

    &:hover {
      background: rgba(0, 122, 255, 0.12);
    }
  }
}

/* 停止图标：方形用 fill 变实心，与发送的纸飞机同一套面性语言 */
.agent-chat__stop-icon {
  font-size: 14px;
  fill: currentColor;
}
</style>