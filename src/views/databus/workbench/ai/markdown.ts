/**
 * Markdown 的唯一解析口径，以及「顶层块切分」。
 *
 * 流式正文每批都会变整段文本：整段重解析 + 整棵 DOM 重建会带来三件事——
 * 选区被销毁、图片与代码块反复重建、长回复的解析成本按长度平方增长。
 * 这里把正文切成「已定稿的顶层块」和「还在增长的尾块」：定稿块只解析一次，
 * 尾块才随内容重解析。切分是纯函数，不依赖任何渲染框架。
 */
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

/** 只允许 http/https/协议相对地址，避免 data: 之类被当图片加载 */
const SAFE_IMG_SRC = /^(https?:)?\/\//i;

/** 列表项 / 引用 / 缩进行：说明上一块还没结束，空行不是块边界 */
const BLOCK_CONTINUES = /^(?: {2,}|\t|[-*+]\s|\d+[.)]\s|>)/;

/** 出现链接引用定义时语义跨块（定义可能写在后面的块里），只能整段解析 */
const LINK_REF_DEF = /^ {0,3}\[[^\]]+\]:/m;

function createMarkdown() {
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
