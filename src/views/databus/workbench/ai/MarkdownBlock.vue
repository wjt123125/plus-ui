<!-- 渲染一段 AI 回复的 Markdown；排版交给 prose.scss，本文件只管解析与安全增强 -->
<template>
  <div class="md-host">
    <div class="md-prose" v-html="html" @click="onContentClick" />
    <Teleport to="body">
      <div v-if="previewSrc" class="md-lightbox" @click="previewSrc = ''">
        <img :src="previewSrc" alt="" />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
/**
 * Markdown 文本渲染块。
 *
 * 分工：
 * - 解析：markdown-it；
 * - 排版：./prose.scss（.md-prose 命名空间，换容器密度只换档位类）；
 * - 交互：代码块复制、表格横向滚动、图片点击放大，统一走事件委托。
 *
 * 安全口径：
 * - `html: false`：AI 输出里的原始 HTML 只当文本转义，不执行；
 * - `linkify` 交给 markdown-it 的 validateLink，`javascript:` / `data:` 等协议默认被拦；
 * - 图片只放行 http(s) 协议，其余（含 `data:`）仍降级成文本链接；
 * - 图片懒加载 + no-referrer，避免侧栏一出现就去拉第三方资源。
 * 代码高亮复用项目已有的 highlight.js，不新增第二套高亮。
 */
import { computed, ref } from 'vue';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

const props = defineProps<{ text: string }>();

/** 只允许 http/https/协议相对地址，避免 data: 之类被当图片加载 */
const SAFE_IMG_SRC = /^(https?:)?\/\//i;

const previewSrc = ref('');

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(code, lang) {
    // 原文放进 data-copy，复制按钮直接读，不需要回查 DOM 文本
    const raw = md.utils.escapeHtml(code);
    let body = raw;
    let langClass = '';
    if (lang && hljs.getLanguage(lang)) {
      try {
        body = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
        langClass = ` language-${lang}`;
      } catch {
        /* 高亮失败退回纯文本 */
      }
    }
    // 顶部工具条：左边语言标识，右边复制；深色块是整屏唯一的深色锚点
    const label = md.utils.escapeHtml(lang || 'code');
    return `<div class="md-code-block"><div class="md-code-head"><span class="md-code-lang">${label}</span><button type="button" class="md-copy" data-copy="${raw}">复制</button></div><pre class="md-code"><code class="hljs${langClass}">${body}</code></pre></div>`;
  }
});

// 外链一律新窗口 + noopener，避免反向控制宿主页
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noopener noreferrer');
  return defaultLinkOpen(tokens, idx, options, env, self);
};

// 表格外包一层横向滚动容器，表格本身保持正常 table 布局
md.renderer.rules.table_open = () => '<div class="md-table-wrap"><table>';
md.renderer.rules.table_close = () => '</table></div>';

// 图片：安全协议内渲染成可点击放大的缩略图，其余降级成链接
md.renderer.rules.image = (tokens, idx) => {
  const src = tokens[idx].attrGet('src') ?? '';
  const alt = md.utils.escapeHtml(tokens[idx].content || src);

  if (!SAFE_IMG_SRC.test(src)) {
    return `<a href="${md.utils.escapeHtml(src)}" target="_blank" rel="noopener noreferrer">${alt}</a>`;
  }

  const safeSrc = md.utils.escapeHtml(src);
  return `<button type="button" class="md-img-btn" data-preview="${safeSrc}"><img class="md-img" src="${safeSrc}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer" /></button>`;
};

const html = computed(() => md.render(props.text ?? ''));

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