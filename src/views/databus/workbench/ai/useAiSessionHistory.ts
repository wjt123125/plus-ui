/**
 * 会话历史栏状态 —— 模块级单例，链路工作台与组件工作台共享同一份开合与宽度
 * （同一个 AI 助手在两处出现，历史栏不该在切页面时忽开忽合、宽度跳变）。
 *
 * 会话历史是 AI 助手**左边的兄弟栏**（自带头与拖条），历史栏自身的开合入口仍在
 * 工作台顶部 header。另有一层 AI 栏 → 历史栏的**单向**联动（见 bindHistoryToAi）：
 * AI 栏收起、或被拖到最窄时，历史栏一并收起；反向不弹回，展开历史栏仍走 header。
 */
import { watch, type Ref } from 'vue';
import { usePersisted } from '../composables/usePersisted';

/** 历史栏开合（整栏收起即不渲染，入口在工作台顶部 header） */
const collapsed = usePersisted('databus.ai.historyCollapsed', false);

/** 历史栏宽度（纯列表栏，宿主拖条写入） */
const width = usePersisted('databus.ai.historyWidth', 220);

/**
 * 绑定 AI 栏 → 会话历史栏的单向联动，两个工作台 setup 各调一次：
 *  - AI 栏收起（header 按钮 / Ctrl+U 都写同一个 ref）→ 历史栏一并收起；
 *  - AI 栏宽度拖到下限 minWidth → 历史栏一并收起。
 *
 * 只收不开：重新展开 AI 栏或拖宽都不反向弹回历史栏，避免拖拽中历史栏反复闪现。
 * watch 非 immediate，只响应用户当次动作，持久化恢复出的初始收起/最窄状态不翻旧账。
 */
export function bindHistoryToAi(aiCollapsed: Ref<boolean>, aiWidth: Ref<number>, minWidth: number) {
  watch(aiCollapsed, (value) => {
    if (value) {
      collapsed.value = true;
    }
  });
  watch(aiWidth, (value) => {
    if (value <= minWidth) {
      collapsed.value = true;
    }
  });
}

export function useAiSessionHistory() {
  return { collapsed, width, bindHistoryToAi };
}
