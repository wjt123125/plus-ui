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

      <div v-for="(m, i) in messages" :key="m.id" class="agent-chat__row" :class="`is-${m.role}`">
        <!-- 系统行：错误提示、画布更新被丢弃等结论性提示 -->
        <div v-if="m.role === 'system'" class="agent-chat__system" :class="{ 'is-error': isErrorNotice(m) }">
          <span class="agent-chat__system-text">{{ noticeText(m) }}</span>
        </div>
        <!-- 用户消息：原样纯文本，不解析 Markdown -->
        <div v-else-if="m.role === 'user'" class="agent-chat__col agent-chat__col--user">
          <div
            class="agent-chat__bubble"
            data-context-type="chat"
            :data-context-anchor="`msg-${m.id}`"
          >
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
            <!-- 上下文卡与正文同处一行内流：像 span 一样挨着文字，不单独占一行 -->
            <p v-if="textOf(m) || m.contexts?.length" class="agent-chat__text">
              <AgentContextCard
                v-for="(c, ci) in m.contexts || []"
                :key="c.id"
                :item="c"
                :index="ci + 1"
                class="agent-chat__ctx-inline"
                @open="openContext(c, $event)"
              />
              <span v-if="textOf(m)">{{ textOf(m) }}</span>
            </p>
          </div>
          <MessageActionBar
            :message="m"
            :question="m"
            :reply="turnReply(i)"
            :last-turn="lastTurnIndex === i"
            :running="running"
            :deps="messageActionDeps"
          />
        </div>
        <!-- AI 消息：上方是身份行，正文按段渲染。text 段走 Markdown，thinking 折叠，notice 独立成块 -->
        <div v-else class="agent-chat__col">
          <div class="agent-chat__who" :class="{ 'is-streaming': m.status === 'streaming' }">
            <span class="agent-chat__who-spark">
              <SvgIcon class="agent-chat__who-icon" icon-class="lucide:sparkle-filled" />
            </span>
            <span>DB Copilot</span>
            <span v-if="m.status === 'streaming'" class="agent-chat__who-live" aria-hidden="true" />
          </div>
          <div
            class="agent-chat__bubble"
            :class="{ 'is-error': m.status === 'error' }"
            data-context-type="chat"
            :data-context-anchor="`msg-${m.id}`"
          >
            <template v-for="(seg, i) in m.segments" :key="i">
              <!-- 正文开始后思考就收起：展开的是过程，不是结果 -->
              <ThinkingBlock
                v-if="seg.kind === 'thinking'"
                :text="seg.text"
                :streaming="m.status === 'streaming' && !hasText(m)"
                @toggle="pauseFollowing"
              />
              <p v-else-if="seg.kind === 'notice'" class="agent-chat__notice">{{ seg.text }}</p>
              <component
                :is="cardViewOf(seg.card.kind)"
                v-else-if="seg.kind === 'card' && seg.card.cardId !== floatingCard?.card.cardId"
                :card="seg.card"
                :status="seg.status"
                :picked="seg.picked"
                :card-text="seg.cardText"
                :allow-full-access="allowFullAccess"
                :approval-mode="approvalMode"
                :draft-codes="draftCodes"
                @pick="(option, scope) => onCardPick(seg.card.cardId, option, scope)"
                @submit="(actions, text, label) => onCardSubmit(seg.card.cardId, actions, text, label)"
                @cancel="onCardCancel(seg.card.cardId)"
                @open="onCardOpen(seg.card)"
                @preview="onCardPreview(seg.card)"
              />
              <MarkdownBlock v-else-if="seg.kind === 'text'" :text="seg.text" />
            </template>
            <!-- 还没吐字时用一个空行光标表示「在跑」，有正文后正文本身就是进度 -->
            <p v-if="m.status === 'streaming' && !hasText(m)" class="agent-chat__text">
              <span class="agent-chat__cursor" />
            </p>
          </div>
          <!-- 流式中先不给工具栏：这一条还在写，重试/复制都没有确定的对象 -->
          <MessageActionBar
            v-if="m.status !== 'streaming'"
            :message="m"
            :question="turnQuestion(i)"
            :reply="m"
            :last-turn="lastTurnIndex === i"
            :running="running"
            :deps="messageActionDeps"
          />
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

    <!-- 悬浮选择卡：待选的选择卡整块顶替输入区，选完/取消后才把输入框还回来 -->
    <div v-if="floatingCard" class="agent-chat__ask">
      <component
        :is="cardViewOf(floatingCard.card.kind)"
        :card="floatingCard.card"
        :status="floatingCard.status"
        :picked="floatingCard.picked"
        :card-text="floatingCard.cardText"
        :allow-full-access="allowFullAccess"
        :approval-mode="approvalMode"
        :draft-codes="draftCodes"
        auto-focus
        @pick="onFloatingPick"
        @submit="onFloatingSubmit"
        @cancel="onFloatingCancel"
      />
    </div>

    <!-- 输入区：整块灰底无边框，底部一行工具（工作区 / 审批模式 / 回滚）+ 发送按钮
         有待选卡片时整块收起，不给用户绕开卡片继续说话的机会 -->
    <div v-else class="agent-chat__input">
      <!--
        「回到最新」：只有用户自己上滑（或主动折叠内容）暂停跟随时才出现。
        浮在输入区上方，出现/消失不改变消息区高度，避免它自己又触发一次滚动。
      -->
      <Transition name="agent-chat-latest">
        <button
          v-if="!following"
          type="button"
          class="agent-chat__latest"
          :class="{ 'is-fresh': hasNew, 'is-flowing': running }"
          @click="toLatest(!running)"
        >
          <span class="agent-chat__latest-arrow" aria-hidden="true">
            <span class="agent-chat__latest-queue">
              <SvgIcon icon-class="lucide:arrow-down" />
              <SvgIcon icon-class="lucide:arrow-down" />
              <SvgIcon icon-class="lucide:arrow-down" />
            </span>
          </span>
          <span class="agent-chat__latest-text">{{ hasNew ? '有新内容，回到最新' : '回到最新' }}</span>
        </button>
      </Transition>
      <div class="agent-chat__composer">
        <!-- 卡片与文字同处一条行内流：卡片能挨着文字落行，不再各占一行 -->
        <AgentComposer
          ref="inputRef"
          v-model:text="draft"
          :chips="composerChips"
          :placeholder="inputPlaceholder"
          @send="submit"
          @chip-open="onChipOpen"
          @chip-remove="onChipRemove"
        />
        <div class="agent-chat__toolbar">
          <!-- 左侧工具区：工作区、操作审批模式、回到这次对话前 -->
          <div class="agent-chat__tools">
            <el-dropdown trigger="click" placement="top-start" popper-class="db-menu-popper">
              <button type="button" class="agent-chat__tool" title="选择会话工作区">
                <SvgIcon icon-class="lucide:folder" />
                <span>默认工作区</span>
                <SvgIcon icon-class="lucide:chevron-down" class="agent-chat__tool-caret" />
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item class="db-menu-item is-primary">
                    <SvgIcon icon-class="lucide:circle-check" />
                    <span>默认工作区</span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-dropdown
              trigger="click"
              placement="top-start"
              popper-class="db-menu-popper"
              @command="changeApprovalMode"
            >
              <button type="button" class="agent-chat__tool" title="操作审批模式（只影响链路试跑）">
                <SvgIcon icon-class="lucide:circle-check" />
                <span>{{ approvalModeLabel }}</span>
                <SvgIcon icon-class="lucide:chevron-down" class="agent-chat__tool-caret" />
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="opt in approvalModeOptions"
                    :key="opt.value"
                    :command="opt.value"
                    :disabled="opt.disabled"
                    :title="opt.hint"
                  >
                    <SvgIcon
                      v-if="approvalMode === opt.value"
                      icon-class="lucide:circle-check"
                    />
                    <span v-else class="agent-chat__mode-placeholder" />
                    <span>{{ opt.label }}</span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
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
            :disabled="!draft.trim() && !refs.length && !contexts.length"
            @click="submit"
          >
            <SvgIcon icon-class="lucide:send-filled" />
          </button>
        </div>
      </div>
    </div>

    <!-- 卡片详情：引文 / 改评论 / 跳回原处（定位与闪烁由全局选区浮层承接） -->
    <ContextDetailDialog
      v-model:visible="detailVisible"
      :item="detailItem"
      :anchor="detailAnchor"
      @reveal="revealContext"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * AI 助手对话面板（工作台侧栏薄壳）：消息流 + 输入区 + 卡片点选回执。
 *
 * 会话状态在 useAgentChat、附件暂存在 useAgentContext（按 conversationId 分桶，
 * 收起侧栏不丢，切会话各看各的）。
 * SnailAI 不可达或流断开时，错误以系统行呈现。
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useStickToBottom } from '@/hooks/scroll/useStickToBottom';
import { getAgentApprovalMode, listAgentHistory, rollbackRun, updateAgentApprovalMode } from '@/api/databus/agent';
import type { AgentApprovalMode, AgentCard, AgentCardOption } from '@/api/databus/agent/types';
import { useLucideSubset } from '../composables/useLucideSubset';
import { AGENT_APPROVAL_MODE, AGENT_RUN_STATUS } from '@/constants/databus';
import { DATABUS_CARD_ACTION_CANCEL, DATABUS_CARD_KIND_CHOICE, DATABUS_CARD_KIND_REF } from '@/constants/databus-common';
import { cardViewOf } from './agentCardRegistry';
import AgentContextCard from './AgentContextCard.vue';
import ContextDetailDialog from './ContextDetailDialog.vue';
import MarkdownBlock from './MarkdownBlock.vue';
import MessageActionBar from './MessageActionBar.vue';
import ThinkingBlock from './ThinkingBlock.vue';
import type { MessageActionDeps } from './messageActions';
import { useAgentChat, type AgentChatMessage } from './useAgentChat';
import { useAgentContext } from './useAgentContext';
import { useAgentRefs, type AgentRefItem } from './useAgentRefs';
import AgentComposer, { type ComposerChip } from './AgentComposer.vue';
import { refMeta } from './agentRefTypes';
import type { AgentContextItem, AgentContextSource } from './contextTypes';

defineOptions({ name: 'AgentChatPanel' });

useLucideSubset();

/** 宿主传入的「当前草稿组件编码」：卡片播放钮据此判断，历史卡片缺 draft 字段也能露出 */
defineProps<{
  draftCodes?: string[];
}>();

const emit = defineEmits<{
  /** 回滚完成：宿主据此重建画布、关掉已删除链路的 tab */
  'agent-rolled-back': [chains: { chainId: number | string; deleted: boolean }[]];
  /** 点引用卡：跳转由宿主承接，面板不感知工作台内部路由 */
  'ref-open': [ref: AgentRefItem];
  /** 草稿卡「▶ 试运行」：开单节点预览链路（宿主判草稿态） */
  'ref-preview': [ref: AgentRefItem];
}>();

/** 聚焦浮层的示例问题：v1 本地写死，后续换后端下发只替数据源 */
const suggestions = [
  '这条链路为什么跑不通？',
  '解释一下当前组件的编排意图',
  '脚本编译失败，帮我定位问题',
  '这个连接器的参数该怎么填？'
];

const {
  conversationId,
  messages,
  running,
  draft,
  send,
  answerCard,
  stop,
  newSession,
  appendSystem,
  restore,
  retryReply,
  removeTurn,
  revertTurn
} = useAgentChat();

/** 引用卡：只暂存在本面板，发出去即清空；回退时把该轮提问带的卡放回暂存区 */
const { refs, addRef, removeRef, clearRefs } = useAgentRefs();

/** 上下文附件：划字摘录与画布资源共用一份暂存，发送时整批带出去 */
const { contexts, addContext, removeContext, clearContexts, clearBadges } = useAgentContext();

/** 输入区已有卡片/引用时不再提示「@ 添加上下文」——它们本身就是已输入的内容 */
const inputPlaceholder = computed(() =>
  contexts.value.length || refs.value.length ? '' : '@ 添加上下文，/ 使用命令和技能'
);

/**
 * 悬浮选择卡：待选的选择卡从消息流抽出来，整块顶替输入区。
 * <p>
 * 只认 kind=choice：它是「等用户拍板」的唯一语义，处理成浮层才能打断；
 * 历史里 presentation=inline 的旧卡片同样按 kind 判定，不受落库版本影响。
 */
const floatingCard = computed(() => {
  for (let mi = messages.value.length - 1; mi >= 0; mi -= 1) {
    const segments = messages.value[mi].segments;
    for (let si = segments.length - 1; si >= 0; si -= 1) {
      const seg = segments[si];
      if (seg.kind === 'card' && seg.status === 'pending' && seg.card.kind === DATABUS_CARD_KIND_CHOICE) {
        return seg;
      }
    }
  }
  return null;
});

/** 引用卡与上下文卡统一成行内 token；顺序即输入框里的显示顺序 */
const composerChips = computed<ComposerChip[]>(() => [
  ...refs.value.map((r) => ({
    key: `ref:${r.type}:${r.id ?? r.code ?? r.name}`,
    kind: 'ref' as const,
    label: `@${r.name}`,
    title: `打开${refMeta(r.type).label}：${r.name}`
  })),
  ...contexts.value.map((c, ci) => ({
    key: `ctx:${c.id}`,
    kind: 'ctx' as const,
    // 标题和评论分开传：卡片整体仍是一个长度上限，但会优先保证评论露出开头
    label: `${ci + 1}. ${c.title}`,
    note: c.note || undefined,
    title: c.note ? `${c.title}\n评论：${c.note}` : c.title
  }))
]);

/** 卡片删除：key 反查回源数组，refs 与 contexts 各清各的 */
function onChipRemove(key: string) {
  if (key.startsWith('ref:')) {
    const ref = refs.value.find((r) => `ref:${r.type}:${r.id ?? r.code ?? r.name}` === key);
    if (ref) {
      removeRef(ref);
    }
    return;
  }
  const context = contexts.value.find((c) => `ctx:${c.id}` === key);
  if (context) {
    removeContext(context);
  }
}

/** 点卡片本体：引用卡交给宿主跳转，上下文卡就地开详情浮层（锚点用卡片自身） */
function onChipOpen({ key, anchor }: { key: string; anchor: HTMLElement }) {
  if (key.startsWith('ref:')) {
    const ref = refs.value.find((r) => `ref:${r.type}:${r.id ?? r.code ?? r.name}` === key);
    if (ref) {
      openRef(ref);
    }
    return;
  }
  const context = contexts.value.find((c) => `ctx:${c.id}` === key);
  if (context) {
    openContext(context, anchor);
  }
}

const detailVisible = ref(false);
const detailItem = ref<AgentContextItem | null>(null);
/** 浮层贴着被点的那张卡片冒出来，所以要把触发元素一起记下来 */
const detailAnchor = ref<HTMLElement | null>(null);

/** 点卡片看评论与引文；浮层就近弹出，不做居中弹窗 */
function openContext(item: AgentContextItem, anchor?: HTMLElement) {
  detailItem.value = item;
  detailAnchor.value = anchor ?? null;
  detailVisible.value = true;
}

/** 「去看来处」交给全局选区浮层：它知道怎么按 anchor 定位、滚动并只闪选中那一段 */
function revealContext(source: AgentContextSource, text: string) {
  window.dispatchEvent(new CustomEvent('databus:context:reveal', { detail: { ...source, text } }));
}

/** 点引用卡：交给宿主决定开画布还是开详情 */
function openRef(item: AgentRefItem) {
  emit('ref-open', item);
}

/** ref 卡只做跳转，不回执；缺资源信息就当普通链接忽略 */
function onCardOpen(card: AgentCard) {
  const resource = card.resource;
  if (!resource) {
    return;
  }
  emit('ref-open', {
    type: resource.type,
    id: resource.id,
    code: resource.code,
    name: resource.name || card.title
  });
}

/** 草稿卡「▶」：与「详情」同一资源载荷，宿主按草稿态开预览链路 */
function onCardPreview(card: AgentCard) {
  const resource = card.resource;
  if (!resource) {
    return;
  }
  emit('ref-preview', {
    type: resource.type,
    id: resource.id,
    code: resource.code,
    name: resource.name || card.title
  });
}

/** 把某一类段落拼成纯文本（用户气泡、系统行、空态判断都只要这一种；卡片不算文字） */
function segmentText(message: AgentChatMessage, kind: 'text' | 'thinking' | 'notice'): string {
  return message.segments
    .filter((s) => s.kind === kind)
    .map((s) => (s.kind === 'card' ? '' : s.text))
    .join('');
}

/**
 * 每条消息的正文纯文本。
 * 模板里每条消息每次渲染都要读它，逐次 filter+join 会让流式期间的渲染成本翻倍，
 * 这里一次算完，模板只做查表。
 */
const textMap = computed(() => {
  const map = new Map<string, string>();
  for (const message of messages.value) {
    map.set(message.id, segmentText(message, 'text'));
  }
  return map;
});

const textOf = (message: AgentChatMessage) => textMap.value.get(message.id) ?? '';
const noticeText = (message: AgentChatMessage) => segmentText(message, 'notice');
const hasText = (message: AgentChatMessage) => textOf(message).length > 0;
/** 系统行里的错误提示（连接断开等）单独用警示色，与普通提示区分 */
const isErrorNotice = (message: AgentChatMessage) =>
  message.segments.some((s) => s.kind === 'notice' && s.eventCode === 'error');

/* ---------------- 消息工具栏：按轮定位 ---------------- */

/** 同一轮的回复：提问后紧跟的 AI 消息 */
function turnReply(index: number): AgentChatMessage | undefined {
  const next = messages.value[index + 1];
  return next?.role === 'assistant' ? next : undefined;
}

/** 同一轮的提问：AI 消息前紧邻的用户消息 */
function turnQuestion(index: number): AgentChatMessage | undefined {
  const prev = messages.value[index - 1];
  return prev?.role === 'user' ? prev : undefined;
}

/** 按消息 id 找它所属这一轮的提问：用户消息本身即锚点，AI 消息向前找一位 */
function questionById(messageId: string): AgentChatMessage | undefined {
  const index = messages.value.findIndex((m) => m.id === messageId);
  if (index < 0) {
    return undefined;
  }
  const message = messages.value[index];
  if (message.role === 'user') {
    return message;
  }
  return turnQuestion(index);
}

/** 最后一条非系统消息的下标：重试只对这一轮开放，模板逐条问一次即可 */
const lastTurnIndex = computed(() => {
  for (let i = messages.value.length - 1; i >= 0; i -= 1) {
    if (messages.value[i].role !== 'system') {
      return i;
    }
  }
  return -1;
});

const bodyRef = ref<HTMLElement>();
/**
 * 贴底跟随：只在这里写 scrollTop。
 * 用户上滑即暂停跟随，回到最新由按钮或自己滚回底部恢复——
 * 流式输出只负责长高，不负责抢滚动条。
 */
const { following, hasNew, toLatest, pause: pauseFollowing } = useStickToBottom(bodyRef);
/** 输入框实例：contenteditable 只对外暴露 focus，宿主发完消息后把光标交回去 */
const inputRef = ref<{ focus: () => void }>();

/** 卡片顶替输入区会改变消息区高度：始终贴到最新，别让待选卡把最后一条回答顶出视野 */
watch(floatingCard, (card) => {
  if (card) {
    toLatest();
  }
});

/** 把引用与上下文整批带出去；只选附件不打字也允许发 */
function sendWithRefs(text: string) {
  const picked = [...refs.value];
  const pickedContexts = [...contexts.value];
  draft.value = '';
  clearRefs();
  clearContexts();
  void send(text.trim(), picked, undefined, pickedContexts);
}

/** 拆分按钮的作用域：本次执行不切档，另两档先改会话审批再放行 */
type CardPickScope = 'once' | 'session-auto' | 'session-full';

/**
 * 卡片点选：回执随下一条消息发给后端。
 * 带作用域时先把会话审批切成对应档位，切档失败就不放行，避免界面承诺与实际生效不一致。
 */
async function onCardPick(cardId: string, option: AgentCardOption, scope?: CardPickScope) {
  if (running.value) {
    return;
  }
  if (scope === 'session-auto' || scope === 'session-full') {
    const mode: AgentApprovalMode = scope === 'session-auto' ? AGENT_APPROVAL_MODE.AUTO : AGENT_APPROVAL_MODE.FULL;
    await changeApprovalMode(mode);
    if (approvalMode.value !== mode) {
      return;
    }
  }
  await answerCard(cardId, [option.key], option.label);
  // 点卡是对新回复的显式索取：即便之前在看历史，也回到最新
  toLatest();
}

/**
 * 多选 / 自由输入提交：选项集合与文字一起回传，文字可为空。
 *
 * @param cardId  卡片 id
 * @param actions 选中的动作键
 * @param text    自由输入内容
 * @param label   用户气泡文案
 */
async function onCardSubmit(cardId: string, actions: string[], text: string | undefined, label: string) {
  if (running.value) {
    return;
  }
  await answerCard(cardId, actions, label, text);
  toLatest();
}

/** 取消这张卡：回执一个保留动作，后端据此让模型停手，不替用户做选择 */
async function onCardCancel(cardId: string) {
  if (running.value) {
    return;
  }
  await answerCard(cardId, [DATABUS_CARD_ACTION_CANCEL], '取消这次选择');
  toLatest();
}

/** 悬浮卡片的点选：卡片已被抽出消息流，这里按当前浮层定位 cardId 再复用原处理 */
function onFloatingPick(option: AgentCardOption, scope?: CardPickScope) {
  const seg = floatingCard.value;
  if (seg) {
    void onCardPick(seg.card.cardId, option, scope);
  }
}

/** 悬浮卡片的提交：多选 / 自由输入合并发送 */
function onFloatingSubmit(actions: string[], text: string | undefined, label: string) {
  const seg = floatingCard.value;
  if (seg) {
    void onCardSubmit(seg.card.cardId, actions, text, label);
  }
}

/** 悬浮卡片的取消：整块卡放弃，输入区随即还回来 */
function onFloatingCancel() {
  const seg = floatingCard.value;
  if (seg) {
    void onCardCancel(seg.card.cardId);
  }
}

/** 只在「最后一条是已结束的 AI 回答」时给建议：跑的过程中和用户刚说完都不打扰 */
const showFollowUps = computed(() => {
  if (running.value) {
    return false;
  }
  const last = messages.value[messages.value.length - 1];
  if (last?.role !== 'assistant' || last.status === 'streaming') {
    return false;
  }
  // 还有待点的卡时先让用户点卡，别把注意力引到输入框；ref 卡只是入口，不算待办
  return !last.segments.some((s) => s.kind === 'card' && s.status === 'pending' && s.card.kind !== DATABUS_CARD_KIND_REF);
});

/** 点建议直接发送，和 Trae 一致；流式中忽略 */
function pickSuggestion(text: string) {
  if (running.value || !text.trim()) {
    return;
  }
  sendWithRefs(text);
  // 发出去就是要看最新，显式恢复跟随（与上滑暂停区分开）
  toLatest();
  // 点完建议把光标交回输入框，接着打字不用再点一次
  void nextTick(() => inputRef.value?.focus());
}

function submit() {
  if (running.value || (!draft.value.trim() && !refs.value.length && !contexts.value.length)) {
    return;
  }
  sendWithRefs(draft.value);
  toLatest();
}

// 贴底只由 useStickToBottom 负责（按「内容长高」和「用户意图」分别处理）。
// 不要在消息更新时写 scrollTop：那会和用户上滑抢控制权。

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
    const last = (runs ?? []).toReversed().find((run) => run.status !== AGENT_RUN_STATUS.RUNNING);
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

/* ---------------- 消息工具栏动作（删除 / 重试 / 回退） ---------------- */

/** 破坏性动作先确认；取消时返回 false */
async function confirmDestructive(message: string, title: string, confirmText: string): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, title, {
      confirmButtonText: confirmText,
      cancelButtonText: '取消',
      type: 'warning'
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 回退成功后把这一轮提问原样放回输入框：
 * 正文回填、引用卡与上下文卡回到暂存区。已有输入不覆盖，避免冲掉用户正在写的字。
 */
function restorePrompt(question: AgentChatMessage) {
  const text = segmentText(question, 'text');
  if (text && !draft.value.trim()) {
    draft.value = text;
  }
  question.refs?.forEach((ref) => addRef(ref));
  question.contexts?.forEach((item) => addContext(item));
  void nextTick(() => inputRef.value?.focus());
}

/**
 * 注入给工具栏的能力实现。
 * 具体有哪些按钮由 messageActions.ts 注册，这里只补「需要面板上下文」的部分：
 * 二次确认、系统行提示与回滚结果抛给宿主重建画布。
 */
const messageActionDeps: MessageActionDeps = {
  retryReply: (messageId) => retryReply(messageId),
  async removeTurn(messageId) {
    const confirmed = await confirmDestructive(
      '将删除这一轮提问与回答，历史里不再出现。是否继续？',
      '删除对话',
      '删除'
    );
    if (confirmed) {
      await removeTurn(messageId);
    }
  },
  async revertTurn(messageId) {
    const confirmed = await confirmDestructive(
      '将撤销这一轮及之后各轮的链路改动，并删除这些对话记录。是否继续？',
      '回退到本轮对话发起前',
      '回退'
    );
    if (!confirmed) {
      return [];
    }
    // 提问随后会被截断，先留一份原样，回退成功后放回输入框
    const question = questionById(messageId);
    const chains = await revertTurn(messageId);
    if (question) {
      restorePrompt(question);
    }
    if (!chains.length) {
      appendSystem('这一轮没有改动任何链路。', 'agent:revert');
      return chains;
    }
    ElMessage.success('已回退到本轮对话发起前');
    emit('agent-rolled-back', chains);
    return chains;
  }
};

/* ---------------- 操作审批模式（会话级，只影响链路试跑） ---------------- */

/**
 * 四档照抄 Trae：手动 / 自动 / 完全访问 / 自定义。
 * 「完全访问」是否可选由部署开关决定（allowFullAccess），关闭时该档置灰；
 * 「自定义」本阶段未开放，固定置灰。模式落库在会话上，切换后立即生效。
 */
const approvalMode = ref<AgentApprovalMode>(AGENT_APPROVAL_MODE.MANUAL);
const allowFullAccess = ref(false);

const approvalModeOptions = computed<
  { value: AgentApprovalMode; label: string; disabled: boolean; hint: string }[]
>(() => [
  { value: AGENT_APPROVAL_MODE.MANUAL, label: '手动审批', disabled: false, hint: '每次试跑前先征求确认' },
  {
    value: AGENT_APPROVAL_MODE.AUTO,
    label: '自动审批',
    disabled: false,
    hint: '纯只读的链路直接跑，含写或外部调用仍要确认'
  },
  {
    value: AGENT_APPROVAL_MODE.FULL,
    label: '完全访问',
    disabled: !allowFullAccess.value,
    hint: allowFullAccess.value ? '所有试跑不再询问' : '当前部署未开放完全访问'
  },
  { value: 'CUSTOM', label: '自定义', disabled: true, hint: '暂未开放' }
]);

const approvalModeLabel = computed(
  () => approvalModeOptions.value.find((o) => o.value === approvalMode.value)?.label ?? '手动审批'
);

/** 读会话当前模式；无会话或读取失败都按「手动审批」展示，不打断对话 */
async function loadApprovalMode(id: string) {
  if (!id) {
    approvalMode.value = AGENT_APPROVAL_MODE.MANUAL;
    allowFullAccess.value = false;
    return;
  }
  try {
    const { data } = await getAgentApprovalMode(id);
    approvalMode.value = data?.mode ?? AGENT_APPROVAL_MODE.MANUAL;
    allowFullAccess.value = Boolean(data?.allowFullAccess);
  } catch {
    approvalMode.value = AGENT_APPROVAL_MODE.MANUAL;
  }
}

/** 切换模式：先落库再改本地，失败回读服务端状态，避免界面与真实生效值不一致 */
async function changeApprovalMode(mode: string) {
  if (!conversationId.value) {
    ElMessage.info('还没有对话记录，审批模式会在开始对话后生效。');
    return;
  }
  if (mode === approvalMode.value) {
    return;
  }
  const previous = approvalMode.value;
  approvalMode.value = mode as AgentApprovalMode;
  try {
    await updateAgentApprovalMode(conversationId.value, mode as AgentApprovalMode);
    ElMessage.success(`已切换为${approvalModeLabel.value}`);
  } catch {
    approvalMode.value = previous;
    ElMessage.error('审批模式切换失败，已恢复原模式');
  }
}

// 会话切换（新开会话/切换历史会话）时重新拉取该会话的模式
watch(
  conversationId,
  (id) => {
    void loadApprovalMode(id);
    // 角标绑的是上一会话的 DOM 选区，切走后不能留在新会话上
    clearBadges();
    // 换会话后回到最新：DOM 元素没变，滚动状态得手动归位
    void nextTick(() => toLatest());
  },
  { immediate: true }
);

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

  /*
   * 滚动行为全部交给 useStickToBottom：
   * - scroll-behavior 必须是 auto，平滑动画会被流式批次反复重定向，只会更抖；
   * - overflow-anchor 保持 auto：暂停跟随时由浏览器锚定保住阅读位置（思考块收起也不会跳）；
   * - scrollbar-gutter 预留滚动条宽度，首次出现滚动条时正文不会因重排而抖一下。
   */
  scroll-behavior: auto;
  overflow-anchor: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;

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

/* AI 列占满整行：卡片、代码块要和正文同一宽度，不能按内容长短忽宽忽窄 */
.agent-chat__row.is-assistant .agent-chat__col {
  flex: 1 1 auto;
}

/* 用户列：气泡与工具条竖直排布并右对齐，工具条落在气泡下方而不是气泡内 */
.agent-chat__col--user {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  max-width: 86%;
}

/* 消息工具栏：整行悬停或键盘聚焦才出现，平时不抢注意力 */
.agent-chat__row .msg-actions {
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--db-dur-fast, 0.14s) var(--db-ease, ease);
}

.agent-chat__row:hover .msg-actions,
.agent-chat__row:focus-within .msg-actions {
  opacity: 1;
  pointer-events: auto;
}

/* 身份行：小胶囊托住图标和名字，比纯文字更有「发言人」感 */
.agent-chat__who {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  padding: 3px 9px 3px 7px;
  border-radius: 7px;
  background: var(--db-bg-hover, rgba(120, 120, 128, 0.08));
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.6;
  color: var(--db-ink-muted, #6e6e73);
}

/* 星芒外层：动画落在本组件自己的元素上，避免子组件根节点选择器不命中 */
.agent-chat__who-spark {
  position: relative;
  flex: none;
  display: inline-flex;
  transform-origin: 50% 50%;
}

/* 软光晕：径向渐变自然衰减，边界柔和 */
.agent-chat__who-spark::before {
  content: '';
  position: absolute;
  inset: -7px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(10, 132, 255, 0.26) 0%,
    rgba(10, 132, 255, 0.1) 38%,
    rgba(10, 132, 255, 0) 72%
  );
  opacity: 0;
  transform: scale(0.75);
  pointer-events: none;
  will-change: opacity, transform;
}

.agent-chat__who-icon {
  flex: none;
  font-size: 13.5px;
  color: #0a84ff;
}

/* 回复中：胶囊底色微渐变，不加描边 */
.agent-chat__who.is-streaming {
  background: linear-gradient(180deg, rgba(10, 132, 255, 0.07), rgba(10, 132, 255, 0.02));
}

.agent-chat__who.is-streaming .agent-chat__who-spark {
  animation: agent-spark-breathe 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.agent-chat__who.is-streaming .agent-chat__who-spark::before {
  animation: agent-spark-halo 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

/* 缓慢扫过的微光：覆盖整枚胶囊（星芒 + 文字），背景按胶囊圆角裁切 */
.agent-chat__who.is-streaming::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(
    100deg,
    rgba(255, 255, 255, 0) 38%,
    rgba(255, 255, 255, 0.85) 50%,
    rgba(255, 255, 255, 0) 62%
  );
  background-size: 240% 100%;
  background-position: 135% 0;
  mix-blend-mode: screen;
  opacity: 0;
  pointer-events: none;
  animation: agent-who-sweep 3.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

/* 常驻可见的状态点：即使系统关闭动效，也能看出这条正在回复 */
.agent-chat__who-live {
  flex: none;
  width: 5px;
  height: 5px;
  margin-left: 3px;
  border-radius: 50%;
  background: #0a84ff;
  box-shadow: 0 0 6px rgba(10, 132, 255, 0.45);
  animation: agent-live-dot 1.6s ease-in-out infinite;
}

/* 只让透明度起伏，不缩放，避免小圆点抖动出颗粒感 */
@keyframes agent-live-dot {
  0%,
  100% {
    opacity: 0.55;
  }

  50% {
    opacity: 1;
  }
}

/* 轻微呼吸（1 → 1.12），实心小图标不会被拉出像素感 */
@keyframes agent-spark-breathe {
  0%,
  100% {
    opacity: 0.9;
    transform: scale(1);
  }

  50% {
    opacity: 1;
    transform: scale(1.12);
  }
}

@keyframes agent-spark-halo {
  0%,
  100% {
    opacity: 0.25;
    transform: scale(0.8);
  }

  50% {
    opacity: 0.75;
    transform: scale(1.15);
  }
}

/* 3.2s 一轮：前段静默，随后一道微光自右向左扫过整枚胶囊，扫完再静默 */
@keyframes agent-who-sweep {
  0%,
  50% {
    opacity: 0;
    background-position: 135% 0;
  }

  58% {
    opacity: 0.85;
  }

  82% {
    opacity: 0;
    background-position: -45% 0;
  }

  100% {
    opacity: 0;
    background-position: -45% 0;
  }
}

/* 说明：状态指示是“正在回复”的唯一反馈，这里不做 prefers-reduced-motion 关闭，
   否则系统开启“减少动画”时会完全看不到运行状态（仅剩一颗静态蓝点）。 */

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

/* 悬浮选择卡：待选时整块顶替输入区，白底大圆角 + 大投影，不做成消息流里的一段 */
.agent-chat__ask {
  position: relative;
  z-index: 2;
  flex-shrink: 0;
  max-height: 100%;
  margin: 0 12px 12px;
  padding: 14px 14px 12px;
  overflow-y: auto;
  border-radius: 16px;
  background: var(--db-bg-solid, #fff);
  box-shadow:
    0 14px 36px rgba(0, 0, 0, 0.14),
    0 2px 8px rgba(0, 0, 0, 0.06);
  animation: agent-chat-ask-in 0.18s ease-out;
}

/* 卡片自带外边距，浮层里由容器控制留白 */
.agent-chat__ask :deep(.agent-card) {
  margin: 0;
}

@keyframes agent-chat-ask-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
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

/* 「回到最新」：浮在输入区上沿，不参与消息区布局，出现/消失不会再次触发滚动 */
.agent-chat__latest {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  z-index: 1;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 3px 10px 3px 3px;
  /* 与选区评论气泡（.ctx-bubble / .ctx-act）同一套：白底 + 1px 浅边 + 柔和大投影 */
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 999px;
  background: var(--el-bg-color-overlay, #fff);
  box-shadow: var(--el-box-shadow-light, 0 6px 24px rgba(0, 0, 0, 0.12));
  line-height: 1;
  white-space: nowrap;
  color: var(--el-text-color-primary, #303133);
  cursor: pointer;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;

  &:hover {
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.16);
  }
}

/* 左端黑圆：与评论输入框那个对勾按钮同一种墨色；圆形裁切让箭头端点自然被“吃掉” */
.agent-chat__latest-arrow {
  position: relative;
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--el-text-color-primary, #303133);
  color: #fff;
  overflow: hidden;
  transition: background-color 0.15s;
}

/*
 * 三条相同箭头首尾相接成一条带子，每轮只下移一个「箭头高 + 间距」，
 * 复位瞬间图案与起点完全重合，所以接缝看不出来，视觉上是一直在往下排队。
 * 默认停在居中位置：流式结束后箭头就静静待着，不空转。
 */
.agent-chat__latest-queue {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  transform: translateY(6.5px);
}

.agent-chat__latest-queue :deep(svg) {
  display: block;
  flex: none;
  width: 13px;
  height: 13px;
}

/* 只有真的还在出字时才流动 */
.agent-chat__latest.is-flowing .agent-chat__latest-queue {
  animation: agent-chat-latest-queue 1.2s linear infinite;
}

@keyframes agent-chat-latest-queue {
  from {
    transform: translateY(-12px);
  }

  to {
    transform: translateY(7px);
  }
}

.agent-chat__latest-text {
  font-size: 12px;
  color: var(--el-text-color-regular, #606266);
  transition: color 0.15s;
}

.agent-chat__latest:hover .agent-chat__latest-arrow {
  background: #1f1f1f;
}

.agent-chat__latest:hover .agent-chat__latest-text {
  color: var(--el-text-color-primary, #303133);
}

/* 有新内容：文字压成纯黑并加重，与默认的次级灰字拉开一档 */
.agent-chat__latest.is-fresh .agent-chat__latest-text {
  color: var(--el-text-color-primary, #303133);
  font-weight: 500;
}

/* 浮层进出：只做透明度和 4px 位移，绝对定位不参与布局，不会触发二次滚动 */
.agent-chat-latest-enter-active,
.agent-chat-latest-leave-active {
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
}

.agent-chat-latest-enter-from,
.agent-chat-latest-leave-to {
  opacity: 0;
  transform: translate(-50%, 4px);
}

@media (prefers-reduced-motion: reduce) {
  .agent-chat-latest-enter-active,
  .agent-chat-latest-leave-active {
    transition: none;
  }
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

/* 已发消息：卡片与正文同行，靠右外边距和文字隔开，而不是让卡片独占一行 */
.agent-chat__ctx-inline {
  margin-right: 4px;
}

/* 引用卡条：已发气泡里换行铺开，多了往下折，不占横向滚动 */
.agent-chat__refs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* 间距只加在「有正文跟在后面」时，纯引用消息里的卡片才在气泡中垂直居中 */
.agent-chat__refs.is-bubble + .agent-chat__text {
  margin-top: 6px;
}

/* 已发气泡里去掉描边、底色更淡，让正文占主导 */
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

.agent-chat__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
}

/* 左侧工具区：工作区是稳定入口，不随栏宽收缩；右侧按钮可退化成省略号 */
.agent-chat__tools {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 2px;

  /* 工作区是稳定入口，不随栏宽收缩；右侧回滚按钮可退化成省略号 */
  > .el-dropdown {
    flex-shrink: 0;
  }
}

/* 工具钮：低调文字钮，hover 才显底色 */
.agent-chat__tool {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  height: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s;

  > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

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

/* 工作区下拉的展开箭头：比主图标再小一号，暗示可展开 */
.agent-chat__tool .agent-chat__tool-caret {
  width: 12px;
  height: 12px;
  margin-left: -2px;
  opacity: 0.7;
}

/* 审批模式菜单里的未选中占位：与勾选图标同宽，保证四档文字左对齐 */
.agent-chat__mode-placeholder {
  display: inline-block;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
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
  /* 黑白：墨底 + 反相字色，深色模式下 --db-ink 自动翻成亮色，不用另写一套 */
  background: var(--db-ink, #1c1c1e);
  color: var(--db-bg-solid, #ffffff);
  font-size: 17px;
  cursor: pointer;
  transition:
    background-color 0.15s,
    transform 0.1s;

  &:hover:not(:disabled) {
    background: var(--db-ink-secondary, #3a3a3c);
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
    /* 运行中必须留住实底，否则只剩一个孤立方块，看起来像按钮"淡掉了" */
    background: var(--db-ink, #1c1c1e);
    /* 内描边取 currentColor：明暗主题共用一条规则 */
    box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 48%, transparent);

    &:hover {
      background: var(--db-ink-secondary, #3a3a3c);
    }
  }
}

/* 停止图标：方形用 fill 变实心，与发送的纸飞机同一套面性语言 */
.agent-chat__stop-icon {
  font-size: 14px;
  fill: currentColor;
}
</style>