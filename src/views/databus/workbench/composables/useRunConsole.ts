/**
 * 运行流（工作区终端「运行」tab 的唯一状态源，模块级单例）。
 *
 * 链路执行与画布试运行同属「跑了一次，出结果」，合成一条流：
 *  - 判别联合承载差异：链路挂 recordId（跳总账记录），试运行挂完整结果（详情开结果 tab）；
 *  - 渲染由 RunConsole 按 source 分派到各自行组件，状态层不做任何 UI 判断。
 * 后续新增运行类型只加一个 source 分支 + 一个行组件，不动容器。
 */
import { ref } from 'vue';
import type { PreviewRunVo } from '@/api/databus/el/types';

interface RunLogBase {
  id: number;
  /** HH:mm:ss */
  time: string;
  level: 'success' | 'error';
  /** 行内标识：链路编码或组件编码 */
  code: string;
  /** 失败总述（成功为空） */
  text: string;
  /** 耗时 ms */
  costMs?: number | null;
}

/** 链路执行（有总账记录时行尾可跳详情） */
export interface ChainRunEntry extends RunLogBase {
  source: 'chain';
  recordId?: number | string | null;
}

/**
 * 画布试运行（内存结果）：终端只放摘要，完整结果进结果 tab。
 * 结果本体与终端同生命周期——刷新即失效，与「不落库」口径一致。
 */
export interface PreviewRunEntry extends RunLogBase {
  source: 'preview';
  /** 来源链路名（预览链路为「预览 · xxx」） */
  title: string;
  result: PreviewRunVo;
  /** 步骤标题快照（tag → 组件名）：结果 tab 不再依赖画布模型树 */
  titleByTag: Record<string, string>;
  /** 本次实际发出的入参文本（结果页「入参」区展示，不回查、不重算） */
  requestJson: string;
}

export type RunLogEntry = ChainRunEntry | PreviewRunEntry;

/** 终端是即时反馈不是历史库，超量从头部裁剪 */
const MAX_ENTRIES = 100;

const open = ref(false);
const entries = ref<RunLogEntry[]>([]);
/** 最近一次运行是否失败（终端 tab 上做红点角标） */
const errorCount = ref(0);

let seq = 0;

function stamp(): { id: number; time: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    id: ++seq,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  };
}

function push(entry: RunLogEntry): void {
  entries.value.push(entry);
  if (entries.value.length > MAX_ENTRIES) {
    entries.value.splice(0, entries.value.length - MAX_ENTRIES);
  }
  open.value = true;
  errorCount.value = entry.level === 'error' ? 1 : 0;
}

/** 追加一条链路执行结果（source 由本方法补齐，调用方不用关心判别字段） */
function appendChain(entry: Omit<ChainRunEntry, 'id' | 'time' | 'source'>): void {
  push({ ...entry, source: 'chain', ...stamp() });
}

/** 追加一条试运行结果，返回行 id（结果 tab 用它取结果本体） */
function appendPreview(entry: Omit<PreviewRunEntry, 'id' | 'time' | 'source'>): number {
  const stamped: PreviewRunEntry = { ...entry, source: 'preview', ...stamp() };
  push(stamped);
  return stamped.id;
}

function clear(): void {
  entries.value = [];
  errorCount.value = 0;
}

export function useRunConsole() {
  return { open, entries, errorCount, appendChain, appendPreview, clear };
}
