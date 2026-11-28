<!-- 渲染一段 AI 回复的 Markdown；排版交给 prose.scss，本文件只管分块与安全增强 -->
<template>
  <div class="md-host">
    <div class="db-markdown" @click="onContentClick">
      <!-- 定稿块只解析一次；尾块随流式增长，是唯一会重解析的部分 -->
      <MarkdownChunk v-for="(block, i) in split.blocks" :key="i" :text="block" />
      <MarkdownChunk v-if="split.live" key="live" :text="split.live" live />
    </div>
    <Teleport to="body">
      <div v-if="previewSrc" class="md-lightbox" @click="previewSrc = ''">
        <img :src="previewSrc" alt="" />
      </div>
    </Teleport>
    <!-- 语言切换：定位交给 el-popover（滚动重定位、视口翻转），关闭只认外部点击与 Esc -->
    <el-popover
      v-bind="virtualTrigger"
      v-model:visible="langOpen"
      placement="bottom-start"
      :width="190"
      :offset="4"
      :show-arrow="false"
      popper-class="db-scope md-lang-popper"
    >
      <div class="md-lang-list">
        <button
          v-for="opt in CODE_LANGS"
          :key="opt.value || 'plain'"
          type="button"
          class="md-lang-item"
          :class="{ 'is-active': opt.value === currentLang }"
          @click="pickLang(opt)"
        >
          <span>{{ opt.label }}</span>
          <svg
            v-if="opt.value === currentLang"
            class="md-lang-check"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>
      </div>
    </el-popover>
  </div>
</template>

<script setup lang="ts">
/**
 * Markdown 文本渲染块（按顶层块分片渲染）。
 *
 * 分工：
 * - 解析口径：./markdown.ts（markdown-it 配置、安全规则、块切分）；
 * - 渲染单元：MarkdownChunk.vue（一块一个 v-html，定稿块不再更新）；
 * - 排版：./prose.scss（.db-markdown 命名空间，换容器密度只换档位类）；
 * - 交互：代码块复制、表格横向滚动、图片点击放大，统一走事件委托。
 *
 * 分片的意义：流式正文每个批次都会变，整段重解析会让选区被销毁、
 * 图片与代码块反复重建，长回复的成本还会按长度平方增长。
 */
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import MarkdownChunk from './MarkdownChunk.vue';
import {
  applyCodeContent,
  applyCodeLanguage,
  CODE_LANGS,
  splitMarkdownBlocks,
  type CodeLangOption
} from './markdown';
import { formatCode } from './formatters';

const props = defineProps<{ text: string }>();

const previewSrc = ref('');

const split = computed(() => splitMarkdownBlocks(props.text ?? ''));

/* ---------------- 代码块语言切换 ---------------- */

/** 锚点是 v-html 里的按钮，用虚拟触发把定位交给 el-popover */
const langAnchor = shallowRef<HTMLElement | null>(null);
const langOpen = ref(false);
const currentLang = ref('');

/**
 * PopoverProps 没有声明虚拟触发两个参数，用 v-bind 透传给内部的 tooltip。
 * 定位、视口翻转、滚动重定位都由 popper 负责，这里不再手写坐标。
 */
const virtualTrigger = computed(() => ({
  virtualTriggering: true,
  virtualRef: langAnchor.value
}));

function closeLang() {
  langOpen.value = false;
}

/** 外部指针与 Esc 关闭；浮层自身和语言按钮不算外部（按钮交给点击处理做开关） */
function onDocPointerDown(event: PointerEvent) {
  const el = event.target as Element | null;
  if (el?.closest('.md-lang-popper') || el?.closest('[data-lang-menu]')) {
    return;
  }
  closeLang();
}

function onDocKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeLang();
  }
}

watch(langOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', onDocPointerDown, true);
    document.addEventListener('keydown', onDocKeydown);
  } else {
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    document.removeEventListener('keydown', onDocKeydown);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true);
  document.removeEventListener('keydown', onDocKeydown);
});

/** 选语言：就地重高亮，不重渲染整段 Markdown */
function pickLang(option: CodeLangOption) {
  langOpen.value = false;
  const block = langAnchor.value?.closest<HTMLElement>('.md-code-block');
  if (!block || !block.isConnected) {
    return;
  }
  applyCodeLanguage(block, option.value);
  currentLang.value = option.value;
}

async function onContentClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (!target) return;

  const langBtn = target.closest<HTMLElement>('[data-lang-menu]');
  if (langBtn) {
    // 同一个按钮再点一次就是收起
    if (langOpen.value && langAnchor.value === langBtn) {
      closeLang();
      return;
    }
    langAnchor.value = langBtn;
    currentLang.value = langBtn.dataset.lang ?? '';
    langOpen.value = true;
    return;
  }

  const formatBtn = target.closest<HTMLElement>('[data-format]');
  if (formatBtn) {
    const block = formatBtn.closest<HTMLElement>('.md-code-block');
    if (!block) return;
    const lang = block.querySelector<HTMLElement>('[data-lang-menu]')?.dataset.lang ?? '';
    const source = block.querySelector<HTMLElement>('pre.md-code > code')?.textContent ?? '';
    const formatted = await formatCode(source, lang);
    if (formatted == null) {
      formatBtn.classList.add('is-error');
      window.setTimeout(() => formatBtn.classList.remove('is-error'), 1200);
      return;
    }
    applyCodeContent(block, lang, formatted);
    return;
  }

  const copyBtn = target.closest<HTMLElement>('[data-copy]');
  if (copyBtn) {
    copyBtn.classList.remove('is-done', 'is-error');
    try {
      await navigator.clipboard.writeText(copyBtn.dataset.copy ?? '');
      copyBtn.classList.add('is-done');
    } catch {
      copyBtn.classList.add('is-error');
    }
    window.setTimeout(() => {
      copyBtn.classList.remove('is-done', 'is-error');
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
