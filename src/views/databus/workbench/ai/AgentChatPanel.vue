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

      <div
        v-for="(m, i) in messages"
        :key="m.id"
        class="agent-chat__row"
        :class="[`is-${m.role}`, { 'has-revert-card': revertCard?.messageId === m.id }]"
      >
        <!-- 系统行：错误提示、画布更新被丢弃等结论性提示 -->
        <div v-if="m.role === 'system'" class="agent-chat__system" :class="{ 'is-error': isErrorNotice(m) }">
          <span class="agent-chat__system-text">
            <SvgIcon
              v-if="isErrorNotice(m)"
              class="agent-chat__system-icon"
              icon-class="lucide:circle-alert"
            />
            <span class="agent-chat__system-body">{{ noticeText(m) }}</span>
          </span>
        </div>
        <!-- 用户消息：原样纯文本，不解析 Markdown -->
        <div v-else-if="m.role === 'user'" class="agent-chat__col agent-chat__col--user">
          <div
            class="agent-chat__bubble"
            data-context-type="chat"
            :data-context-anchor="`msg-${m.id}`"
          >
            <!-- 整件资源引用：芯片形态与输入区一致，点击交给宿主跳转资源 -->
            <div v-if="attachmentsOf(m.id).resources.length" class="agent-chat__refs is-bubble">
              <span
                v-for="c in attachmentsOf(m.id).resources"
                :key="c.id"
                class="agent-chat__ref"
                :style="{ '--ref-color': refMeta(c.type).color }"
                @mouseenter="onChipHoverEnter(c, $event)"
                @mouseleave="chipHover.leave"
                @click="openResourceDetail(c, $event)"
              >
                <SvgIcon class="agent-chat__ref-icon" :icon-class="refMeta(c.type).icon" />
                <span class="agent-chat__ref-name">{{ c.title }}</span>
                <span v-if="c.note" class="agent-chat__ref-note">· {{ c.note }}</span>
              </span>
            </div>
            <!-- 上下文卡与正文同处一行内流：像 span 一样挨着文字，不单独占一行 -->
            <p v-if="textOf(m) || attachmentsOf(m.id).excerpts.length" class="agent-chat__text">
              <AgentContextCard
                v-for="(c, ci) in attachmentsOf(m.id).excerpts"
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
          <!-- 回退影响清单：预检发现有跳过 / 引用时在提问下方就地确认，确认后才落库 -->
          <RevertImpactCard
            v-if="revertCard?.messageId === m.id"
            class="agent-chat__revert"
            :preview="revertCard.preview"
            :busy="revertBusy"
            @cancel="cancelRevert"
            @confirm="confirmRevert"
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
            data-context-type="chat"
            :data-context-anchor="`msg-${m.id}`"
          >
            <template v-for="(seg, i) in m.segments" :key="i">
              <!-- 正文开始后思考就收起：展开的是过程，不是结果 -->
              <ThinkingBlock
                v-if="seg.kind === 'thinking'"
                :text="seg.text"
                :streaming="isLiveThinking(m, i)"
                @toggle="pauseFollowing"
              />
              <!-- 当前阶段：一条可变状态行，进行中白光胶囊，结束后收成一句，可展开看明细 -->
              <AgentStageLine v-else-if="seg.kind === 'stage'" :stage="seg" @toggle="pauseFollowing" />
              <!-- 错误：红图标 + 红文案；编号挂在图标上（hover 显示、点击复制），不占第二行 -->
              <div v-else-if="seg.kind === 'error'" class="agent-chat__error">
                <p class="agent-chat__error-text">
                  <el-tooltip
                    v-if="seg.error.referenceId"
                    :content="t('ai.error.referenceCopy', { ref: seg.error.referenceId })"
                    placement="top"
                    :show-after="200"
                  >
                    <button
                      type="button"
                      class="agent-chat__error-icon"
                      :aria-label="t('ai.error.reference', { ref: seg.error.referenceId })"
                      @click="copyErrorRef(seg.error)"
                    >
                      <SvgIcon icon-class="lucide:circle-alert" />
                    </button>
                  </el-tooltip>
                  <SvgIcon v-else class="agent-chat__error-icon is-static" icon-class="lucide:circle-alert" />
                  <span>{{ seg.error.message }}</span>
                </p>
              </div>
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
            <!-- 还没吐字时用光标 + 状态词表示「在跑」，避免用户误判为卡死 -->
            <p v-if="m.status === 'streaming' && !hasText(m)" class="agent-chat__text">
              <span class="agent-chat__cursor" />
              <span class="agent-chat__waiting">正在生成</span>
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

      <!-- 追问建议：贴在最后一条回答末尾，点一下直接发送；内容由后端按本轮内容生成，空则不渲染 -->
      <div v-if="showFollowUps" class="agent-chat__followups">
        <button
          v-for="s in followUps"
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

    <!-- 输入区：整块灰底无边框，底部一行工具（工作区 / 审批模式）+ 发送按钮
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
          <!-- 左侧工具区：工作区、操作审批模式 -->
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
          </div>
          <button v-if="running" type="button" class="agent-chat__send is-stop" @click="stop">
            <SvgIcon icon-class="lucide:square" class="agent-chat__stop-icon" />
          </button>
          <button
            v-else
            type="button"
            class="agent-chat__send"
            :disabled="!draft.trim() && !contexts.length"
            @click="submit"
          >
            <SvgIcon icon-class="lucide:send-filled" />
          </button>
        </div>
      </div>
    </div>

    <!-- 历史消息里的资源芯片：hover 出同一张卡，可复制编码或重新加入当前会话 -->
    <ResourceHoverBubble :controller="chipHover" />

    <!-- 卡片详情：改评论，再决定是否跳转（消息原位 / 链路、组件、连接器包） -->
    <ContextDetailDialog
      v-model:visible="detailVisible"
      :item="detailItem"
      :anchor="detailAnchor"
      :jump-label="detailJumpLabel"
      @jump="onDetailJump"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * AI 助手对话面板（工作台侧栏薄壳）：消息流 + 输入区 + 卡片点选回执。
 *
 * 会话状态在 useAgentChat、附件暂存在 useAgentContext（按 conversationId 分桶，
 * 收起侧栏不丢，切会话各看各的）。
 * SnailAI 不可达或流断开时，错误作为 AI 消息里的 `error` 段呈现，不再是系统告警行。
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { isHandledRequestError } from '@/utils/request';
import { useStickToBottom } from '@/hooks/scroll/useStickToBottom';
import {
  getAgentApprovalMode,
  previewAgentRunRevert,
  updateAgentApprovalMode
} from '@/api/databus/agent';
import type {
  AgentApprovalMode,
  AgentCard,
  AgentCardOption,
  AgentErrorInfo,
  AgentRevertPreviewVo,
  AgentRollbackVo
} from '@/api/databus/agent/types';
import { useLucideSubset } from '../composables/useLucideSubset';
import { AGENT_APPROVAL_MODE } from '@/constants/databus';
import { DATABUS_CARD_ACTION_CANCEL, DATABUS_CARD_KIND_CHOICE, DATABUS_CARD_KIND_REF } from '@/constants/databus-common';
import { cardViewOf } from './agentCardRegistry';
import AgentContextCard from './AgentContextCard.vue';
import ContextDetailDialog from './ContextDetailDialog.vue';
import ResourceHoverBubble from './ResourceHoverBubble.vue';
import { useResourceHover } from './useResourceHover';
import type { HoverResourceAction } from './useResourceActions';
import MarkdownBlock from './MarkdownBlock.vue';
import MessageActionBar from './MessageActionBar.vue';
import ThinkingBlock from './ThinkingBlock.vue';
import AgentStageLine from './AgentStageLine.vue';
import RevertImpactCard from './RevertImpactCard.vue';
import type { MessageActionDeps } from './messageActions';
import { useAgentChat, type AgentChatMessage } from './useAgentChat';
import { useAgentContext } from './useAgentContext';
import { agentRefOf, type AgentRefItem } from './useAgentRefs';
import AgentComposer, { type ComposerChip } from './AgentComposer.vue';
import { refMeta } from './agentRefTypes';
import { isResourceContext, type AgentContextItem, type AgentContextSource } from './contextTypes';

defineOptions({ name: 'AgentChatPanel' });

useLucideSubset();

const { t } = useI18n();

/** 宿主传入的「当前草稿组件编码」：卡片播放钮据此判断，历史卡片缺 draft 字段也能露出 */
defineProps<{
  draftCodes?: string[];
}>();

const emit = defineEmits<{
  /** 回滚完成：宿主据此重建画布、关掉已删除链路的 tab；SKIP 条目已在面板侧过滤 */
  'agent-rolled-back': [items: AgentRollbackVo[]];
  /** 点引用卡：跳转由宿主承接，面板不感知工作台内部路由 */
  'ref-open': [ref: AgentRefItem];
  /** 草稿卡「▶ 试运行」：开单节点预览链路（宿主判草稿态） */
  'ref-preview': [ref: AgentRefItem];
}>();

/**
 * 追问建议：run 结束后由后端按本轮内容生成，挂在最后一条 AI 消息上。
 * 生成失败或本轮不值得追问时为空，整行不渲染。
 */
const followUps = computed(() => {
  const last = messages.value[messages.value.length - 1];
  if (last?.role !== 'assistant') {
    return [];
  }
  return (last.followUps ?? []).filter((item) => !!item.trim());
});

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

/** 上下文附件：划字摘录与整件资源共用一份暂存，发送时整批带出去 */
const { contexts, addContext, removeContext, clearContexts, clearBadges } = useAgentContext();

/** 输入区已有卡片时不再提示「@ 添加上下文」——它们本身就是已输入的内容 */
const inputPlaceholder = computed(() =>
  contexts.value.length ? '' : '@ 添加上下文，/ 使用命令和技能'
);

/* ---------------- 历史消息里的资源芯片：hover 操作卡 ---------------- */

const chipHover = useResourceHover();

/** 资源类型 → 复制按钮文案；未注册类型只说「编码」，不编造中文名 */
const RESOURCE_CODE_LABEL: Record<string, string> = {
  chain: '链路码',
  component: '组件码',
  connector: '连接器码'
};

/** 历史附件 → hover 资源；只有整件资源芯片可操作，文字摘录不挂 */
function chipResourceOf(item: AgentContextItem | null): HoverResourceAction | null {
  if (!item || !isResourceContext(item)) {
    return null;
  }
  return {
    type: item.type,
    id: item.payload?.id,
    code: item.payload?.code,
    name: item.title,
    codeLabel: RESOURCE_CODE_LABEL[item.type] ?? '编码',
    connectorType: item.payload?.connectorType,
    connectorVersion: item.payload?.connectorVersion
  };
}

function onChipHoverEnter(item: AgentContextItem, event: MouseEvent): void {
  chipHover.enter(chipResourceOf(item), event);
}

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

/** 所有附件统一成同一种行内卡：序号 + 标题 + 可选评论，顺序即加入顺序 */
const composerChips = computed<ComposerChip[]>(() =>
  contexts.value.map((c, ci) => ({
    key: `ctx:${c.id}`,
    label: `${ci + 1}. ${c.title}`,
    // 标题和评论分开传：卡片整体仍是一个长度上限，但会优先保证评论露出开头
    note: c.note || undefined
  }))
);

/** 卡片删除：key 回查上下文暂存区 */
function onChipRemove(key: string) {
  const context = contexts.value.find((c) => `ctx:${c.id}` === key);
  if (context) {
    removeContext(context);
  }
}

/** 点卡片本体：统一开详情浮层（改评论 + 再决定是否跳转），锚点用卡片自身 */
function onChipOpen({ key, anchor }: { key: string; anchor: HTMLElement }) {
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

/**
 * 浮层对应的条目是否还存在（暂存区或已发消息里）：
 * 卡片被删（输入区叉号、清空暂存、删除整轮消息）后浮层必须跟着收，
 * 否则会挂在一张已经不存在的卡上继续允许改评论。
 */
const detailItemExists = computed(() => {
  const id = detailItem.value?.id;
  if (!id) {
    return false;
  }
  if (contexts.value.some((c) => c.id === id)) {
    return true;
  }
  return messages.value.some((m) => (m.contexts ?? []).some((c) => c.id === id));
});

watch(detailItemExists, (exists) => {
  if (!exists) {
    detailVisible.value = false;
    detailItem.value = null;
  }
});

/**
 * 详情浮层底部按钮：
 * - 整件资源按类型给「打开链路 / 查看组件 / 打开连接器包」；
 * - 文字摘录只有带来源锚点时才给「跳转到消息」。
 */
const detailJumpLabel = computed(() => {
  const item = detailItem.value;
  if (!item) {
    return '';
  }
  if (isResourceContext(item)) {
    return refMeta(item.type).openLabel;
  }
  return item.source?.anchor ? '跳转到消息' : '';
});

/** 浮层跳转：资源交宿主打开，摘录回原处并闪选中的那段文字 */
function onDetailJump(text: string): void {
  const item = detailItem.value;
  if (!item) {
    return;
  }
  if (isResourceContext(item)) {
    openRef(agentRefOf(item));
    return;
  }
  if (item.source) {
    revealContext(item.source, text);
  }
}

/** 「去看来处」交给全局选区浮层：它知道怎么按 anchor 定位、滚动并只闪选中那一段 */
function revealContext(source: AgentContextSource, text: string) {
  window.dispatchEvent(new CustomEvent('databus:context:reveal', { detail: { ...source, text } }));
}

/** 点资源引用卡：交给宿主按资源类型决定跳转目标 */
function openRef(item: AgentRefItem) {
  emit('ref-open', item);
}

/** 整件资源芯片：先弹详情改评论，再由用户点「打开链路/查看组件」跳转 */
function openResourceDetail(item: AgentContextItem, event: MouseEvent) {
  chipHover.close();
  openContext(item, event.currentTarget as HTMLElement);
}

/** 同一消息的附件按「资源 / 摘录」分流：模板一次渲染要读多次，先按消息 id 预算好 */
const EMPTY_ATTACHMENTS = { resources: [] as AgentContextItem[], excerpts: [] as AgentContextItem[] };
const attachmentsMap = computed(() => {
  const map = new Map<string, { resources: AgentContextItem[]; excerpts: AgentContextItem[] }>();
  for (const message of messages.value) {
    const list = message.contexts ?? [];
    map.set(message.id, {
      resources: list.filter(isResourceContext),
      excerpts: list.filter((c) => !isResourceContext(c))
    });
  }
  return map;
});

function attachmentsOf(id: string) {
  return attachmentsMap.value.get(id) ?? EMPTY_ATTACHMENTS;
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

/** 把某一类段落拼成纯文本（用户气泡、系统行、空态判断都只要这一种；卡片 / 工具阶段不算文字） */
function segmentText(message: AgentChatMessage, kind: 'text' | 'thinking' | 'notice'): string {
  return message.segments
    .filter((s) => s.kind === kind)
    .map((s) => (s.kind === 'text' || s.kind === 'thinking' || s.kind === 'notice' ? s.text : ''))
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

/**
 * 思考块只有「最后一个 segment 仍是思考」时才在扫光：
 * 一旦出现正文 / 阶段 / 卡片，思考阶段已经结束。
 */
function isLiveThinking(message: AgentChatMessage, index: number): boolean {
  return message.status === 'streaming'
    && !hasText(message)
    && index === message.segments.length - 1;
}

/** 错误图标点击：复制参考编号，供用户发给支持人员 */
async function copyErrorRef(error: AgentErrorInfo): Promise<void> {
  if (!error.referenceId) {
    return;
  }
  try {
    await navigator.clipboard.writeText(error.referenceId);
    ElMessage.success(t('ai.error.copied'));
  } catch {
    ElMessage.warning(t('ai.error.copyFailed'));
  }
}
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

/** 把上下文整批带出去；只选附件不打字也允许发 */
function sendWithContexts(text: string) {
  const picked = [...contexts.value];
  draft.value = '';
  clearContexts();
  void send(text.trim(), picked);
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

/** 只在「最后一条是已结束的 AI 回答且有建议」时展示：跑的过程中和用户刚说完都不打扰 */
const showFollowUps = computed(() => {
  if (running.value || !followUps.value.length) {
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
  sendWithContexts(text);
  // 发出去就是要看最新，显式恢复跟随（与上滑暂停区分开）
  toLatest();
  // 点完建议把光标交回输入框，接着打字不用再点一次
  void nextTick(() => inputRef.value?.focus());
}

function submit() {
  if (running.value || (!draft.value.trim() && !contexts.value.length)) {
    return;
  }
  sendWithContexts(draft.value);
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

/* ---------------- 消息工具栏动作（删除 / 重试 / 回退） ---------------- */

/**
 * 回退成功后把这一轮提问原样放回输入框：
 * 正文回填、上下文卡（含整件资源）回到暂存区。已有输入不覆盖，避免冲掉用户正在写的字。
 */
function restorePrompt(question: AgentChatMessage) {
  const text = segmentText(question, 'text');
  if (text && !draft.value.trim()) {
    draft.value = text;
  }
  question.contexts?.forEach((item) => addContext(item));
  void nextTick(() => inputRef.value?.focus());
}

/* ---------------- 回退：先预检出卡告知影响，确认后才执行 ---------------- */

/** 待确认的回退：挂在被点的提问下方，不落库、不进 AgentCard 协议 */
const revertCard = ref<{ messageId: string; preview: AgentRevertPreviewVo } | null>(null);
const revertBusy = ref(false);

/** 真正执行回退：落库、截断消息、回填提问，并把可执行的结果抛给宿主 */
async function applyRevert(messageId: string): Promise<AgentRollbackVo[]> {
  const question = questionById(messageId);
  revertBusy.value = true;
  try {
    const items = await revertTurn(messageId);
    if (question) {
      restorePrompt(question);
    }
    if (!items.length) {
      appendSystem('这一轮没有可回退的改动。', 'agent:revert');
      return items;
    }
    // 撤回是默认能力，SKIP 只剩「已归属他人 / 被回退范围外链路引用」两类，不让宿主去动它们
    const applied = items.filter((item) => item.action !== 'SKIP');
    if (applied.length) {
      ElMessage.success('已回退到本轮对话发起前');
    } else {
      appendSystem('本轮改动均无法撤回（资源已归属他人，或被回退范围外的链路引用）。', 'agent:revert');
    }
    emit('agent-rolled-back', applied);
    return items;
  } finally {
    revertBusy.value = false;
  }
}

/** 确认影响清单后执行；请求类错误拦截器已提示过，这里只兜底本地异常 */
async function confirmRevert() {
  const pending = revertCard.value;
  if (!pending || revertBusy.value) {
    return;
  }
  revertCard.value = null;
  try {
    await applyRevert(pending.messageId);
  } catch (error) {
    if (!isHandledRequestError(error)) {
      ElMessage.error(error instanceof Error ? error.message : '回退失败');
    }
  }
}

function cancelRevert() {
  revertCard.value = null;
}

/**
 * 注入给工具栏的能力实现。
 * 具体有哪些按钮由 messageActions.ts 注册，这里只补「需要面板上下文」的部分：
 * 二次确认、系统行提示与回滚结果抛给宿主重建画布。
 */
const messageActionDeps: MessageActionDeps = {
  retryReply: (messageId) => retryReply(messageId),
  // 确认已在消息工具栏的就地气泡完成（MessageActionBar），这里只执行
  removeTurn,
  async revertTurn(messageId) {
    const runId = questionById(messageId)?.runId;
    if (!runId) {
      return [];
    }
    // 预检只读：先算清哪些撤销、哪些跳过、哪些引用受影响，再把清单摊给用户
    const { data } = await previewAgentRunRevert(runId);
    const preview = data ?? { revert: [], skip: [], affected: [] };
    if (!preview.revert.length && !preview.skip.length) {
      appendSystem('这一轮没有可回退的改动。', 'agent:revert');
      return [];
    }
    // 撤回不静默执行：只要有可撤项就出卡告知，用户确认后才真正落库
    revertCard.value = { messageId, preview };
    return [];
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
  --db-ref-connector: #a371f7;
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
  /* 全局 border-box 下 .svg-icon 的 width:1em 会被 padding 吃掉，图形只剩几个像素 */
  box-sizing: content-box;
  font-size: 30px;
  padding: 14px;
  border-radius: var(--db-r-card, 14px);
  color: var(--db-blue, #007aff);
  background: var(--db-accent-soft, rgba(120, 120, 128, 0.12));
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
  /* 长会话只渲染视口附近的行，滚动更稳；估高与普通一轮接近，避免滚动条跳动 */
  content-visibility: auto;
  contain-intrinsic-size: auto 140px;

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

/* 回退确认卡要占满整行：临时放开用户列的宽度限制，气泡仍靠右、卡片铺满 */
.agent-chat__row.is-user.has-revert-card .agent-chat__col--user {
  width: 100%;
  max-width: 100%;
}

.agent-chat__revert {
  align-self: stretch;
  width: 100%;
  margin-top: 8px;
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

.agent-chat__waiting {
  margin-left: 8px;
  font-size: var(--db-fs-xs, 11px);
  color: var(--db-ink-muted, #6e6e73);
  animation: agent-waiting-pulse 1.4s ease-in-out infinite;
}

@keyframes agent-waiting-pulse {
  0%,
  100% {
    opacity: 0.45;
  }

  50% {
    opacity: 1;
  }
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
  font-size: var(--db-fs-sm, 12px);
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
    rgba(120, 120, 128, 0.26) 0%,
    rgba(120, 120, 128, 0.1) 38%,
    rgba(120, 120, 128, 0) 72%
  );
  opacity: 0;
  transform: scale(0.75);
  pointer-events: none;
  will-change: opacity, transform;
}

.agent-chat__who-icon {
  flex: none;
  font-size: var(--db-fs-md, 13px);
  color: var(--db-blue, #007aff);
}

/* 回复中：胶囊底色微渐变，不加描边 */
.agent-chat__who.is-streaming {
  background: linear-gradient(180deg, rgba(120, 120, 128, 0.07), rgba(120, 120, 128, 0.02));
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
  background: var(--db-accent, #1c1c1e);
  box-shadow: 0 0 6px color-mix(in srgb, var(--db-accent) 45%, transparent);
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
}

/* 段内提示（工具事件、能力限制）：比正文更轻，靠色阶和字号区分 */
.agent-chat__notice {
  margin: 0 0 8px;
  font-size: var(--db-fs-xs, 11px);
  line-height: 1.6;
  color: var(--db-ink-muted, #6e6e73);
}

/* 错误段：红图标 + 红文案，行内排版；编号挂在图标上，不占第二行 */
.agent-chat__error {
  margin: 0 0 8px;
}

.agent-chat__error-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.75;
  color: var(--db-red, #ff3b30);
  word-break: break-word;
}

/* 图标与文字同为 13px、同一颜色；盒子高度对齐首行行高，内部居中 */
.agent-chat__error-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 1.75em;
  margin-right: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 13px;
  vertical-align: top;
  cursor: pointer;
}

/* 悬停底色单独画一个圆，避免 18×行高 的盒子被拉成椭圆 */
.agent-chat__error-icon::before {
  content: '';
  position: absolute;
  inset: 0;
  width: 18px;
  height: 18px;
  margin: auto;
  border-radius: 50%;
  background: transparent;
  transition: background-color 0.15s;
  pointer-events: none;
}

.agent-chat__error-icon:hover::before,
.agent-chat__error-icon:focus-visible::before {
  background: rgba(255, 59, 48, 0.12);
}

.agent-chat__error-icon:focus-visible {
  outline: none;
}

.agent-chat__error-icon.is-static {
  cursor: default;
}

.agent-chat__error-icon.is-static:hover::before {
  background: transparent;
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

/* 系统行：左侧细引导线 + 文案，宽度随内容，不做整行填充 */
.agent-chat__system {
  max-width: 100%;
  margin: 8px 0;
  font-size: var(--db-fs-sm, 12px);
  line-height: 1.65;
  color: var(--db-ink-muted, #6e6e73);

  &.is-error {
    color: var(--db-red, #ff3b30);
  }
}

.agent-chat__system-text {
  display: inline-flex;
  align-items: flex-start;
  gap: 6px;
  max-width: 100%;
  padding: 1px 0 1px 10px;
  border-left: 2px solid var(--db-rule, rgba(60, 60, 67, 0.12));
}

.agent-chat__system.is-error .agent-chat__system-text {
  border-left-color: var(--db-red, #ff3b30);
}

.agent-chat__system-icon {
  flex: none;
  margin-top: 2px;
  font-size: 12px;
}

.agent-chat__system-body {
  min-width: 0;
  word-break: break-word;
}

.agent-chat__input {
  position: relative;
  flex-shrink: 0;
  /* 底边 8px，与终端卡 8px 外边距对齐，两张卡底边落在同一条线上 */
  padding: 8px 12px 8px;
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

/* 输入块：下沉面底色（与工作台画布、会话历史栏同一令牌）+ 半根发丝线界定边界，
   聚焦转白并把线加深（不加蓝环，保持安静） */
.agent-chat__composer {
  display: flex;
  flex-direction: column;
  /* 与终端卡同高（共用令牌）；正文超出时输入卡再向下长高 */
  min-height: var(--db-bottom-pane-h, 150px);
  padding: 12px 12px 8px;
  border-radius: var(--db-r-card, 14px);
  background: var(--db-bg-sunken, #f4f4f5);
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

/* 资源卡的评论：与标题同一行，标题先让位，评论始终露出开头 */
.agent-chat__ref-note {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 72px;
  overflow: hidden;
  color: var(--db-ink-muted, #6e6e73);
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

/* 左侧工具区：两个下拉保持完整，文案过长时由内部 span 省略 */
.agent-chat__tools {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 2px;

  /* 下拉钮不参与收缩：文案省略交给内部 span，避免按钮被压扁 */
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
    /* 运行中必须留住实底，否则只剩一个孤立方块，看起来像按钮"淡掉了"；
       黑白主题下取亮色（白底 + 黑方块），不用墨底 + 内发光——那层描边就是塑料感的来源 */
    background: var(--db-surface-solid, #ffffff);
    color: var(--db-ink, #1c1c1e);
    box-shadow: inset 0 0 0 1px var(--db-rule-strong, rgba(60, 60, 67, 0.24));

    &:hover {
      background: var(--db-bg-hover, rgba(120, 120, 128, 0.08));
    }
  }
}

/* 停止图标：方形用 fill 变实心，与发送的纸飞机同一套面性语言 */
.agent-chat__stop-icon {
  font-size: 14px;
  fill: currentColor;
}
</style>