/**
 * AI 助手对话状态（工作台侧栏 / 完整 AI 页共用）。
 *
 * 说话走两步：先 POST /databus/agent/chat 建 run 拿 runId，再用原生 EventSource 拉流
 * （EventSource 不能带自定义头，鉴权沿用 ?Authorization=Bearer token）。
 * run 状态全归后端，前端只存会话 id，刷新后继续同一会话。
 *
 * 消息按「段」存（不是一整块字符串）：`text` 段走 Markdown，`thinking` 段折叠展示，
 * `stage` 是当前阶段（一条可变状态行），`error` 是服务级失败（AI 消息里的一句话），
 * `notice` 段是系统提示，`card` 段是交互卡片，新类型只需加一个段类型。
 *
 * 状态是**模块级单例、按会话分桶**：AI 栏收起时面板组件会整栏销毁，消息不能跟着丢；
 * 每个 conversationId 一份消息 / 运行态 / SSE 连接，切换会话不重复拉历史，多会话可并行。
 */
import { computed, h, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import i18n from '@/lang';
import {
  buildAgentStreamUrl,
  deleteAgentConversation,
  deleteAgentRun,
  getActiveAgentRun,
  listAgentConversations,
  listAgentHistory,
  pinAgentConversation,
  renameAgentConversation,
  restoreAgentConversation,
  retryAgentRun,
  revertAgentRun,
  searchAgentConversations,
  startAgentChat,
  stopAgentRun
} from '@/api/databus/agent';
import type {
  AgentCard,
  AgentCardReply,
  AgentConversationVo,
  AgentErrorInfo,
  AgentStepInfo,
  AgentSystemEvent
} from '@/api/databus/agent/types';
import {
  AGENT_SSE_CARD,
  AGENT_SSE_DONE,
  AGENT_SSE_ERROR,
  AGENT_SSE_FOLLOW_UPS,
  AGENT_SSE_STEP_END,
  AGENT_SSE_STEP_START,
  AGENT_SSE_TEXT,
  AGENT_SSE_THINKING,
  AGENT_SSE_TITLE,
  AGENT_STEP_STATUS_DONE,
  AGENT_STEP_STATUS_FAILED,
  AGENT_STEP_STATUS_RUNNING
} from '@/constants/databus-agent';
import { AGENT_RUN_STATUS } from '@/constants/databus';
import { DATABUS_CARD_ACTION_CANCEL } from '@/constants/databus-common';
import type { AiSession, AiSessionGroup } from './ai.types';
import type { AgentContextItem } from './contextTypes';
import { parseRefsText, refToContext } from './useAgentRefs';
import {
  activeConversationId,
  clearDraft,
  currentDraft,
  UNSAVED_CONVERSATION_KEY
} from './agentSession';

export type AgentChatRole = 'user' | 'assistant' | 'system';

/** 一次工具调用的轻量快照，仅供展开查看，不落库、不回放 */
export interface AgentStageItem {
  stepId: string;
  /** 工具标题（来自服务端工具元数据） */
  title: string;
  status: 'running' | 'done' | 'failed';
}

/**
 * 当前阶段：一条可变 segment，后续 step_start/step_end 就地更新，
 * 不做步骤列表、不落库、不回放。
 */
export interface AgentStageSegment {
  kind: 'stage';
  /** 当前步骤 id，用来把 step_end 对回同一条阶段行 */
  stepId: string;
  /** 当前工具标题（来自工具元数据） */
  title: string;
  status: 'running' | 'done' | 'failed';
  /** 已结束的步骤数（含失败） */
  completed: number;
  /** 其中失败的数量 */
  failed: number;
  /** 本次已发生的工具调用，展开时按顺序列出 */
  items: AgentStageItem[];
}

export type AgentSegment =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | AgentStageSegment
  | { kind: 'error'; error: AgentErrorInfo }
  | { kind: 'notice'; text: string; eventCode?: string }
  | { kind: 'card'; card: AgentCard; status: 'pending' | 'answered' | 'disabled'; picked?: string[]; cardText?: string };

export interface AgentChatMessage {
  id: string;
  role: AgentChatRole;
  segments: AgentSegment[];
  /** 用户消息携带的上下文附件（划字摘录 / 整件资源）；正文里不再拼等价的引用段 */
  contexts?: AgentContextItem[];
  /** 这条提问来自卡片点选时的回执；回退时据此把原卡片恢复成可点 */
  cardReply?: AgentCardReply;
  /** assistant 气泡状态 */
  status?: 'streaming' | 'done';
  /** 这一轮对应的后端 run 句柄（重试 / 删除 / 回退按轮定位用；未落库的本地消息为空） */
  runId?: string;
  /** 本轮追问建议：run 结束后异步生成，点一下直接作为下一问发送 */
  followUps?: string[];
}

/** 单个会话的全部前端状态 */
interface AgentSessionState {
  messages: AgentChatMessage[];
  running: boolean;
  /** 进行中的 run 句柄（停止时用） */
  runId: string;
  /** 正在流式累积的 assistant 消息 id */
  streamingId: string;
  /** 是否已拉过历史（切回来不重复请求） */
  loaded: boolean;
}

/** 旧的单例会话 key，迁移到多会话后仅在新 key 为空时读一次 */
const LEGACY_CONVERSATION_KEY = 'databus.agent.conversationId';

/** 当前激活会话 id（多会话切换只改这一个值）；草稿/引用按同一 key 归档 */
const activeId = activeConversationId;

migrateLegacyConversationId();

/** 会话桶：conversationId → 该会话的消息与运行态 */
const sessions = reactive<Record<string, AgentSessionState>>({});

/** SSE 连接按会话存（非响应式，避免 Proxy 包 EventSource） */
const streams = new Map<string, EventSource>();

/** 后端聚合出的会话列表（历史栏数据源） */
const remoteSessions = ref<AgentConversationVo[]>([]);

const EMPTY_MESSAGES: AgentChatMessage[] = [];

let idSeq = 0;
function nextId(): string {
  idSeq += 1;
  return `agent_${Date.now()}_${idSeq}`;
}

/** 旧 key 迁移：新 key 为空而旧单例非空时复制过来，避免刷新丢当前会话 */
function migrateLegacyConversationId() {
  if (activeId.value) {
    return;
  }
  try {
    const raw = window.localStorage.getItem(LEGACY_CONVERSATION_KEY);
    if (!raw) {
      return;
    }
    const legacy = JSON.parse(raw);
    if (typeof legacy === 'string' && legacy) {
      activeId.value = legacy;
    }
  } catch {
    /* 旧值读不出来就当没有 */
  }
}

/** 会话 id 必须满足后端白名单 ^[A-Za-z0-9_-]{8,64}$（UUID 带连字符也符合） */
function newConversationId(): string {
  // 内网 http 非安全上下文没有 crypto.randomUUID，退化成时间戳 + 随机串
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `conv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureSession(conversationId: string): AgentSessionState {
  if (!sessions[conversationId]) {
    sessions[conversationId] = {
      messages: [],
      running: false,
      runId: '',
      streamingId: '',
      loaded: false
    };
  }
  // 必须返回响应式代理：首建时返回裸对象，直接改它不会触发 computed / 模板更新
  // （刷新后 restore 写回历史消息就是这条路径，表现为「拉到了但瀑布流不显示」）
  return sessions[conversationId];
}

/** 同类型的相邻段就地合并，避免流式时碎成一堆节点（卡片不参与合并） */
function appendSegment(
  message: AgentChatMessage,
  segment: Extract<AgentSegment, { kind: 'text' | 'thinking' }>
) {
  const last = message.segments[message.segments.length - 1];
  if (last && last.kind === segment.kind && (last.kind === 'text' || last.kind === 'thinking')) {
    last.text += segment.text;
    return;
  }
  message.segments.push(segment);
}

export function textOf(message: AgentChatMessage): string {
  return message.segments
    .filter((s): s is Extract<AgentSegment, { kind: 'text' }> => s.kind === 'text')
    .map((s) => s.text)
    .join('');
}

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** 该会话正在流式累积的 assistant 消息 */
function streamingMessage(state: AgentSessionState): AgentChatMessage | undefined {
  return state.messages.find((m) => m.id === state.streamingId);
}

/** 关掉某会话的 SSE：只动连接与该会话的 run 句柄，不影响其它会话 */
function closeStream(conversationId: string) {
  const es = streams.get(conversationId);
  if (es) {
    es.close();
    streams.delete(conversationId);
  }
  const state = sessions[conversationId];
  if (state) {
    state.runId = '';
    state.streamingId = '';
  }
}

function pushSystem(conversationId: string, content: string, eventCode?: string) {
  const state = ensureSession(conversationId);
  state.messages.push({
    id: nextId(),
    role: 'system',
    segments: [{ kind: 'notice', text: content, eventCode }]
  });
}

/** 错误信封 → 用户可见的一行提示（附带日志关联编号，前端不做错误码映射） */
function errorNoticeText(error: { message: string; referenceId?: string }): string {
  return error.referenceId
    ? `${error.message}（${i18n.global.t('ai.error.reference', { ref: error.referenceId })}）`
    : error.message;
}

/**
 * 收尾失败：错误作为 AI 消息里的一个 `error` 段，不再另起系统告警行。
 * 只接收后端下发的错误信封（或一句本地兜底文案），原始异常永远不会走到这里。
 */
function failStreaming(conversationId: string, error: AgentErrorInfo | string) {
  const state = ensureSession(conversationId);
  const notice: AgentErrorInfo = typeof error === 'string'
    ? { code: 'UNKNOWN', category: 'unknown', retryable: false, message: error }
    : error;
  const target = streamingMessage(state);
  if (target) {
    interruptStage(target);
    target.segments.push({ kind: 'error', error: notice });
    target.status = 'done';
  } else {
    // 异常路径兜底：没有当前消息时才退回系统行
    pushSystem(conversationId, errorNoticeText(notice), 'error');
  }
  closeStream(conversationId);
  state.running = false;
}

/** 卡片到达：挂到本轮 assistant 消息末尾，等用户点选 */
function handleCard(conversationId: string, card: AgentCard | null | undefined) {
  const state = sessions[conversationId];
  if (!state || !card?.cardId) {
    return;
  }
  const target = streamingMessage(state);
  if (!target) {
    return;
  }
  target.segments.push({ kind: 'card', card, status: 'pending' });
}

/**
 * 阶段到达：一条消息只维护一条 stage 段。
 * step_start 替换标题并置为运行中；step_end 累计完成/失败数，不再追加新行。
 * 明细只记在 stage.items 里，供用户展开回看，不落库、刷新后不恢复。
 */
function handleStage(conversationId: string, step: AgentStepInfo | null | undefined) {
  const state = sessions[conversationId];
  if (!state || !step?.stepId) {
    return;
  }
  const target = streamingMessage(state);
  if (!target) {
    return;
  }
  const stage = target.segments.find((s): s is AgentStageSegment => s.kind === 'stage');
  if (step.status === AGENT_STEP_STATUS_RUNNING) {
    if (stage) {
      stage.stepId = step.stepId;
      stage.title = step.title;
      stage.status = AGENT_STEP_STATUS_RUNNING;
      stage.items.push({ stepId: step.stepId, title: step.title, status: AGENT_STEP_STATUS_RUNNING });
    } else {
      target.segments.push({
        kind: 'stage',
        stepId: step.stepId,
        title: step.title,
        status: AGENT_STEP_STATUS_RUNNING,
        completed: 0,
        failed: 0,
        items: [{ stepId: step.stepId, title: step.title, status: AGENT_STEP_STATUS_RUNNING }]
      });
    }
    return;
  }
  if (!stage || stage.stepId !== step.stepId) {
    return;
  }
  const failed = step.status === AGENT_STEP_STATUS_FAILED;
  stage.completed += 1;
  if (failed) {
    stage.failed += 1;
  }
  stage.status = failed ? AGENT_STEP_STATUS_FAILED : AGENT_STEP_STATUS_DONE;
  const item = stage.items.find((i) => i.stepId === step.stepId);
  if (item) {
    item.status = stage.status;
  }
}

/** 流被中止（用户停止 / 连接断开）：运行中的阶段标成失败，避免一直扫光 */
function interruptStage(message: AgentChatMessage) {
  const stage = message.segments.find((s): s is AgentStageSegment => s.kind === 'stage');
  if (!stage || stage.status !== AGENT_STEP_STATUS_RUNNING) {
    return;
  }
  stage.completed += 1;
  stage.failed += 1;
  stage.status = AGENT_STEP_STATUS_FAILED;
  const item = stage.items.find((i) => i.stepId === stage.stepId);
  if (item) {
    item.status = AGENT_STEP_STATUS_FAILED;
  }
}

/** 新一轮开始：上一轮没点的卡一律失效，避免点开还在等旧 run */
function disablePendingCards(state: AgentSessionState) {
  for (const message of state.messages) {
    for (const seg of message.segments) {
      if (seg.kind === 'card' && seg.status === 'pending') {
        seg.status = 'disabled';
      }
    }
  }
}

/** 找指定卡片段（cardId 在 run 内唯一） */
function findCardSegment(state: AgentSessionState, cardId: string) {
  for (const message of state.messages) {
    for (const seg of message.segments) {
      if (seg.kind === 'card' && seg.card.cardId === cardId) {
        return seg;
      }
    }
  }
  return undefined;
}

/**
 * 流式增量批处理。
 *
 * SSE 每个 chunk 直接改响应式状态的话，渲染、Markdown 解析、贴底滚动都会按 token 频率跑，
 * 既浪费也让滚动看起来在「抢」。这里把同一会话同一类型的增量攒到下一帧再落一次，
 * 落库口径不变：done 仍以服务端 fullText 整体替换。
 */
interface PendingDelta {
  conversationId: string;
  kind: 'text' | 'thinking';
  text: string;
}

const pendingDeltas = new Map<string, PendingDelta>();
let flushFrame = 0;

function flushDeltas() {
  if (flushFrame) {
    cancelAnimationFrame(flushFrame);
    flushFrame = 0;
  }
  if (!pendingDeltas.size) {
    return;
  }
  const batch = [...pendingDeltas.values()];
  pendingDeltas.clear();
  for (const delta of batch) {
    const state = sessions[delta.conversationId];
    const target = state ? streamingMessage(state) : undefined;
    if (target) {
      appendSegment(target, { kind: delta.kind, text: delta.text });
    }
  }
}

function queueDelta(conversationId: string, kind: 'text' | 'thinking', text: string) {
  const key = `${conversationId}|${kind}`;
  const pending = pendingDeltas.get(key);
  if (pending) {
    pending.text += text;
  } else {
    pendingDeltas.set(key, { conversationId, kind, text });
  }
  if (!flushFrame) {
    flushFrame = requestAnimationFrame(() => {
      flushFrame = 0;
      flushDeltas();
    });
  }
}

/** 流事件全部按会话定位，不依赖全局 streamingId */
function handleEvent(conversationId: string, type: string, data: string) {
  const state = sessions[conversationId];
  if (!state) {
    return;
  }
  const target = streamingMessage(state);
  switch (type) {
    case AGENT_SSE_TEXT:
      if (target && data) {
        queueDelta(conversationId, 'text', data);
      }
      break;
    case AGENT_SSE_THINKING:
      // 空分片不建段，否则会留一个没有内容的「思考」壳
      if (target && data.trim()) {
        queueDelta(conversationId, 'thinking', data);
      }
      break;
    case AGENT_SSE_DONE: {
      // 先把攒着的正文落地，done 的 fullText 随后整体替换，保证不丢最后一批
      flushDeltas();
      const done = parseJson<{ conversationId?: string; fullText?: string }>(data);
      if (target) {
        // done 的 data 就是整轮最终正文（JSON 取 fullText，纯文本直接用 raw）。
        // 用它整体替换流式碎片段，保证气泡里的文字与落库的 report 同源，
        // 刷新回放时不会出现「流式看到的」和「历史拉回来的」两份不同文本。
        const finalText = (done ? (done.fullText ?? '') : data).trim();
        if (finalText) {
          // 卡片是这一轮的暂停点，不能被收口正文冲掉：思考 / 阶段 → 正文 → 卡片
          const cards = target.segments.filter((s) => s.kind === 'card');
          target.segments = [
            ...target.segments.filter((s) => s.kind === 'thinking' || s.kind === 'stage' || s.kind === 'error'),
            { kind: 'text', text: finalText },
            ...cards
          ];
        }
        target.status = 'done';
      }
      // 连接不在这里关：服务端推完 done 还要生成并推送追问建议，推完才关闭
      state.running = false;
      void refreshSessions();
      break;
    }
    case AGENT_SSE_ERROR: {
      // 半截正文也是用户已经看到的，先落地再挂错误
      flushDeltas();
      const err = parseJson<AgentErrorInfo>(data);
      failStreaming(conversationId, err ?? 'AI 服务异常，请稍后重试');
      break;
    }
    default:
      break;
  }
}

/**
 * 会话标题到达：服务端在 run 开始时只依据用户问题生成，生成完即时推送。
 * 按 conversationId 定位，用户可能已经切走，不能改「当前项」。
 */
function handleTitle(conversationId: string, payload: { title?: string } | null | undefined) {
  const title = payload?.title?.trim();
  if (!title) {
    return;
  }
  const session = remoteSessions.value.find((item) => item.conversationId === conversationId);
  if (session) {
    if (session.title !== title) {
      session.title = title;
    }
  } else {
    // 新会话还没进列表（首次 refresh 可能早于标题生成），补拉一次让标题跟上
    void refreshSessions();
  }
}

/**
 * 追问建议到达：挂到本轮 AI 消息下方。
 * 服务端推完这条才关闭连接，所以不需要再补拉。
 */
function handleFollowUps(conversationId: string, payload: string[] | null | undefined) {
  const state = sessions[conversationId];
  const items = (payload ?? []).map((item) => item.trim()).filter(Boolean);
  if (!items.length) {
    return;
  }
  const list = state?.messages ?? [];
  // 从后往前找本轮 AI 消息：用户可能已经又发了一轮，不能用「最后一条」
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i];
    if (item.role === 'assistant' && (!state?.runId || item.runId === state.runId)) {
      item.followUps = items;
      break;
    }
  }
}

function openStream(conversationId: string, runId: string) {
  const prev = streams.get(conversationId);
  if (prev) {
    prev.close();
  }
  ensureSession(conversationId).runId = runId;
  const es = new EventSource(buildAgentStreamUrl(runId));
  streams.set(conversationId, es);
  es.onmessage = (event) => {
    if (streams.get(conversationId) !== es) {
      return;
    }
    const payload = parseJson<{ type?: string; data?: unknown }>(event.data);
    if (!payload) {
      return;
    }
    const type = payload.type ?? '';
    if (type === AGENT_SSE_CARD) {
      handleCard(conversationId, payload.data as AgentCard);
      return;
    }
    if (type === AGENT_SSE_STEP_START || type === AGENT_SSE_STEP_END) {
      handleStage(conversationId, payload.data as AgentStepInfo);
      return;
    }
    if (type === AGENT_SSE_TITLE) {
      handleTitle(conversationId, payload.data as { title?: string });
      return;
    }
    if (type === AGENT_SSE_FOLLOW_UPS) {
      handleFollowUps(conversationId, payload.data as string[]);
      return;
    }
    handleEvent(conversationId, type, typeof payload.data === 'string' ? payload.data : '');
  };
  es.onerror = () => {
    // done / error 后由本端主动 close，此时连接已不是这条，直接忽略
    if (streams.get(conversationId) !== es) {
      return;
    }
    // 服务端推完 done 和追问建议后主动关闭连接，EventSource 一律按 error 回调：
    // 这时本轮已结束，本地关掉即可，不能当成断线，也不能让它自动重连
    if (!sessions[conversationId]?.running) {
      closeStream(conversationId);
      return;
    }
    failStreaming(conversationId, '连接已断开，请重试');
  };
}

/** 后端 attachments 是 JSON 字符串；解析失败返回 null，交给正文兜底，不打断历史恢复 */
function parseAttachments(raw?: string): AgentContextItem[] | null {
  if (!raw) {
    return null;
  }
  const parsed = parseJson<unknown>(raw);
  if (!Array.isArray(parsed)) {
    return null;
  }
  return parsed.filter(
    (item): item is AgentContextItem =>
      !!item && typeof item === 'object' && typeof (item as AgentContextItem).fingerprint === 'string'
  );
}

/**
 * 服务端已不再返回该会话（被删或没有可见轮次）时清掉本地桶与持久化的 activeId，
 * 避免刷新后停在一条已删会话上、又被当成新会话继续提问。
 *
 * @param conversationId 会话 id
 */
function dropIfGone(conversationId: string, state: AgentSessionState) {
  // 拉历史期间用户可能已经开问：有本地消息或正在跑就说明会话仍在用，不能清
  if (state.running || state.messages.some((m) => m.role === 'user')) {
    return;
  }
  delete sessions[conversationId];
  if (activeId.value === conversationId) {
    activeId.value = '';
  }
}

/**
 * 发一句话：本地先定会话 id，把用户气泡与流式 assistant 气泡写进该会话桶，再建 run 拉流。
 *
 * @param content    用户原话（卡片点选时是选项文案；系统事件发起时为空）
 * @param contexts   上下文暂存区（划字摘录 + 整件资源），与正文分开走 attachments
 * @param cardReply  卡片回执：点了哪张卡的哪一项，由后端校验后才认 userConfirmed
 * @param systemEvent 系统事件：用户界面之外发生的事实，只上报 code + payload，文案由后端生成
 */
async function send(content: string, contexts?: AgentContextItem[], cardReply?: AgentCardReply, systemEvent?: AgentSystemEvent) {
  const text = content.trim();
  const contextList = contexts ?? [];
  if (!text && !contextList.length && !systemEvent) {
    return;
  }
  const previous = activeId.value;
  const conversationId = previous || newConversationId();
  activeId.value = conversationId;
  if (!previous) {
    // 空白态发出的首条消息：草稿已随发送消费掉，占位槽一起清掉
    clearDraft(UNSAVED_CONVERSATION_KEY);
  }
  const state = ensureSession(conversationId);
  if (state.running) {
    return;
  }
  disablePendingCards(state);
  state.loaded = true;
  const question: AgentChatMessage = {
    id: nextId(),
    role: 'user',
    segments: text ? [{ kind: 'text', text }] : [],
    contexts: contextList.length ? contextList : undefined,
    cardReply
  };
  state.messages.push(question);
  const assistant: AgentChatMessage = {
    id: nextId(),
    role: 'assistant',
    segments: [],
    status: 'streaming'
  };
  state.streamingId = assistant.id;
  state.messages.push(assistant);
  state.running = true;
  try {
    // 正文只放用户敲的字；引用与摘录全部走 attachments，后端拼接时不会污染气泡
    const attachments = contextList;
    const { data } = await startAgentChat({
      content: text,
      conversationId,
      cardReply,
      attachments: attachments.length ? attachments : undefined,
      systemEvent
    });
    if (!data?.runId) {
      failStreaming(conversationId, '发起对话失败，请稍后重试');
      return;
    }
    // 卡片回执：气泡文案以服务端随回执落库的那句为准，覆盖点选时的本地乐观文案
    if (cardReply && data.display) {
      question.segments = [{ kind: 'text', text: data.display }];
    } else if (!text && data.intent) {
      // 事件发起时本地没有正文：气泡文案用后端目录生成的那句，前端不维护业务中文
      question.segments = [{ kind: 'text', text: data.intent }];
    }
    // 两条气泡都挂上 run：工具栏按轮重试 / 删除 / 回退都靠它定位
    question.runId = data.runId;
    assistant.runId = data.runId;
    // 后端若解析出不同的会话 id，整桶迁过去，后续按最终 id 收流
    const runConversationId = data.conversationId || conversationId;
    if (runConversationId !== conversationId) {
      sessions[runConversationId] = state;
      delete sessions[conversationId];
      if (activeId.value === conversationId) {
        activeId.value = runConversationId;
      }
    }
    openStream(runConversationId, data.runId);
    void refreshSessions();
  } catch {
    failStreaming(conversationId, '发起对话失败，请稍后重试');
  }
}

/**
 * 停止当前会话的 run：先本地收尾（保住已收到的文字），再通知后端把 run 置 STOPPED。
 * 其它会话正在跑的 run 不受影响。
 */
async function stop() {
  const conversationId = activeId.value;
  if (!conversationId) {
    return;
  }
  const state = ensureSession(conversationId);
  const runId = state.runId;
  flushDeltas();
  const target = streamingMessage(state);
  if (target) {
    interruptStage(target);
    if (!textOf(target)) {
      target.segments.push({ kind: 'text', text: '已停止' });
    }
    target.status = 'done';
  }
  closeStream(conversationId);
  state.running = false;
  if (runId) {
    try {
      await stopAgentRun(runId);
    } catch {
      /* run 可能已自然结束，忽略 */
    }
  }
  void refreshSessions();
}

/** 一轮对话在消息列表里的位置：以提问为锚点，回复是紧随其后的 assistant */
interface AgentTurn {
  question: AgentChatMessage;
  questionIndex: number;
  reply?: AgentChatMessage;
}

/** 按消息 id 定位它所属的一轮：AI 消息向前找提问，用户消息本身就是锚点 */
function locateTurn(state: AgentSessionState, messageId: string): AgentTurn | null {
  const index = state.messages.findIndex((m) => m.id === messageId);
  if (index < 0) {
    return null;
  }
  const message = state.messages[index];
  const questionIndex = message.role === 'user' ? index : index - 1;
  const question = state.messages[questionIndex];
  if (!question || question.role !== 'user') {
    return null;
  }
  const next = state.messages[questionIndex + 1];
  return {
    question,
    questionIndex,
    reply: next?.role === 'assistant' ? next : undefined
  };
}

/** 当前会话里定位一轮；运行中不允许删改历史 */
function resolveTurn(messageId: string): { state: AgentSessionState; turn: AgentTurn } | null {
  const conversationId = activeId.value;
  const state = conversationId ? sessions[conversationId] : undefined;
  if (!state || state.running) {
    return null;
  }
  const turn = locateTurn(state, messageId);
  return turn ? { state, turn } : null;
}

/**
 * 删除一轮对话：后端逻辑删除该 run，本地把提问与紧随的回复一起拿掉。
 *
 * @param messageId 这一轮里任意一条消息 id
 */
async function removeTurn(messageId: string) {
  const conversationId = activeId.value;
  const resolved = resolveTurn(messageId);
  if (!resolved) {
    return;
  }
  const { state, turn } = resolved;
  if (turn.question.runId) {
    await deleteAgentRun(turn.question.runId);
  }
  const drop = new Set([turn.question.id]);
  if (turn.reply) {
    drop.add(turn.reply.id);
  }
  state.messages = state.messages.filter((m) => !drop.has(m.id));
  await pruneEmptySession(conversationId);
}

/**
 * 会话被删空后的收尾：服务端已不再返回这个会话时，本地桶也要丢弃，
 * 避免切回该 id 时还能看到已经删掉的历史。
 *
 * @param conversationId 会话 id
 */
async function pruneEmptySession(conversationId: string) {
  if (!conversationId) {
    return;
  }
  await refreshSessions();
  if (remoteSessions.value.some((item) => item.conversationId === conversationId)) {
    return;
  }
  const state = sessions[conversationId];
  if (!state || state.messages.some((m) => m.role === 'user')) {
    return;
  }
  delete sessions[conversationId];
  if (activeId.value === conversationId) {
    activeId.value = '';
  }
}

/**
 * 回退到本轮对话发起前：撤销该轮及之后各轮的链路改动，本地同步截断消息。
 *
 * @param messageId 这一轮里任意一条消息 id
 * @return 被回滚的链路（deleted=true 表示整条已删除）
 */
async function revertTurn(messageId: string): Promise<{ chainId: number | string; deleted: boolean }[]> {
  const conversationId = activeId.value;
  const resolved = resolveTurn(messageId);
  if (!resolved) {
    return [];
  }
  const { state, turn } = resolved;
  const runId = turn.question.runId;
  if (!runId) {
    throw new Error('这一轮还没有落库，无法回退');
  }
  const { data } = await revertAgentRun(runId);
  state.messages = state.messages.slice(0, turn.questionIndex);
  // 这条提问若是点卡片发出的，把原卡片恢复成待点：否则用户重发时缺 cardReply，后端不认
  const cardReply = turn.question.cardReply;
  if (cardReply) {
    const segment = findCardSegment(state, cardReply.cardId);
    if (segment && segment.status !== 'pending') {
      segment.status = 'pending';
      segment.picked = undefined;
      segment.cardText = undefined;
    }
  }
  await pruneEmptySession(conversationId);
  return data ?? [];
}

/**
 * 原地重试一条 AI 回复：后端隐藏旧 run 并沿用原问题重建，前端只重置这一条回复。
 * 只允许重试最后一轮，否则新一轮会排到历史末尾、与看到的顺序错位。
 *
 * @param messageId 要重试的 assistant 消息 id
 */
async function retryReply(messageId: string) {
  const conversationId = activeId.value;
  const resolved = resolveTurn(messageId);
  if (!conversationId || !resolved) {
    return;
  }
  const { state, turn } = resolved;
  const { question, reply } = turn;
  if (!reply || !question.runId) {
    throw new Error('这一轮还没有落库，无法重试');
  }
  const hasLaterTurn = state.messages.slice(turn.questionIndex + 2).some((m) => m.role !== 'system');
  if (hasLaterTurn) {
    throw new Error('只能重试最后一轮回复');
  }
  const { data } = await retryAgentRun(question.runId);
  if (!data?.runId) {
    throw new Error('重试失败，请稍后重试');
  }
  question.runId = data.runId;
  reply.runId = data.runId;
  reply.segments = [];
  reply.status = 'streaming';
  state.streamingId = reply.id;
  state.running = true;
  openStream(conversationId, data.runId);
  void refreshSessions();
}

/**
 * 新建会话 = 把侧边栏切到空白流：不建会话桶、不落 id、不进历史栏，
 * 首条消息发出时才生成真实 conversationId。
 */
function createSession(): string {
  // 空白态自身携带的草稿也一并清掉，保证每次点新建都是干净的空状态
  clearDraft(UNSAVED_CONVERSATION_KEY);
  activeId.value = '';
  return '';
}

/** 面板 defineExpose 对外暴露的新建入口 */
const newSession = createSession;

/** 切换会话：切过去按需拉历史（已加载的会话不重复请求） */
function switchSession(conversationId: string) {
  if (!conversationId) {
    return;
  }
  ensureSession(conversationId);
  activeId.value = conversationId;
  void restore(conversationId);
}

/**
 * 追加一条系统行（侧栏收到 databus:agent:* 推送时展示）。
 *
 * @param content        人类可读文案
 * @param eventCode      事件编码
 * @param conversationId 目标会话，缺省写当前会话
 */
function appendSystem(content: string, eventCode?: string, conversationId?: string) {
  const target = conversationId || activeId.value;
  if (!target) {
    return;
  }
  pushSystem(target, content, eventCode);
}

/** done 事件落库的 report 是 `{conversationId, fullText}` JSON，回放时取其中的正文 */
function reportText(report?: string): string {
  if (!report) {
    return '';
  }
  const parsed = parseJson<{ fullText?: string }>(report);
  return (typeof parsed?.fullText === 'string' ? parsed.fullText : report).trim();
}

/** 历史回执（旧数据只有 action，新数据是 actions + text） */
type StoredCardReply = Partial<AgentCardReply> & { action?: string };

/**
 * 回执归一：兼容旧 action 字段，空选择且无输入时视为无回执。
 *
 * @param raw 已解析的回执 JSON
 * @returns 归一后的回执；无效返回 null
 */
function normalizeCardReply(raw?: StoredCardReply | null): AgentCardReply | null {
  if (!raw?.cardId) {
    return null;
  }
  const actions = raw.actions?.length ? raw.actions : raw.action ? [raw.action] : [];
  const text = raw.text?.trim() || undefined;
  if (!actions.length && !text) {
    return null;
  }
  return { cardId: raw.cardId, actions, text, display: raw.display };
}

/**
 * 老回执的兜底翻译：这些记录落库时还没有 display 字段，只能按原卡片选项反推文案。
 * 新记录一律直接读 reply.display。
 */
function cardReplyLabel(card: AgentCard | undefined, reply: AgentCardReply): string | undefined {
  const actions = reply.actions ?? [];
  if (actions.length === 1 && actions[0] === DATABUS_CARD_ACTION_CANCEL) {
    return '取消这次选择';
  }
  const labels = actions
    .map((key) => card?.options?.find((option) => option.key === key)?.label ?? key)
    .filter(Boolean);
  const parts: string[] = [];
  if (labels.length) {
    // 单选就是那一个选项文案；多选沿用提交时的「已选「A、B」」
    parts.push(labels.length > 1 ? `已选「${labels.join('、')}」` : labels[0]);
  }
  if (reply.text) {
    parts.push(reply.text);
  }
  return parts.join('；') || undefined;
}

/**
 * 刷新后恢复：先按会话把后端已落库的历史轮次拉回来重建消息，再问一句有没有还在跑的 run。
 *
 * 历史来自 `databus_agent_run` 的 intent + report（一问一答），不重放 SSE 事件；
 * 旧 SSE 连接已随刷新断开，若查到 RUNNING 只在该会话里提示「其它页面正在进行」，
 * 绝不擅自停掉它（可能正被另一个标签页使用）。
 */
async function restore(conversationId?: string) {
  const id = conversationId || activeId.value;
  if (!id) {
    return;
  }
  const state = ensureSession(id);
  if (state.running || state.loaded) {
    return;
  }
  try {
    const { data } = await listAgentHistory(id);
    const restored: AgentChatMessage[] = [];
    const runs = data ?? [];
    // 回放完仍是零轮次：会话已被删（或轮次全被删/回退），清掉本地态；
    // 注意这里不能用列表接口反查——它受搜索关键字影响，会误判
    if (!runs.length) {
      dropIfGone(id, state);
      return;
    }
    // 回执落在点选后新建的 run 上，先按 cardId 汇总，才能把「选了哪项」贴回原卡片
    const replies = new Map<string, AgentCardReply>();
    /** 卡片本体也按 cardId 收一份：只有老回执缺 display 时才需要它来翻译文案 */
    const cards = new Map<string, AgentCard>();
    for (const run of runs) {
      for (const raw of run.cards ?? []) {
        const card = parseJson<AgentCard>(raw);
        if (card?.cardId) {
          cards.set(card.cardId, card);
        }
      }
      for (const raw of run.cardReplies ?? []) {
        const reply = normalizeCardReply(parseJson<StoredCardReply>(raw));
        if (reply) {
          replies.set(reply.cardId, reply);
        }
      }
    }
    runs.forEach((run, index) => {
      const intent = (run.intent ?? '').trim();
      // 新 run：正文就是用户原话，附件单独在 attachments 里；
      // 老 run 没有 attachments，才需要从正文尾部拆「【引用】」段还原引用卡
      const stored = parseAttachments(run.attachments);
      let text = intent;
      let contexts: AgentContextItem[] = [];
      if (stored) {
        contexts = stored;
      } else {
        // 老 run 只有正文：把尾部「【引用】」段还原成资源附件，避免退化成一段文字
        const parsed = parseRefsText(intent);
        text = parsed.text;
        contexts = parsed.refs.map(refToContext);
      }
      // 该 run 若由点卡发起，回执记在它身上；带上才能在刷新后回退时把原卡片恢复成可点
      const ownReply = (run.cardReplies ?? [])
        .map((raw) => normalizeCardReply(parseJson<StoredCardReply>(raw)))
        .find((reply): reply is AgentCardReply => !!reply);
      // 点卡发起的轮次：气泡显示选项文案（取消 / 确认执行 / A、B），
      // intent 里「【卡片回执】用户已在卡片上选择…（cardId=…）」是给模型看的，不能原样上屏
      if (ownReply) {
        // 优先用服务端随回执一起落库的展示文案；老数据没有 display 时才按选项翻译兜底
        const label = ownReply.display ?? cardReplyLabel(cards.get(ownReply.cardId), ownReply);
        // 卡片本体也拉不到时至少剥掉回执措辞，绝不把 cardId 露给用户
        text = label ?? text.replace(/【卡片回执】[^。]*。/g, '').trim();
      }
      // 只有附件没有正文的轮次也要还原，否则刷新后丢卡片
      if (!text && !contexts.length) {
        return;
      }
      restored.push({
        id: nextId(),
        role: 'user',
        segments: text ? [{ kind: 'text', text }] : [],
        contexts: contexts.length ? contexts : undefined,
        cardReply: ownReply,
        runId: run.runId
      });
      const answer = reportText(run.report);
      const segments: AgentSegment[] = [];
      if (answer) {
        segments.push({ kind: 'text', text: answer });
      }
      // 卡片不在内存里就靠这一步还原：已回执的标「已选」，只有最新一轮未回执的卡可点，其余置灰
      const latest = index === runs.length - 1 && run.status !== AGENT_RUN_STATUS.RUNNING;
      for (const raw of run.cards ?? []) {
        const card = parseJson<AgentCard>(raw);
        if (!card?.cardId) {
          continue;
        }
        const picked = replies.get(card.cardId);
        segments.push({
          kind: 'card',
          card,
          status: picked ? 'answered' : latest ? 'pending' : 'disabled',
          picked: picked?.actions,
          cardText: picked?.text
        });
      }
      // 错误回放成 AI 消息里的 error 段；原始异常不在历史里，刷新后仍是同一句人话 + 编号
      for (const raw of run.errors ?? []) {
        const err = parseJson<AgentErrorInfo>(raw);
        if (err?.message) {
          segments.push({ kind: 'error', error: err });
        }
      }
      if (segments.length) {
        const followUps = (run.followUps ?? []).map((item) => item.trim()).filter(Boolean);
        restored.push({
          id: nextId(),
          role: 'assistant',
          segments,
          status: 'done',
          runId: run.runId,
          followUps: followUps.length ? followUps : undefined
        });
      }
    });
    // 拉历史期间用户可能已经开问，此时以新消息为准，不能把刚才的对话覆盖掉
    if (restored.length && !state.running && !state.messages.length) {
      state.messages = restored;
    }
  } catch {
    /* 拉不到历史就按新会话处理，不影响继续提问 */
  }
  state.loaded = true;
  try {
    const { data } = await getActiveAgentRun(id);
    if (data?.runId) {
      pushSystem(id, '这个会话正在其它页面进行中（多标签页只支持一条对话流）。', 'agent:busy');
    }
  } catch {
    /* 查不到就当没有，不影响继续提问 */
  }
}

/** 搜索关键字（空串=普通列表），历史栏搜索框通过 searchSessions 写入 */
const searchKeyword = ref('');

/** 防并发：快速输入时只认最后一次请求的结果 */
let loadSeq = 0;

/**
 * 拉会话列表（历史栏数据源）：有关键字走搜索接口，否则走普通列表。
 * 失败就沿用本地已有的会话桶，不影响提问。
 */
async function refreshSessions() {
  const seq = ++loadSeq;
  try {
    const keyword = searchKeyword.value.trim();
    const { data } = keyword
      ? await searchAgentConversations(keyword, 50)
      : await listAgentConversations(50);
    if (seq === loadSeq) {
      remoteSessions.value = data ?? [];
    }
  } catch {
    /* 拉不到就用本地态，不影响提问 */
  }
}

/**
 * 搜会话：关键字空串即退出搜索，回到完整列表。
 *
 * @param keyword 关键字
 */
async function searchSessions(keyword: string) {
  searchKeyword.value = keyword.trim();
  await refreshSessions();
}

/**
 * 重命名会话（只改显示标题，历史问句不动），成功后按当前列表模式刷新。
 *
 * @param conversationId 会话 id
 * @param title          新标题
 */
async function renameSession(conversationId: string, title: string) {
  await renameAgentConversation(conversationId, title.trim());
  await refreshSessions();
}

/**
 * 置顶 / 取消置顶，排序由后端统一给出。
 *
 * @param conversationId 会话 id
 * @param pinned         true 置顶
 */
async function pinSession(conversationId: string, pinned: boolean) {
  await pinAgentConversation(conversationId, pinned);
  await refreshSessions();
}

/**
 * 删除会话：只删服务端覆盖信息，run / step / message 保留；
 * 本地桶与 SSE 一并清掉，删的若是当前会话就回到空态（下次提问自动新开）。
 *
 * @param conversationId 会话 id
 */
async function removeSession(conversationId: string) {
  await deleteAgentConversation(conversationId);
  closeStream(conversationId);
  delete sessions[conversationId];
  if (activeId.value === conversationId) {
    activeId.value = '';
  }
  await refreshSessions();
  offerUndoRemove(conversationId);
}

/**
 * 删除后的反悔窗口：软删只是把会话从列表摘掉，撤销即复位标记，历史一条不少。
 * 用带「撤销」链接的轻提示，不弹模态框，不打断正在跑的其它会话。
 *
 * @param conversationId 刚被删掉的会话 id
 */
function offerUndoRemove(conversationId: string) {
  ElMessage({
    message: h('span', null, [
      '会话已删除',
      h(
        'a',
        {
          style: 'margin-left:8px;color:var(--el-color-primary);cursor:pointer',
          onClick: () => {
            ElMessage.closeAll();
            void undoRemoveSession(conversationId);
          }
        },
        '撤销'
      )
    ]),
    type: 'success',
    duration: 6000
  });
}

/** 撤销删除：复位软删标记后重新拉列表，会话按原活跃时间回到原位 */
async function undoRemoveSession(conversationId: string) {
  try {
    await restoreAgentConversation(conversationId);
    await refreshSessions();
  } catch {
    ElMessage.error('撤销失败，请刷新后重试');
  }
}

/**
 * 会话列表展示时间：24 小时内给相对时间，再往前给「昨天」/月-日，跨年补全年份。
 * 决策依据是大厂会话列表的通行做法——最近的在用分钟级，久远的不再报分钟。
 */
function formatRelativeTime(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const time = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(time.getTime())) {
    return undefined;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  const now = new Date();
  const diff = now.getTime() - time.getTime();
  if (diff < 60_000) {
    return '刚刚';
  }
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)} 分钟前`;
  }
  if (time.toDateString() === now.toDateString()) {
    return `${Math.floor(diff / 3_600_000)} 小时前`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (time.toDateString() === yesterday.toDateString()) {
    return '昨天';
  }
  if (time.getFullYear() === now.getFullYear()) {
    return `${time.getMonth() + 1}-${pad(time.getDate())}`;
  }
  return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`;
}

/**
 * 卡片点选：把该卡置为已答并回传 cardReply，后端据此认 userConfirmed。
 *
 * @param cardId  卡片 id
 * @param actions 选中的动作键集合：单选一项，多选多项；只填自由输入时为空数组
 * @param label   点选瞬间的乐观文案；服务端返回 display 后会覆盖成库里那句
 * @param text    自由输入内容，仅 allowFreeText 卡片传
 */
async function answerCard(cardId: string, actions: string[], label: string, text?: string) {
  const id = activeId.value;
  if (!id) {
    return;
  }
  const state = sessions[id];
  if (!state || state.running) {
    return;
  }
  const segment = findCardSegment(state, cardId);
  if (!segment || segment.status !== 'pending') {
    return;
  }
  segment.status = 'answered';
  segment.picked = actions;
  segment.cardText = text;
  await send(label || segment.card.title, undefined, { cardId, actions, text });
}

/** 后端会话摘要 → 历史栏行（时间在这里格式化，组件只渲染） */
function remoteSessionItem(item: AgentConversationVo): AiSession {
  const running = !!item.running || !!sessions[item.conversationId]?.running;
  return {
    id: item.conversationId,
    title: item.title?.trim() || '未命名任务',
    time: formatRelativeTime(item.lastTime),
    lastActiveAt: item.lastTime,
    running,
    status: running ? 'running' : 'finished',
    pinned: !!item.pinned,
    workspaceId: item.workspaceId ?? null
  };
}

const conversationId = computed(() => activeId.value);

const messages = computed<AgentChatMessage[]>(() => {
  const id = activeId.value;
  return id && sessions[id] ? sessions[id].messages : EMPTY_MESSAGES;
});

const running = computed(() => {
  const id = activeId.value;
  return !!(id && sessions[id]?.running);
});

/**
 * 历史栏列表：只认服务端会话列表。
 * 本地会话桶（sessions）只服务当前对话的渲染，不能拿来补历史——
 * 否则会话在别处被删后，本地还有消息的桶会被当成「新会话」重新插回列表。
 */
const sessionList = computed<AiSession[]>(() => remoteSessions.value.map(remoteSessionItem));

const DEFAULT_WORKSPACE_KEY = 'default';
const DEFAULT_WORKSPACE_NAME = '默认工作区';

/** 工作区展示名：本轮只有默认工作区，自定义工作区后续接入后换成真实名称 */
function workspaceName(workspaceId?: number | string | null): string {
  return workspaceId == null || workspaceId === ''
    ? DEFAULT_WORKSPACE_NAME
    : `工作区 ${workspaceId}`;
}

/** 分组排序键：没有时间戳的（本地新会话）视为最新，其余按时间倒序 */
function groupSortKey(group: AiSessionGroup): number {
  if (!group.latest) {
    return Number.MAX_SAFE_INTEGER;
  }
  const time = new Date(group.latest.replace(' ', 'T')).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * 历史栏分组视图：按工作区分组，组内保持后端排序（置顶优先 + 最近活跃），组间按组内最新活跃倒序。
 * 列表视图直接用 sessionList，不分组。
 */
const sessionGroups = computed<AiSessionGroup[]>(() => {
  const groups = new Map<string, AiSessionGroup>();
  for (const session of sessionList.value) {
    const key =
      session.workspaceId == null || session.workspaceId === ''
        ? DEFAULT_WORKSPACE_KEY
        : String(session.workspaceId);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: workspaceName(session.workspaceId),
        sessions: [],
        latest: session.lastActiveAt
      };
      groups.set(key, group);
    }
    group.sessions.push(session);
    if (session.lastActiveAt && (!group.latest || session.lastActiveAt > group.latest)) {
      group.latest = session.lastActiveAt;
    }
  }
  return [...groups.values()].toSorted((a, b) => groupSortKey(b) - groupSortKey(a));
});

export function useAgentChat() {
  return {
    conversationId,
    messages,
    running,
    draft: currentDraft,
    sessionList,
    sessionGroups,
    ensureSession,
    createSession,
    switchSession,
    newSession,
    send,
    answerCard,
    stop,
    retryReply,
    removeTurn,
    revertTurn,
    appendSystem,
    restore,
    refreshSessions,
    searchSessions,
    renameSession,
    pinSession,
    removeSession
  };
}