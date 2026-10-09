/**
 * 执行控制台（链路工作台级底部抽屉的状态源，模块级单例）。
 *
 * 链路树右键「执行」的结果汇入底部终端——Node-RED debug sidebar / IDE terminal 范式：
 * 手动执行是显式触发的即时反馈，成败都自动弹出；header 开关可手动收起。
 *
 * 独立于组件工作台 useCompileConsole：编译诊断与执行概要数据形态不同，
 * 且两者都是模块级单例，混用会在不同工作台页面串日志。
 *
 * 状态放模块级而非 props 钻透：WorkbenchHeader（开关）、ExecuteConsole（渲染）、
 * workbench/index.vue（ManualExecuteDialog 回调写入）分散在树的不同层级，单例最省接线。
 */
import { ref } from 'vue';

/** 一条执行日志（成功显耗时，失败带错误消息；有总账记录时挂 recordId 跳详情） */
export interface ExecuteLogEntry {
  id: number;
  /** HH:mm:ss */
  time: string;
  level: 'success' | 'error';
  /** 链路主键（跳执行记录详情用） */
  chainId?: number | string;
  /** 链路编码，控制台行展示用 */
  chainCode: string;
  /** 概要：成功=执行成功，失败=后端错误消息 */
  text: string;
  /** 耗时 ms（后端返回时展示） */
  costTime?: number;
  /** 总账记录主键（OFF 档/无记录为 null；有值时行尾可点跳详情） */
  recordId?: number | string | null;
}

/** 日志容量上限：超出从头部裁剪，控制台是即时反馈不是历史库 */
const MAX_ENTRIES = 100;

// open 用会话内存不持久化：执行结果是一次性关注点，不该跨会话自动弹回。
const open = ref(false);
const entries = ref<ExecuteLogEntry[]>([]);
/** 最近一次执行是否失败（面板收起时在 header 开关上做红点角标） */
const errorCount = ref(0);

let seq = 0;

/** 追加一条执行日志：成败都自动弹出面板；失败置角标，成功清零 */
function append(entry: Omit<ExecuteLogEntry, 'id' | 'time'>): void {
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
  open.value = true;
  errorCount.value = entry.level === 'error' ? 1 : 0;
}

function clear(): void {
  entries.value = [];
  errorCount.value = 0;
}

export function useExecuteConsole() {
  return { open, entries, errorCount, append, clear };
}
