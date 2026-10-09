import { inject, provide, type InjectionKey, type Ref } from 'vue';

/**
 * 文档级编辑器动作（IDE 化去顶栏后的命令收口）。
 *
 * 与 {@link useCanvasController} 分工：
 * - CanvasController 管「画布图结构」：增删节点/连线/选择/剪贴板/右键菜单状态；
 * - EditorActions 管「当前链路文档」：历史撤销、清空、保存、试运行、入参登记、生成 EL。
 *
 * ChainCanvasPane 装配完各 composable 后 provide；画布右键菜单（CmpContextMenu）、
 * 右上浮层（FlowSidePanel）inject 同一组动作，不各自透传 props。
 */
export interface EditorActions {
  /** 撤销是否可用（右键菜单禁用态） */
  canUndo: Ref<boolean>;
  /** 重做是否可用（右键菜单禁用态） */
  canRedo: Ref<boolean>;
  undo: () => void;
  redo: () => void;
  /** 清空画布（内部自带二次确认） */
  reset: () => void;
  /** 保存链路（成功清脏点） */
  save: () => void | Promise<void>;
  /** 试运行（弹入参 JSON 对话框） */
  preview: () => void;
  /** 打开入参登记 */
  openInputParams: () => void;
  /** 生成 EL */
  saveAsEl: () => void | Promise<void>;
  /** 保存链路请求中（预留：菜单项/浮钮态） */
  chainSaving: Ref<boolean>;
  /** 试运行执行中（浮钮 loading） */
  previewRunning: Ref<boolean>;
}

export const EDITOR_ACTIONS_KEY = Symbol('editor-actions') as InjectionKey<EditorActions>;

export function provideEditorActions(actions: EditorActions): EditorActions {
  provide(EDITOR_ACTIONS_KEY, actions);
  return actions;
}

export function useEditorActions(): EditorActions {
  const actions = inject(EDITOR_ACTIONS_KEY);
  if (!actions) {
    throw new Error('useEditorActions 必须在 provideEditorActions 之后使用');
  }
  return actions;
}
