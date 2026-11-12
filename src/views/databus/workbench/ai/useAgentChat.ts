/**
 * AI 助手对话状态（工作台侧栏薄壳用）。
 *
 * 说话走两步：先 POST /databus/agent/chat 建 run 拿 runId，再用原生 EventSource 拉流
 * （EventSource 不能带自定义头，鉴权沿用 ?Authorization=Bearer token）。
 * run 状态全归后端，前端只存 conversationId，刷新后继续同一会话。
 *
 * 消息按「段」存（不是一整块字符串）：`text` 段走 Markdown，`thinking` 段折叠展示，
 * `notice` 段是系统提示。切片 3 的画布变更卡、切片 5 的授权卡后续作为新段类型插入，
 * 不需要推翻消息模型。
 *
 * 状态是**模块级单例**：AI 栏收起时面板组件会整栏销毁，消息不能跟着丢；
 * 同一个工作台始终只有一个对话。
 */
import { ref } from 'vue';
import {
  buildAgentStreamUrl,
  getActiveAgentRun,
  listAgentHistory,
  startAgentChat,
  stopAgentRun
} from '@/api/databus/agent';
import { usePersisted } from '../composables/usePersisted';
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

/** SnailAI 流事件类型（与后端 OpenApiChatStreamEvent 常量一致） */
const EVENT_TEXT = 'text';
const EVENT_THINKING = 'thinking';
const EVENT_DONE = 'done';
const EVENT_ERROR = 'error';

const conversationId = usePersisted('databus.agent.conversationId', '');
const messages = ref<AgentChatMessage[]>([]);
const running = ref(false);

/** 当前 SSE 连接（模块级，收起侧栏不中断） */
let source: EventSource | null = null;
/** 当前 run 句柄（停止时用） */
let currentRunId = '';
/** 正在流式累积的 assistant 消息 id */
let streamingId = '';

let idSeq = 0;
function nextId(): string {
  idSeq += 1;
  return `agent_${Date.now()}_${idSeq}`;
}

function currentMessage(): AgentChatMessage | undefined {
  return messages.value.find((m) => m.id === streamingId);
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

function closeStream() {
  if (source) {
    source.close();
    source = null;
  }
  currentRunId = '';
  streamingId = '';
}

/**
 * 收尾失败：当前气泡标红 + 追加一条 notice 系统行（面板据此露出「完整 AI 页」逃生门）。
 */
function failStreaming(reason: string) {
  const target = currentMessage();
  if (target) {
    if (!textOf(target)) {
      target.segments.push({ kind: 'text', text: reason });
    }
    target.status = 'error';
  }
  closeStream();
  running.value = false;
  appendSystem(reason, 'error');
}

function handleEvent(type: string, data: string) {
  const target = currentMessage();
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
      if (done?.conversationId) {
        conversationId.value = done.conversationId;
      }
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
      closeStream();
      running.value = false;
      break;
    }
    case EVENT_ERROR: {
      const err = parseJson<{ message?: string }>(data);
      failStreaming(err?.message || 'AI 服务异常，请稍后重试');
      break;
    }
    default:
      break;
  }
}

function openStream(runId: string) {
  currentRunId = runId;
  const es = new EventSource(buildAgentStreamUrl(runId));
  source = es;
  es.onmessage = (event) => {
    if (source !== es) {
      return;
    }
    const payload = parseJson<{ type?: string; data?: string }>(event.data);
    if (payload) {
      handleEvent(payload.type ?? '', payload.data ?? '');
    }
  };
  es.onerror = () => {
    // done / error 后由本端主动 close，此时 source 已不是这条连接，直接忽略
    if (source !== es) {
      return;
    }
    failStreaming('连接已断开，请重试');
  };
}

/**
 * 发一句话：先落用户气泡与流式 assistant 气泡，再建 run 拉流。
 *
 * @param content 用户原话
 * @param chainId 当前画布链路 id，可为空
 */
async function send(content: string, chainId?: string | number | null, refs?: AgentRefItem[]) {
  const text = content.trim();
  const refList = refs ?? [];
  if ((!text && !refList.length) || running.value) {
    return;
  }
  messages.value.push({
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
  streamingId = assistant.id;
  messages.value.push(assistant);
  running.value = true;
  try {
    const { data } = await startAgentChat({
      content: `${text}${buildRefsText(refList)}`,
      conversationId: conversationId.value || undefined,
      chainId: chainId ?? undefined
    });
    if (!data?.runId) {
      failStreaming('发起对话失败，请稍后重试');
      return;
    }
    if (data.conversationId) {
      conversationId.value = data.conversationId;
    }
    openStream(data.runId);
  } catch {
    failStreaming('发起对话失败，请稍后重试');
  }
}

/**
 * 停止当前 run：先本地收尾（保住已收到的文字），再通知后端把 run 置 STOPPED。
 */
async function stop() {
  const runId = currentRunId;
  const target = currentMessage();
  if (target) {
    if (!textOf(target)) {
      target.segments.push({ kind: 'text', text: '已停止' });
    }
    target.status = 'done';
  }
  closeStream();
  running.value = false;
  if (runId) {
    try {
      await stopAgentRun(runId);
    } catch {
      /* run 可能已自然结束，忽略 */
    }
  }
}

/** 新会话：停掉进行中的 run，清空消息与本地会话 id（下一次发送自建新会话） */
async function newSession() {
  if (running.value) {
    await stop();
  }
  messages.value = [];
  conversationId.value = '';
}

/**
 * 追加一条系统行（侧栏收到 databus:agent:* 推送时展示，切片 2 起有实际事件）。
 *
 * @param content   人类可读文案
 * @param eventCode 事件编码
 */
function appendSystem(content: string, eventCode?: string) {
  messages.value.push({
    id: nextId(),
    role: 'system',
    segments: [{ kind: 'notice', text: content, eventCode }]
  });
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
 * 旧 SSE 连接已随刷新断开，若查到 RUNNING 只提示「其它页面正在进行」，
 * 绝不擅自停掉它（可能正被另一个标签页使用）。
 */
async function restore() {
  if (running.value || messages.value.length || !conversationId.value) {
    return;
  }
  try {
    const { data } = await listAgentHistory(conversationId.value);
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
    if (restored.length && !running.value && !messages.value.length) {
      messages.value = restored;
    }
  } catch {
    /* 拉不到历史就按新会话处理，不影响继续提问 */
  }
  try {
    const { data } = await getActiveAgentRun(conversationId.value);
    if (data?.runId) {
      appendSystem('这个会话正在其它页面进行中（多标签页只支持一条对话流）。', 'agent:busy');
    }
  } catch {
    /* 查不到就当没有，不影响继续提问 */
  }
}

export function useAgentChat() {
  return {
    conversationId,
    messages,
    running,
    send,
    stop,
    newSession,
    appendSystem,
    restore
  };
}