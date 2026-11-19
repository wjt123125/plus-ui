<!-- 渲染一段 AI 回复的 Markdown；排版交给 prose.scss，本文件只管分块与安全增强 -->
<template>
  <div class="md-host">
    <div class="md-prose" @click="onContentClick">
      <!-- 定稿块只解析一次；尾块随流式增长，是唯一会重解析的部分 -->
      <MarkdownChunk v-for="(block, i) in split.blocks" :key="i" :text="block" />
      <MarkdownChunk v-if="split.live" key="live" :text="split.live" live />
    </div>
    <Teleport to="body">
      <div v-if="previewSrc" class="md-lightbox" @click="previewSrc = ''">
        <img :src="previewSrc" alt="" />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
/**
 * Markdown 文本渲染块（按顶层块分片渲染）。
 *
 * 分工：
 * - 解析口径：./markdown.ts（markdown-it 配置、安全规则、块切分）；
 * - 渲染单元：MarkdownChunk.vue（一块一个 v-html，定稿块不再更新）；
 * - 排版：./prose.scss（.md-prose 命名空间，换容器密度只换档位类）；
 * - 交互：代码块复制、表格横向滚动、图片点击放大，统一走事件委托。
 *
 * 分片的意义：流式正文每个批次都会变，整段重解析会让选区被销毁、
 * 图片与代码块反复重建，长回复的成本还会按长度平方增长。
 */
import { computed, ref } from 'vue';
import MarkdownChunk from './MarkdownChunk.vue';
import { splitMarkdownBlocks } from './markdown';

const props = defineProps<{ text: string }>();

const previewSrc = ref('');

const split = computed(() => splitMarkdownBlocks(props.text ?? ''));

async function onContentClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (!target) return;

  const copyBtn = target.closest<HTMLElement>('[data-copy]');
  if (copyBtn) {
    try {
      await navigator.clipboard.writeText(copyBtn.dataset.copy ?? '');
      copyBtn.textContent = '已复制';
    } catch {
      copyBtn.textContent = '复制失败';
    }
    window.setTimeout(() => {
      copyBtn.textContent = '复制';
    }, 1200);
    return;
  }

  const imgBtn = target.closest<HTMLElement>('[data-preview]');
  if (imgBtn) {
    previewSrc.value = imgBtn.dataset.preview ?? '';
  }
}
</script>

<style lang="scss">
@use './prose.scss';
</style>
