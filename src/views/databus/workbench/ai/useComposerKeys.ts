/**
 * 对话输入框的按键约定：Enter 发送、Shift+Enter / Alt+Enter 换行、输入法组词中的 Enter 不抢。
 *
 * Alt+Enter 必须手动插换行：Shift+Enter 是 textarea 原生行为，放行即可；
 * Alt 被系统当菜单加速键，浏览器不会插入换行，只能自己补。
 */
export interface ComposerKeysOptions {
  /** 取输入框 textarea；取不到时 Alt+Enter 放行 */
  getEl: () => HTMLTextAreaElement | undefined;
  /** 真发送动作；流式中、空草稿等拦截由宿主自己判断 */
  send: () => void;
  /** setRangeText 不触发 input 事件，新值需回写给 v-model */
  setValue: (value: string) => void;
}

export function useComposerKeys(opts: ComposerKeysOptions) {
  function insertNewline(el: HTMLTextAreaElement) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    // 用 setRangeText 而非拼字符串：保住 textarea 原生撤销栈，Ctrl+Z 能撤回这次换行
    el.setRangeText('\n', start, end, 'end');
    opts.setValue(el.value);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.isComposing) {
      return;
    }
    if (event.shiftKey) {
      return;
    }
    if (event.altKey) {
      const el = opts.getEl();
      if (!el) {
        return;
      }
      event.preventDefault();
      insertNewline(el);
      return;
    }
    event.preventDefault();
    opts.send();
  }

  return { onKeydown };
}