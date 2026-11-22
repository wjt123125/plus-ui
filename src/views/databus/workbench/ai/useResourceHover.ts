/**
 * 资源 hover 卡片的交互状态机（每个入口一份 controller）。
 *
 * 只负责「什么时候显示/收起、当前卡片属于哪个资源、评论框是否聚焦」；
 * 复制编码、加入会话等业务动作交给 useResourceActions。
 * 资源在 enter 时传入并当场冻结，之后再 hover 别的资源不会改写已打开的卡片。
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { anchorRectOf } from './contextBubble';
import { useResourceActions, type HoverResourceAction } from './useResourceActions';

/** 出气泡的延迟：列表一划而过时不至于闪一串气泡 */
const SHOW_DELAY = 240;
/** 收起延迟：给鼠标留出从目标移到气泡的时间 */
const HIDE_DELAY = 160;

/** 气泡要展示的信息区 */
export interface ResourceHoverInfo {
  title?: string;
  code?: string;
}

/** 入口只拿它绑 enter/leave，其余交给 ResourceHoverBubble */
export interface ResourceHoverController {
  mode: Ref<'ask' | 'comment' | null>;
  note: Ref<string>;
  anchorEl: Ref<HTMLElement | null>;
  info: ComputedRef<ResourceHoverInfo | null>;
  copyTitle: ComputedRef<string>;
  enter: (resource: HoverResourceAction | null, event: MouseEvent) => void;
  leave: () => void;
  keep: () => void;
  close: () => void;
  copy: () => void;
  join: () => void;
  commit: () => void;
  remove: () => void;
  onNoteFocus: () => void;
  onNoteBlur: () => void;
}

export function useResourceHover(): ResourceHoverController {
  const { copyCode, addToSession, saveNote, removeFromSession } = useResourceActions();

  const mode = ref<'ask' | 'comment' | null>(null);
  const note = ref('');
  /** 气泡贴住的元素：滚动/窗口变化由气泡按它重算 */
  const anchorEl = ref<HTMLElement | null>(null);
  /** 已打开卡片的资源：进入时冻结，后续 hover 不再改写 */
  const current = ref<HoverResourceAction | null>(null);
  /** 当前正在补评论的暂存条目 id */
  const editingId = ref('');
  /** 评论框是否聚焦：聚焦中不随鼠标移开收起，失焦再提交关闭 */
  const focused = ref(false);

  const copyTitle = computed(() => `复制${current.value?.codeLabel ?? '编码'}`);
  const info = computed<ResourceHoverInfo | null>(() =>
    current.value
      ? { title: current.value.name, code: current.value.infoCode ?? current.value.code }
      : null
  );

  let showTimer = 0;
  let hideTimer = 0;

  function clearShow(): void {
    if (showTimer) {
      window.clearTimeout(showTimer);
      showTimer = 0;
    }
  }

  function clearHide(): void {
    if (hideTimer) {
      window.clearTimeout(hideTimer);
      hideTimer = 0;
    }
  }

  function close(): void {
    clearShow();
    clearHide();
    mode.value = null;
    note.value = '';
    editingId.value = '';
    anchorEl.value = null;
    current.value = null;
    focused.value = false;
  }

  /**
   * 鼠标进入资源：延迟出卡。
   * 旧卡存在时先收掉，避免旧条目配新资源的信息；正在输入评论则不打断。
   */
  function enter(resource: HoverResourceAction | null, event: MouseEvent): void {
    const el = event.currentTarget as HTMLElement | null;
    clearShow();
    clearHide();
    if (mode.value === 'comment' && focused.value) {
      return;
    }
    if (mode.value) {
      close();
    }
    if (!resource || !el) {
      return;
    }
    showTimer = window.setTimeout(() => {
      showTimer = 0;
      if (!anchorRectOf(el)) {
        return;
      }
      anchorEl.value = el;
      current.value = resource;
      note.value = '';
      editingId.value = '';
      mode.value = 'ask';
    }, SHOW_DELAY);
  }

  /** 鼠标离开资源：延迟收起；正在输入评论时不收 */
  function leave(): void {
    clearShow();
    clearHide();
    if (!mode.value || (mode.value === 'comment' && focused.value)) {
      return;
    }
    hideTimer = window.setTimeout(() => {
      hideTimer = 0;
      if (mode.value === 'comment' && focused.value) {
        return;
      }
      close();
    }, HIDE_DELAY);
  }

  /** 鼠标进入气泡：取消收起计时 */
  function keep(): void {
    clearHide();
  }

  function copy(): void {
    void copyCode(current.value);
  }

  /** 加入会话：条目立刻进暂存区（输入框当场出卡），再切评论态补评论 */
  function join(): void {
    if (!current.value) {
      return;
    }
    const stored = addToSession(current.value);
    editingId.value = stored.id;
    note.value = stored.note ?? '';
    mode.value = 'comment';
  }

  function commit(): void {
    saveNote(editingId.value, note.value);
    close();
  }

  function remove(): void {
    removeFromSession(editingId.value);
    close();
  }

  function onNoteFocus(): void {
    focused.value = true;
    clearHide();
  }

  /** 失焦即提交并关闭；点在卡片内部的情况由气泡自己过滤，不会走到这里 */
  function onNoteBlur(): void {
    focused.value = false;
    commit();
  }

  return {
    mode,
    note,
    anchorEl,
    info,
    copyTitle,
    enter,
    leave,
    keep,
    close,
    copy,
    join,
    commit,
    remove,
    onNoteFocus,
    onNoteBlur
  };
}
