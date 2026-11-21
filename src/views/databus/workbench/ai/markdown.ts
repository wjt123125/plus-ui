/**
 * Markdown 的唯一解析口径，以及「顶层块切分」。
 *
 * 流式正文每批都会变整段文本：整段重解析 + 整棵 DOM 重建会带来三件事——
 * 选区被销毁、图片与代码块反复重建、长回复的解析成本按长度平方增长。
 * 这里把正文切成「已定稿的顶层块」和「还在增长的尾块」：定稿块只解析一次，
 * 尾块才随内容重解析。切分是纯函数，不依赖任何渲染框架。
 */
import MarkdownIt from 'markdown-it';
import type { HLJSApi } from 'highlight.js';
// 只引 common（约 37 种常用语言），不再把全量语言库打进聊天包
import common from 'highlight.js/lib/common';
import dart from 'highlight.js/lib/languages/dart';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import groovy from 'highlight.js/lib/languages/groovy';
import powershell from 'highlight.js/lib/languages/powershell';
import properties from 'highlight.js/lib/languages/properties';
import scala from 'highlight.js/lib/languages/scala';
import { isFormattable } from './formatters';

const hljs: HLJSApi = common;

// common 之外的菜单语言单独补注册；六个合计约 20KB，比全量语言库小两个数量级
hljs.registerLanguage('dart', dart);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('groovy', groovy);
hljs.registerLanguage('powershell', powershell);
hljs.registerLanguage('properties', properties);
hljs.registerLanguage('scala', scala);

/** 只允许 http/https/协议相对地址，避免 data: 之类被当图片加载 */
const SAFE_IMG_SRC = /^(https?:)?\/\//i;

/** 列表项 / 引用 / 缩进行：说明上一块还没结束，空行不是块边界 */
const BLOCK_CONTINUES = /^(?: {2,}|\t|[-*+]\s|\d+[.)]\s|>)/;

/** 出现链接引用定义时语义跨块（定义可能写在后面的块里），只能整段解析 */
const LINK_REF_DEF = /^ {0,3}\[[^\]]+\]:/m;

/** 头部工具条图标：内联 SVG，v-html 里没法用 SvgIcon 组件 */
const ICON_CHEVRON =
  '<svg class="md-code-lang-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const ICON_COPY =
  '<svg class="md-icon-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
const ICON_CHECK =
  '<svg class="md-icon-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const ICON_WAND =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/></svg>';

export interface CodeLangOption {
  /** highlight.js 语言 id；空串表示纯文本 */
  value: string;
  label: string;
}

/** 语言切换菜单：只放常用语言，菜单自身滚动 */
export const CODE_LANGS: CodeLangOption[] = [
  { value: '', label: 'Plain Text' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'swift', label: 'Swift' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'scala', label: 'Scala' },
  { value: 'dart', label: 'Dart' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'xml', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'scss', label: 'SCSS' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'dockerfile', label: 'Dockerfile' },
  { value: 'graphql', label: 'GraphQL' },
  { value: 'diff', label: 'Diff' },
  { value: 'lua', label: 'Lua' },
  { value: 'r', label: 'R' },
  { value: 'groovy', label: 'Groovy' },
  { value: 'objectivec', label: 'Objective-C' },
  { value: 'properties', label: 'Properties' }
];

/** 语言的展示名：菜单文案优先，其次 highlight.js 的官方名（ts → TypeScript） */
export function langLabel(lang: string): string {
  if (!lang) {
    return 'Plain Text';
  }
  return CODE_LANGS.find((item) => item.value === lang)?.label ?? hljs.getLanguage(lang)?.name ?? lang;
}

/** 写入代码块内容并重高亮；同步 data-copy，复制拿到的就是当前看到的内容 */
export function applyCodeContent(block: HTMLElement, lang: string, source: string): void {
  const codeEl = block.querySelector<HTMLElement>('pre.md-code > code');
  if (!codeEl) {
    return;
  }
  if (lang && hljs.getLanguage(lang)) {
    try {
      codeEl.innerHTML = hljs.highlight(source, { language: lang, ignoreIllegals: true }).value;
      codeEl.className = `hljs language-${lang}`;
    } catch {
      codeEl.textContent = source;
      codeEl.className = 'hljs';
    }
  } else {
    codeEl.textContent = source;
    codeEl.className = 'hljs';
  }
  const copyBtn = block.querySelector<HTMLElement>('[data-copy]');
  if (copyBtn) {
    copyBtn.dataset.copy = source;
  }
  // 只有浏览器端有可靠格式化器的语言才露出按钮
  const formatBtn = block.querySelector<HTMLElement>('[data-format]');
  if (formatBtn) {
    formatBtn.hidden = !isFormattable(lang);
  }
}

/** 切换语言：读当前文本重高亮，不动内容 */
export function applyCodeLanguage(block: HTMLElement, lang: string): void {
  const source = block.querySelector<HTMLElement>('pre.md-code > code')?.textContent ?? '';
  applyCodeContent(block, lang, source);
  const langBtn = block.querySelector<HTMLElement>('[data-lang-menu]');
  if (langBtn) {
    langBtn.dataset.lang = lang;
    const text = langBtn.querySelector<HTMLElement>('.md-code-lang-text');
    if (text) {
      text.textContent = langLabel(lang);
    }
  }
}

/** 当前文件里复用同一套 utils（escapeHtml 等），避免把 md 实例当全局 */
type MarkdownEngine = InstanceType<typeof MarkdownIt>;

/** 拼一段代码块的 HTML：顶部语言/复制栏 + 高亮后的代码 */
function renderCodeBlock(md: MarkdownEngine, code: string, info: string): string {
  // 原文放进 data-copy，复制按钮直接读，不需要回查 DOM 文本
  const raw = md.utils.escapeHtml(code);
  const lang = (info.trim().split(/\s+/)[0] ?? '').toLowerCase();
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
  const label = md.utils.escapeHtml(langLabel(lang));
  // 格式化按钮先渲染、按语言决定隐藏：切语言时原地显隐，不重建 DOM
  const formatHidden = isFormattable(lang) ? '' : ' hidden';
  return `<div class="md-code-block"><div class="md-code-head"><button type="button" class="md-code-lang" data-lang-menu data-lang="${md.utils.escapeHtml(lang)}" aria-label="切换代码语言"><span class="md-code-lang-text">${label}</span>${ICON_CHEVRON}</button><div class="md-code-actions"><button type="button" class="md-code-btn md-format" data-format aria-label="格式化代码"${formatHidden}>${ICON_WAND}</button><button type="button" class="md-code-btn md-copy" data-copy="${raw}" aria-label="复制代码">${ICON_COPY}${ICON_CHECK}</button></div></div><pre class="md-code"><code class="hljs${langClass}">${body}</code></pre></div>`;
}

function createMarkdown() {
  const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

  // 代码块整块自己出：markdown-it 的 highlight 返回值只有以 <pre 开头才会原样透传，
  // 返回 <div> 会被再包一层 <pre><code>，与自定义顶栏叠成两层容器（外层还会被排版样式二次上色）。
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    return `${renderCodeBlock(md, token.content, token.info)}\n`;
  };

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
    const src = String(tokens[idx].attrGet('src') ?? '');
    const alt = md.utils.escapeHtml(tokens[idx].content || src);

    if (!SAFE_IMG_SRC.test(src)) {
      return `<a href="${md.utils.escapeHtml(src)}" target="_blank" rel="noopener noreferrer">${alt}</a>`;
    }

    const safeSrc = md.utils.escapeHtml(src);
    return `<button type="button" class="md-img-btn" data-preview="${safeSrc}"><img class="md-img" src="${safeSrc}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer" /></button>`;
  };

  return md;
}

const md = createMarkdown();

/** 渲染一段 Markdown 文本 */
export function renderMarkdown(text: string): string {
  return md.render(text ?? '');
}

export interface MarkdownBlocks {
  /** 已定稿的顶层块，每块可独立解析 */
  blocks: string[];
  /** 还没写完的尾块（可能为空） */
  live: string;
}

/**
 * 按顶层块切分 Markdown。
 *
 * 只认空行边界，且跳过代码围栏内的空行；列表 / 引用中间的空行不能切
 * （切了会变成两个列表、两段引用，视觉与整段解析不一致）。
 */
export function splitMarkdownBlocks(text: string): MarkdownBlocks {
  if (!text) {
    return { blocks: [], live: '' };
  }
  if (LINK_REF_DEF.test(text)) {
    return { blocks: [], live: text };
  }

  const lines = text.split('\n');
  const blocks: string[] = [];
  let fence: '`' | '~' | null = null;
  let start = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const char = fenceMatch[1][0] as '`' | '~';
      if (!fence) {
        fence = char;
      } else if (char === fence) {
        fence = null;
      }
      continue;
    }
    if (fence || line.trim() !== '') {
      continue;
    }

    // 空行：找下一个非空行，确认它是不是新块的开头
    let next = i + 1;
    while (next < lines.length && lines[next].trim() === '') {
      next += 1;
    }
    if (next >= lines.length || BLOCK_CONTINUES.test(lines[next])) {
      continue;
    }

    const block = lines.slice(start, i).join('\n').trim();
    if (block) {
      blocks.push(block);
    }
    start = next;
    i = next - 1;
  }

  return { blocks, live: lines.slice(start).join('\n').trim() };
}
