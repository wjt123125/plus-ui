import { onBeforeUnmount, onMounted } from 'vue';

/**
 * 编辑器全局键盘快捷键。动作全部由外部注入，本 composable 只负责按键判定、
 * 编辑目标（INPUT/TEXTAREA/contenteditable）避让与 window 监听的绑定/解绑。
 *
 * 必须在 setup 同步上下文中调用（内部注册生命周期钩子）。
 *
 * @param actions 动作注入表
 * @param isEnabled 可选启用门闸（多实例共存时由宿主注入，如工作台多 canvas tab
 *   只有激活 tab 响应快捷键；返回 false 时本实例直接忽略按键）。不传恒启用。
 */
export interface EditorHotkeyActions {
  deselect: () => void;
  requestDeleteNode: () => void | Promise<void>;
  undo: () => void;
  redo: () => void;
  selectAll: () => void;
  copy: () => void;
  paste: () => void;
  saveAsEl: () => void;
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) {
    return false;
  }
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

export function useEditorHotkeys(actions: EditorHotkeyActions, isEnabled?: () => boolean) {
  function onKeyDown(e: KeyboardEvent) {
    // 多实例共存（工作台多 canvas tab）：非激活实例不响应，避免 undo/Delete 同时触发
    if (isEnabled && !isEnabled()) return;
    const key = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;

    if (key === 'escape' && !isEditableTarget(e.target)) {
      e.preventDefault();
      actions.deselect();
      return;
    }

    // Delete/Backspace：删除选中节点（走控制器，改树+入栈）
    if ((key === 'delete' || key === 'backspace') && !isEditableTarget(e.target)) {
      e.preventDefault();
      void actions.requestDeleteNode();
      return;
    }

    if (!mod || e.altKey) {
      return;
    }

    switch (key) {
      case 'z':
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        if (e.shiftKey) {
          actions.redo();
        } else {
          actions.undo();
        }
        break;
      case 'y':
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        actions.redo();
        break;
      case 'a':
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        actions.selectAll();
        break;
      case 'c':
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        actions.copy();
        break;
      case 'v':
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        actions.paste();
        break;
      case 's':
        // Ctrl+S 不避让输入框：保存/生成 EL 动作本身不写文本，全局拦截
        e.preventDefault();
        actions.saveAsEl();
        break;
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeyDown));
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown));
}
