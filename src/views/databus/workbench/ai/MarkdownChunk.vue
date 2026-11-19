<!-- 一个 Markdown 顶层块的渲染单元：定稿块只解析一次，尾块随流式更新 -->
<template>
  <div ref="rootRef" class="md-chunk" v-html="rendered" />
</template>

<script setup lang="ts">
/**
 * 分块渲染的叶子节点。
 *
 * 定稿块的 text 不再变化，Vue 会跳过它的重渲染，选区、图片与代码高亮因此都是稳定的；
 * 只有尾块（live）每个批次会重解析，如果用户正在其中划字，就先挂起更新，
 * 等选区释放再补上——否则 v-html 换 DOM 会把选区一起清掉。
 */
import { onBeforeUnmount, ref, watch } from 'vue';
import { renderMarkdown } from './markdown';

const props = defineProps<{
  text: string;
  /** 流式尾块：需要为选区让路 */
  live?: boolean;
}>();

const rootRef = ref<HTMLElement>();
const rendered = ref(renderMarkdown(props.text));

let pendingText = props.text;
let watchingSelection = false;

/** 选区是否落在本块内：只有落在这里，换 DOM 才会毁掉用户的划选 */
function hasSelectionInside(): boolean {
  const el = rootRef.value;
  const selection = window.getSelection();
  if (!el || !selection || selection.isCollapsed || selection.rangeCount === 0) {
    return false;
  }
  return el.contains(selection.getRangeAt(0).commonAncestorContainer);
}

function stopWatchingSelection() {
  if (!watchingSelection) {
    return;
  }
  document.removeEventListener('selectionchange', onSelectionChange);
  watchingSelection = false;
}

function apply() {
  if (props.live && hasSelectionInside()) {
    if (!watchingSelection) {
      document.addEventListener('selectionchange', onSelectionChange);
      watchingSelection = true;
    }
    return;
  }
  stopWatchingSelection();
  rendered.value = renderMarkdown(pendingText);
}

function onSelectionChange() {
  if (!hasSelectionInside()) {
    apply();
  }
}

watch(
  () => props.text,
  (text) => {
    pendingText = text;
    apply();
  }
);

onBeforeUnmount(stopWatchingSelection);
</script>
