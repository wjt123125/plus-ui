/**
 * 编译控制台（工作台级底部抽屉的状态源，模块级单例）。
 *
 * 脚本保存/发布的编译结果不再堆在 ScriptTab 卡内（压编辑器高度），统一汇入底部控制台——
 * Trae terminal 范式：编译失败自动弹出、header 开关可手动开合、点诊断行跳回编辑器对应行。
 *
 * 状态放模块级而非 props 钻透：WorkbenchHeader（开关+角标）、CompileConsole（渲染）、
 * 各 FormPane/ScriptTab 实例（写入/消费）分散在树的不同层级，单例最省接线。
 * 注意返回的是**独立 refs**，解构后仍是同一份单例（嵌套普通对象在模板里不会解包，会破坏单例）。
 */
import { ref } from 'vue';
import type { ScriptDiagnostic } from '@/api/databus/component/types';

/** 一条编译日志（成功或失败；失败时携带 javac 诊断明细，行可点击跳转） */
export interface CompileLogEntry {
  id: number;
  /** HH:mm:ss */
  time: string;
  level: 'success' | 'error';
  /** databus_component 行 id，跳行时用于定位编辑 tab */
  componentId: number;
  /** 组件编码，控制台里展示用（空则回退 #id） */
  code: string;
  /** 概要文案（失败=编译错误信息，成功=发布结果） */
  text: string;
  diagnostics: ScriptDiagnostic[];
}

/** 诊断行点击的跳转目标（由 index.vue 激活 form tab、ScriptTab 消费跳行） */
export interface RevealTarget {
  componentId: number;
  line: number;
  column: number;
}

/** 日志容量上限：超出从头部裁剪，控制台是即时反馈不是历史库 */
const MAX_ENTRIES = 100;

// open 用会话内存不持久化：编译问题是一次性关注点，不该跨会话自动弹回。
const open = ref(false);
const entries = ref<CompileLogEntry[]>([]);
/** 最近一次编译错误数（成功清零），面板收起时在 header 开关上做红点角标 */
const errorCount = ref(0);
const revealTarget = ref<RevealTarget | null>(null);

let seq = 0;

/** 追加一条日志：失败自动弹出面板并刷新错误数；成功清零角标 */
function append(entry: Omit<CompileLogEntry, 'id' | 'time'>): void {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  entries.value.push({
    ...entry,
    id: ++seq,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  });
  if (entries.value.length > MAX_ENTRIES) {
    entries.value.splice(0, entries.value.length - MAX_ENTRIES);
  }
  if (entry.level === 'error') {
    open.value = true;
    errorCount.value = entry.diagnostics.length || 1;
  } else {
    errorCount.value = 0;
  }
}

function clear(): void {
  entries.value = [];
  errorCount.value = 0;
}

/** 诊断行点击 → 设置跳转目标（消费方经 consumeReveal 取走） */
function requestReveal(target: RevealTarget): void {
  revealTarget.value = target;
}

/** 取走并清空当前跳转目标（一次性语义，防止旧目标被后挂载的组件误消费） */
function consumeReveal(): RevealTarget | null {
  const target = revealTarget.value;
  revealTarget.value = null;
  return target;
}

export function useCompileConsole() {
  return { open, entries, errorCount, revealTarget, append, clear, requestReveal, consumeReveal };
}
