<!--
  Java 源码编辑器（CodeMirror 6 + @codemirror/lang-java）：
  - 脚本宿主执行体编辑/只读查看复用；
  - diagnostics 由外部（保存编译结果）传入，经 setDiagnostics 主动推送标红（不用 linter 轮询，
    否则只在文档变化时重跑，保存编译后代码未动导致标红不刷新），不在前端做 Java 语法校验；
  - 编辑器主题与语法高亮配色走 CSS 变量，跟随 element-plus 明暗主题。
-->
<template>
  <div class="java-code-editor">
    <div class="java-code-editor__core" :style="{ height }">
      <Codemirror
        :model-value="modelValue"
        :placeholder="placeholder"
        :extensions="extensions"
        :style="{ height: '100%' }"
        :indent-with-tab="true"
        :tab-size="4"
        @update:model-value="onUpdate"
        @ready="onReady"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { Codemirror } from 'vue-codemirror';
import { basicSetup } from 'codemirror';
import { EditorView } from '@codemirror/view';
import { EditorState, type Text } from '@codemirror/state';
import { setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { java } from '@codemirror/lang-java';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { ScriptDiagnostic } from '@/api/databus/component/types';

defineOptions({ name: 'JavaCodeEditor' });

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    height?: string;
    readonly?: boolean;
    /** 外部编译诊断（行列号 1 起），变更即推送标红 */
    diagnostics?: ScriptDiagnostic[] | null;
  }>(),
  {
    placeholder: '在此编写完整 Java 类源码',
    height: '420px',
    readonly: false,
    diagnostics: () => []
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

/** EditorView 实例（@ready 一次性捕获，用于推送外部诊断） */
const viewRef = shallowRef<EditorView | null>(null);

/** Java 语法高亮：颜色走组件级 CSS 变量（--jce-*，见 style 块），html.dark 下自动切换暗色调色板 */
const javaHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword], color: 'var(--jce-kw)', fontWeight: '600' },
  { tag: [t.string, t.character], color: 'var(--jce-str)' },
  { tag: t.number, color: 'var(--jce-num)' },
  { tag: [t.bool, t.null], color: 'var(--jce-kw)' },
  { tag: [t.lineComment, t.blockComment], color: 'var(--jce-cmt)', fontStyle: 'italic' },
  { tag: [t.className, t.typeName], color: 'var(--jce-type)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--jce-fn)' },
  { tag: [t.definition(t.variableName), t.variableName], color: 'var(--jce-var)' },
  { tag: t.annotation, color: 'var(--jce-anno)' },
  { tag: t.propertyName, color: 'var(--jce-prop)' }
]);

/** 外部编译诊断 → CM 诊断（行列号 1 起；行号越界容错到最后一行，列有效时精确标记该字符） */
function toCmDiagnostics(doc: Text, list: ScriptDiagnostic[]): Diagnostic[] {
  const result: Diagnostic[] = [];
  for (const d of list) {
    if (d.kind !== 'ERROR' || d.line <= 0) {
      continue;
    }
    const lineNo = Math.min(d.line, doc.lines);
    const line = doc.line(lineNo);
    let from = line.from;
    let to = line.to;
    if (line.length > 0 && d.column > 0) {
      // javac 列号 1 起；越界钳到行尾字符
      from = line.from + Math.min(d.column - 1, line.length - 1);
      to = from + 1;
    }
    result.push({
      from,
      to,
      severity: 'error',
      message: d.column > 0 ? `[${d.line}:${d.column}] ${d.message}` : d.message
    });
  }
  return result;
}

/** 推送外部诊断；lint 扩展未激活时由 setDiagnostics 自动启用，空列表即清空标红 */
function pushDiagnostics() {
  const view = viewRef.value;
  if (!view) {
    return;
  }
  view.dispatch(setDiagnostics(view.state, toCmDiagnostics(view.state.doc, props.diagnostics ?? [])));
}

/** 诊断变更即推送（linter 轮询只在文档变化时重跑，编译后代码未动时标红会滞后） */
watch(
  () => props.diagnostics,
  () => pushDiagnostics()
);

/** view 未就绪时的待跳行请求（reveal 先于 @ready 到达的场景） */
let pendingReveal: { line: number; column: number } | null = null;

function onReady(payload: { view: EditorView }) {
  viewRef.value = payload.view;
  // 挂载时诊断可能已就绪（如 v-if 重建后再传入），补推一次
  pushDiagnostics();
  // view 未就绪期间到达的跳行请求在此补跳
  if (pendingReveal) {
    const { line, column } = pendingReveal;
    pendingReveal = null;
    reveal(line, column);
  }
}

/**
 * 跳到指定行列：行号钳到文档范围，光标定位后滚动居中并聚焦。
 * 行列号 1 起（javac 诊断口径），供编译控制台诊断行点击跳转。
 */
function reveal(line: number, column: number): void {
  const view = viewRef.value;
  if (!view) {
    pendingReveal = { line, column };
    return;
  }
  const lineNo = Math.min(Math.max(line, 1), view.state.doc.lines);
  const target = view.state.doc.line(lineNo);
  const pos = Math.min(target.from + Math.max(column, 1) - 1, target.to);
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: 'center' })
  });
  view.focus();
}

defineExpose({ reveal });

const extensions = computed(() => {
  const list = [
    basicSetup,
    java(),
    EditorView.lineWrapping,
    syntaxHighlighting(javaHighlight)
  ];
  if (props.readonly) {
    list.push(EditorState.readOnly.of(true));
  }
  list.push(
    EditorView.theme({
      '&': {
        backgroundColor: 'var(--el-bg-color)',
        color: 'var(--el-text-color-primary)',
        fontSize: '12px',
        fontFamily: 'Menlo, Monaco, "Cascadia Code", "JetBrains Mono", Consolas, monospace'
      },
      '.cm-content': { caretColor: 'var(--el-color-primary)' },
      '.cm-gutters': {
        backgroundColor: 'var(--el-fill-color-lighter)',
        color: 'var(--el-text-color-secondary)',
        border: 'none'
      },
      '.cm-activeLine': { backgroundColor: 'var(--el-fill-color-light)' },
      '.cm-activeLineGutter': { backgroundColor: 'var(--el-fill-color-light)' },
      '&.cm-focused': { outline: 'none' },
      '.cm-placeholder': { color: 'var(--el-text-color-placeholder)', fontStyle: 'italic' },
      '&.cm-editor.cm-readonly .cm-content': { caretColor: 'transparent' }
    })
  );
  return list;
});

function onUpdate(value: string) {
  emit('update:modelValue', value);
}
</script>

<style scoped>
.java-code-editor {
  display: flex;
  flex-direction: column;
  width: 100%;
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 6px;
  overflow: hidden;

  /* 语法高亮调色板（浅色，对齐 element-plus） */
  --jce-kw: #a5243a;
  --jce-str: #5b8c2c;
  --jce-num: #0b7d7b;
  --jce-cmt: #909399;
  --jce-type: #1f6feb;
  --jce-fn: #7d4cdb;
  --jce-var: #303133;
  --jce-anno: #b8860b;
  --jce-prop: #c4652a;
}

/* 暗色调色板（html.dark 由 element-plus 主题开关控制） */
html.dark .java-code-editor {
  --jce-kw: #ff7b93;
  --jce-str: #98c379;
  --jce-num: #4ec9b0;
  --jce-cmt: #8d9095;
  --jce-type: #61afef;
  --jce-fn: #c678dd;
  --jce-var: #cfd3dc;
  --jce-anno: #e5c07b;
  --jce-prop: #d19a66;
}

.java-code-editor__core {
  width: 100%;
}

.java-code-editor__core :deep(.cm-editor) {
  height: 100%;
  font-size: 12px;
}

.java-code-editor__core :deep(.cm-scroller) {
  font-family: Menlo, Monaco, 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
}
</style>
