<template>
  <div ref="rootRef" class="json-code-editor">
    <div v-if="!readonly" class="json-code-editor__toolbar">
      <el-button
        size="small"
        text
        type="primary"
        :icon="MagicStick"
        :disabled="!canFormat"
        @click="formatJson"
      >
        格式化
      </el-button>
      <el-button
        size="small"
        text
        :icon="Minus"
        :disabled="!canFormat"
        @click="compressJson"
      >
        压缩
      </el-button>
      <span class="json-code-editor__status" :class="`is-${status}`">{{ statusText }}</span>
    </div>
    <div class="json-code-editor__core" :style="{ height }">
      <Codemirror
        :model-value="modelValue"
        :placeholder="placeholder"
        :extensions="extensions"
        :style="{ height: '100%' }"
        :indent-with-tab="true"
        :tab-size="2"
        @update:model-value="onUpdate"
        @ready="onReady"
        @blur="onBlur"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { Codemirror } from 'vue-codemirror';
import { basicSetup } from 'codemirror';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { linter, type Diagnostic } from '@codemirror/lint';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { MagicStick, Minus } from '@element-plus/icons-vue';
import { ElButton } from 'element-plus';

defineOptions({ name: 'JsonCodeEditor' });

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    height?: string;
    readonly?: boolean;
  }>(),
  {
    placeholder: '在此输入 JSON',
    height: '240px',
    readonly: false
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'blur'): void;
}>();

/** JSON 浅色语法高亮（与 element-plus 默认浅色主题对齐） */
const jsonHighlight = HighlightStyle.define([
  { tag: t.string, color: '#a5243a' },
  { tag: t.number, color: '#0b7d7b' },
  { tag: t.bool, color: '#a5243a' },
  { tag: t.null, color: '#a5243a' },
  { tag: t.propertyName, color: '#5b69c0' },
  { tag: t.comment, color: '#909399', fontStyle: 'italic' }
]);

/** JSON 校验诊断：空文本不报错；非空走官方 jsonParseLinter */
const jsonLinter = linter((view): Diagnostic[] => {
  const text = view.state.doc.toString();
  if (!text.trim()) return [];
  return jsonParseLinter()(view);
});

const extensions = computed(() => {
  const list = [
    basicSetup,
    json(),
    EditorView.lineWrapping,
    syntaxHighlighting(jsonHighlight),
    jsonLinter
  ];
  if (props.readonly) {
    list.push(EditorState.readOnly.of(true));
  }
  list.push(
    EditorView.theme({
      '&': {
        backgroundColor: '#ffffff',
        color: '#303133',
        fontSize: '12px',
        fontFamily:
          'Menlo, Monaco, "Cascadia Code", "JetBrains Mono", Consolas, monospace'
      },
      '.cm-content': { caretColor: '#409eff' },
      '.cm-gutters': {
        backgroundColor: '#fafafa',
        color: '#909399',
        border: 'none'
      },
      '.cm-activeLine': { backgroundColor: '#f5f7fa' },
      '.cm-activeLineGutter': { backgroundColor: '#f5f7fa' },
      '&.cm-focused': { outline: 'none' },
      '.cm-placeholder': { color: '#c0c4cc', fontStyle: 'italic' },
      '&.cm-editor.cm-readonly .cm-content': { caretColor: 'transparent' }
    })
  );
  return list;
});

/** 当前内容校验状态：unknown/ok/error */
const status = ref<'unknown' | 'ok' | 'error'>('unknown');
const statusText = computed(() => {
  if (status.value === 'ok') return 'JSON 合法';
  if (status.value === 'error') return 'JSON 不合法';
  return '';
});

/** EditorView 实例（用于格式化/压缩时替换文档） */
const viewRef = shallowRef<EditorView | null>(null);

/** 根元素引用：用于 IntersectionObserver 监听可见性 */
const rootRef = ref<HTMLElement | null>(null);
let visibilityObserver: IntersectionObserver | null = null;
/** 上一次可见状态：仅监测 hide→show 跳变，show→show / show→hide 不触发自动格式化 */
let wasVisible = false;

/**
 * 首次加载与 hide→show 跳变时，自动格式化一次（仅刷新视图，不触发 commit）。
 *
 * 说明：vue-codemirror 的 @ready 仅在挂载时触发一次；后续由 v-show/display:none
 * 切换（如 el-dialog 关闭再打开、el-tab-pane 切走再切回、CmpProps v-else 分支切换
 * 但实例复用等场景）造成的「隐藏→显示」不会重新触发 @ready，因此此处额外使用
 * IntersectionObserver 自监听可见性变化，从隐藏到显示时再次调用 autoFormatIfCompressed。
 */
function onReady(payload: { view: EditorView }) {
  viewRef.value = payload.view;
  revalidate(props.modelValue);
  autoFormatIfCompressed();
}

onMounted(() => {
  const root = rootRef.value;
  if (!root || typeof IntersectionObserver === 'undefined') return;
  visibilityObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const visible = entry.isIntersecting && entry.intersectionRatio > 0;
        if (visible && !wasVisible) {
          wasVisible = true;
          autoFormatIfCompressed();
        } else if (!visible) {
          wasVisible = false;
        }
      }
    },
    { threshold: [0] }
  );
  visibilityObserver.observe(root);
});

onBeforeUnmount(() => {
  visibilityObserver?.disconnect();
  visibilityObserver = null;
  wasVisible = false;
});

/** 自动格式化：仅当文本是合法 JSON 且当前为压缩/单行形态时触发；不触发 @blur，避免 commit */
function autoFormatIfCompressed() {
  const text = props.modelValue;
  if (!text.trim()) return;
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    status.value = 'error';
    return;
  }
  const formatted = JSON.stringify(obj, null, 2);
  if (formatted === text) {
    status.value = 'ok';
    return;
  }
  replaceDoc(formatted);
  emit('update:modelValue', formatted);
  status.value = 'ok';
}

function revalidate(text: string) {
  if (!text.trim()) {
    status.value = 'unknown';
    return;
  }
  try {
    JSON.parse(text);
    status.value = 'ok';
  } catch {
    status.value = 'error';
  }
}

function onUpdate(value: string) {
  emit('update:modelValue', value);
  revalidate(value);
}

function onBlur() {
  emit('blur');
}

const canFormat = computed(() => status.value === 'ok');

function replaceDoc(text: string) {
  const view = viewRef.value;
  if (!view) return;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text }
  });
}

/** 格式化：紧凑 → 2 空格缩进 */
function formatJson() {
  const text = props.modelValue;
  if (!text.trim()) return;
  try {
    const obj = JSON.parse(text);
    const formatted = JSON.stringify(obj, null, 2);
    replaceDoc(formatted);
    emit('update:modelValue', formatted);
    status.value = 'ok';
    emit('blur');
  } catch {
    status.value = 'error';
  }
}

/** 压缩：去空白（仍是合法 JSON） */
function compressJson() {
  const text = props.modelValue;
  if (!text.trim()) return;
  try {
    const obj = JSON.parse(text);
    const compressed = JSON.stringify(obj);
    replaceDoc(compressed);
    emit('update:modelValue', compressed);
    status.value = 'ok';
    emit('blur');
  } catch {
    status.value = 'error';
  }
}
</script>

<style scoped>
.json-code-editor {
  display: flex;
  flex-direction: column;
  width: 100%;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  overflow: hidden;
}

.json-code-editor__toolbar {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 2px 4px;
  background-color: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.json-code-editor__status {
  margin-left: auto;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.json-code-editor__status.is-ok {
  color: var(--el-color-success);
}

.json-code-editor__status.is-error {
  color: var(--el-color-danger);
}

.json-code-editor__core {
  width: 100%;
}

.json-code-editor__core :deep(.cm-editor) {
  height: 100%;
  font-size: 12px;
}

.json-code-editor__core :deep(.cm-scroller) {
  font-family: Menlo, Monaco, 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
}
</style>
