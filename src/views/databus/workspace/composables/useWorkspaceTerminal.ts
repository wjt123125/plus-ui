/**
 * 工作区底部终端容器状态（运行 / 构建两小 tab）。
 *
 * 两条 console 各自单例 composable（useRunConsole / useCompileConsole）保持独立、不混用，
 * 本容器只做「同一底部区域内切换展示哪一条流」：
 *  - 任一流 append 日志（open 置 true）即自动弹出容器并切到该流；
 *  - 头部单一开关（WorkbenchHeader panel-bottom）控制容器整体开合，关闭时两条流一并复位。
 *
 * 运行流内部再按 source 区分「链路执行 / 组件试跑」，属于同一条流的两类行，不再单开 tab。
 */
import { ref, watch } from 'vue';
import { useRunConsole } from '@/views/databus/workbench/composables/useRunConsole';
import { useCompileConsole } from '@/views/databus/workbench/composables/useCompileConsole';

export type TerminalTab = 'run' | 'compile';

const run = useRunConsole();
const comp = useCompileConsole();

/** 容器整体开合（不随路由持久化：终端是一次性关注点） */
const open = ref(false);
/** 当前展示的流 */
const tab = ref<TerminalTab>('run');

// 自动弹出：任一条 console 追加日志都拉起容器并切到该流
watch(run.open, (v) => {
  if (v) {
    tab.value = 'run';
    open.value = true;
  }
});
watch(comp.open, (v) => {
  if (v) {
    tab.value = 'compile';
    open.value = true;
  }
});

function switchTab(next: TerminalTab): void {
  tab.value = next;
  open.value = true;
}

/** 收起容器：两条流一并复位，避免下次打开残留旧开合态 */
function close(): void {
  open.value = false;
  run.open.value = false;
  comp.open.value = false;
}

/** 清空当前展示流 */
function clearActive(): void {
  if (tab.value === 'run') {
    run.clear();
  } else {
    comp.clear();
  }
}

export function useWorkspaceTerminal() {
  return { open, tab, run, comp, switchTab, close, clearActive };
}
