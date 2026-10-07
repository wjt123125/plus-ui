<!--
  Java 源码编辑器（CodeMirror 6 + @codemirror/lang-java）：
  - 脚本宿主执行体编辑/只读查看复用；
  - diagnostics 由外部（保存编译结果）传入，按行标红，不在前端做 Java 语法校验。
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
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Codemirror } from 'vue-codemirror';
import { basicSetup } from 'codemirror';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { linter, type Diagnostic } from '@codemirror/lint';
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
    /** 外部编译诊断（行列号 1 起），按行标红 */
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

/** Java 浅色语法高亮（与 element-plus 浅色主题对齐） */
const javaHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword], color: '#a5243a', fontWeight: '600' },
  { tag: [t.string, t.character], color: '#5b8c2c' },
  { tag: t.number, color: '#0b7d7b' },
  { tag: [t.bool, t.null], color: '#a5243a' },
  { tag: t.lineComment, color: '#909399', fontStyle: 'italic' },
  { tag: t.blockComment, color: '#909399', fontStyle: 'italic' },
  { tag: [t.className, t.typeName], color: '#1f6feb' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#7d4cdb' },
  { tag: [t.definition(t.variableName), t.variableName], color: '#303133' },
  { tag: t.annotation, color: '#b8860b' },
  { tag: t.propertyName, color: '#c4652a' }
]);

/** 外部编译诊断 → CM 行级诊断（行号越界容错到最后一行） */
const externalLinter = linter((view): Diagnostic[] => {
  const list = props.diagnostics ?? [];
  if (!list.length) {
    return [];
  }
  const lines = view.state.doc.lines;
  const result: Diagnostic[] = [];
  for (const d of list) {
    if (d.kind !== 'ERROR' || d.line <= 0) {
      continue;
    }
    const lineNo = Math.min(d.line, lines);
    const line = view.state.doc.line(lineNo);
    result.push({
      from: line.from,
      to: line.to,
      severity: 'error',
      message: d.column > 0 ? `[${d.line}:${d.column}] ${d.message}` : d.message
    });
  }
  return result;
});

const extensions = computed(() => {
  const list = [
    basicSetup,
    java(),
    EditorView.lineWrapping,
    syntaxHighlighting(javaHighlight),
    externalLinter
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
        fontFamily: 'Menlo, Monaco, "Cascadia Code", "JetBrains Mono", Consolas, monospace'
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
