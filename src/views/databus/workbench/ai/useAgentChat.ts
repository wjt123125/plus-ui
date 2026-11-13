/**
 * AI 助手对话状态（工作台侧栏 / 完整 AI 页共用）。
 *
 * 说话走两步：先 POST /databus/agent/chat 建 run 拿 runId，再用原生 EventSource 拉流
 * （EventSource 不能带自定义头，鉴权沿用 ?Authorization=Bearer token）。
 * run 状态全归后端，前端只存会话 id，刷新后继续同一会话。
 *
 * 消息按「段」存（不是一整块字符串）：`text` 段走 Markdown，`thinking` 段折叠展示，
 * `notice` 段是系统提示。切片 3 的画布变更卡、切片 5 的授权卡后续作为新段类型插入，
 * 不需要推翻消息模型。
 *
 * 状态是**模块级单例、按会话分桶**：AI 栏收起时面板组件会整栏销毁，消息不能跟着丢；
 * 每个 conversationId 一份消息 / 运行态 / SSE 连接，切换会话不重复拉历史，多会话可并行。
 */
import { computed, reactive, ref } from 'vue';
import {
  buildAgentStreamUrl,
  getActiveAgentRun,
  listAgentConversations,
  listAgentHistory,
  startAgentChat,
  stopAgentRun
} from '@/api/databus/agent';
import type { AgentConversationVo } from '@/api/databus/agent/types';
import { usePersisted } from '../composables/usePersisted';
import type { AiSession } from './ai.types';
import { buildRefsText, parseRefsText, type AgentRefItem } from './useAgentRefs';

export type AgentChatRole = 'user' | 'assistant' | 'system';

export type AgentSegment =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'notice'; text: string; eventCode?: string };

export interface AgentChatMessage {
  id: string;
  role: AgentChatRole;
  segments: AgentSegment[];
  /** 用户消息携带的引用卡；发出去的文本里另有等价引用段，气泡里只渲染芯片 */
  refs?: AgentRefItem[];
  /** assistant 气泡状态 */
  status?: 'streaming' | 'done' | 'error';
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

/** SnailAI 流事件类型（与后端 OpenApiChatStreamEvent 常量一致） */
const EVENT_TEXT = 'text';
const EVENT_THINKING = 'thinking';
const EVENT_DONE = 'done';
const EVENT_ERROR = 'error';

/** 旧的单例会话 key，迁移到多会话后仅在新 key 为空时读一次 */
const LEGACY_CONVERSATION_KEY = 'databus.agent.conversationId';

/** 当前激活会话 id（多会话切换只改这一个值） */
const activeId = usePersisted('databus.agent.activeConversationId', '');

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
  return crypto.randomUUID();
}

function ensureSession(conversationId: string): AgentSessionState {
  let state = sessions[conversationId];
  if (!state) {
    state = {
      messages: [],
      running: false,
      runId: '',
      streamingId: '',
      loaded: false
    };
    sessions[conversationId] = state;
  }
  return state;
}

/** 同类型的相邻段就地合并，避免流式时碎成一堆节点 */
function appendSegment(message: AgentChatMessage, segment: AgentSegment) {
  const last = message.segments[message.segments.length - 1];
  if (last && last.kind === segment.kind && segment.kind !== 'notice') {
    last.text += segment.text;
    return;
  }
  message.segments.push(segment);
}

function textOf(message: AgentChatMessage): string {
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

/**
 * 收尾失败：当前气泡标红 + 该会话追加一条 notice 系统行。
 */
function failStreaming(conversationId: string, reason: string) {
  const state = ensureSession(conversationId);
  const target = streamingMessage(state);
  if (target) {
    if (!textOf(target)) {
      target.segments.push({ kind: 'text', text: reason });
    }
    target.status = 'error';
  }
  closeStream(conversationId);
  state.running = false;
  pushSystem(conversationId, reason, 'error');
}

/** 流事件全部按会话定位，不依赖全局 streamingId */
function handleEvent(conversationId: string, type: string, data: string) {
  const state = sessions[conversationId];
  if (!state) {
    return;
  }
  const target = streamingMessage(state);
  switch (type) {
    case EVENT_TEXT:
      if (target) {
        appendSegment(target, { kind: 'text', text: data });
      }
      break;
    case EVENT_THINKING:
      // 空分片不建段，否则会留一个没有内容的「思考」壳
      if (target && data.trim()) {
        appendSegment(target, { kind: 'thinking', text: data });
      }
      break;
    case EVENT_DONE: {
      const done = parseJson<{ conversationId?: string; fullText?: string }>(data);
      if (target) {
        // done 的 data 就是整轮最终正文（JSON 取 fullText，纯文本直接用 raw）。
        // 用它整体替换流式碎片段，保证气泡里的文字与落库的 report 同源，
        // 刷新回放时不会出现「流式看到的」和「历史拉回来的」两份不同文本。
        const finalText = (done ? (done.fullText ?? '') : data).trim();
        if (finalText) {
          target.segments = [
            ...target.segments.filter((s) => s.kind === 'thinking'),
            { kind: 'text', text: finalText }
          ];
        }
        target.status = 'done';
      }
      closeStream(conversationId);
      state.running = false;
      void refreshSessions();
      break;
    }
    case EVENT_ERROR: {
      const err = parseJson<{ message?: string }>(data);
      failStreaming(conversationId, err?.message || 'AI 服务异常，请稍后重试');
      break;
    }
    default:
      break;
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
    const payload = parseJson<{ type?: string; data?: string }>(event.data);
    if (payload) {
      handleEvent(conversationId, payload.type ?? '', payload.data ?? '');
    }
  };
  es.onerror = () => {
    // done / error 后由本端主动 close，此时连接已不是这条，直接忽略
    if (streams.get(conversationId) !== es) {
      return;
    }
    failStreaming(conversationId, '连接已断开，请重试');
  };
}

/**
 * 发一句话：本地先定会话 id，把用户气泡与流式 assistant 气泡写进该会话桶，再建 run 拉流。
 *
 * @param content 用户原话
 * @param refs    引用卡（随问题拼成引用段发出去）
 */
async function send(content: string, refs?: AgentRefItem[]) {
  const text = content.trim();
  const refList = refs ?? [];
  if (!text && !refList.length) {
    return;
  }
  const conversationId = activeId.value || newConversationId();
  activeId.value = conversationId;
  const state = ensureSession(conversationId);
  if (state.running) {
    return;
  }
  state.loaded = true;
  state.messages.push({
    id: nextId(),
    role: 'user',
    segments: text ? [{ kind: 'text', text }] : [],
    refs: refList.length ? refList : undefined
  });
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
    const { data } = await startAgentChat({
      content: `${text}${buildRefsText(refList)}`,
      conversationId
    });
    if (!data?.runId) {
      failStreaming(conversationId, '发起对话失败，请稍后重试');
      return;
    }
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
  const target = streamingMessage(state);
  if (target) {
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

/** 新建会话：换一个空桶并切过去，不打断其它会话正在跑的 run */
function createSession(): string {
  const conversationId = newConversationId();
  ensureSession(conversationId).loaded = true;
  activeId.value = conversationId;
  return conversationId;
}

/** 兼容旧调用名（面板 defineExpose({ newSession }) 保持不变） */
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
    for (const run of data ?? []) {
      const intent = (run.intent ?? '').trim();
      if (!intent) {
        continue;
      }
      // 引用段是随问题一起发出去的纯文本，恢复时拆回结构化引用，卡片不退化
      const parsed = parseRefsText(intent);
      restored.push({
        id: nextId(),
        role: 'user',
        segments: parsed.text ? [{ kind: 'text', text: parsed.text }] : [],
        refs: parsed.refs.length ? parsed.refs : undefined
      });
      const answer = reportText(run.report);
      if (answer) {
        restored.push({
          id: nextId(),
          role: 'assistant',
          segments: [{ kind: 'text', text: answer }],
          status: 'done'
        });
      }
    }
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

/** 拉会话列表（历史栏数据源），失败就沿用本地已有的会话桶 */
async function refreshSessions() {
  try {
    const { data } = await listAgentConversations(50);
    remoteSessions.value = data ?? [];
  } catch {
    /* 拉不到就用本地态，不影响提问 */
  }
}

/** 会话列表展示时间：当天只给时分，跨天给月-日 */
function formatTime(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const time = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(time.getTime())) {
    return undefined;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  const now = new Date();
  if (time.toDateString() === now.toDateString()) {
    return `${pad(time.getHours())}:${pad(time.getMinutes())}`;
  }
  return `${pad(time.getMonth() + 1)}-${pad(time.getDate())}`;
}

/** 本地新建、后端还没有 run 的会话行：标题取首问全文压成一行，长度不截断，交给 CSS 按栏宽省略 */
function localSessionItem(conversationId: string): AiSession {
  const state = sessions[conversationId];
  const firstUser = state?.messages.find((m) => m.role === 'user');
  const title = firstUser ? textOf(firstUser).replace(/\s+/g, ' ').trim() : '';
  return {
    id: conversationId,
    title: title || '新会话',
    running: !!state?.running
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

/** 历史栏列表：后端会话按最近活跃倒序，本地新建但还没有 run 的会话排在最前 */
const sessionList = computed<AiSession[]>(() => {
  const remote = remoteSessions.value;
  const remoteIds = new Set(remote.map((item) => item.conversationId));
  const list: AiSession[] = [];
  for (const id of Object.keys(sessions).toReversed()) {
    if (!remoteIds.has(id)) {
      list.push(localSessionItem(id));
    }
  }
  for (const item of remote) {
    list.push({
      id: item.conversationId,
      title: item.title?.trim() || '未命名会话',
      time: formatTime(item.lastTime),
      running: !!item.running || !!sessions[item.conversationId]?.running
    });
  }
  return list;
});

export function useAgentChat() {
  return {
    conversationId,
    messages,
    running,
    sessionList,
    ensureSession,
    createSession,
    switchSession,
    newSession,
    send,
    stop,
    appendSystem,
    restore,
    refreshSessions
  };
}