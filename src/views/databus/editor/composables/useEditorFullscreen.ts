import {
  inject,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  type InjectionKey,
  type Ref
} from 'vue';

/** 编辑器整体全屏：宿主为页面根节点（工具栏 + 物料 + 画布 + 属性区一同全屏） */
export interface EditorFullscreenApi {
  isFullscreen: Ref<boolean>;
  toggleFullscreen: () => void;
}

export const EDITOR_FULLSCREEN_KEY = Symbol('editor-fullscreen') as InjectionKey<EditorFullscreenApi>;

export function createEditorFullscreen(rootRef: Ref<HTMLElement | null>): EditorFullscreenApi {
  const isFullscreen = ref(false);

  function syncState() {
    isFullscreen.value = !!rootRef.value && document.fullscreenElement === rootRef.value;
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (rootRef.value) {
      rootRef.value.requestFullscreen();
    }
  }

  // 尺寸自适应无需处理：VueFlow 内部 ResizeObserver 会感知宿主变化
  onMounted(() => document.addEventListener('fullscreenchange', syncState));
  onBeforeUnmount(() => document.removeEventListener('fullscreenchange', syncState));

  return { isFullscreen, toggleFullscreen };
}

export function provideEditorFullscreen(rootRef: Ref<HTMLElement | null>): EditorFullscreenApi {
  const api = createEditorFullscreen(rootRef);
  provide(EDITOR_FULLSCREEN_KEY, api);
  return api;
}

export function useEditorFullscreen(): EditorFullscreenApi {
  const api = inject(EDITOR_FULLSCREEN_KEY);
  if (!api) {
    throw new Error('useEditorFullscreen 必须在 provideEditorFullscreen 之后使用');
  }
  return api;
}
