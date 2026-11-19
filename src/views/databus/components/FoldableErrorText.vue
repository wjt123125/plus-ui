<!--
  可折叠的原文文本（IDE 折叠行语义）：默认只显示首行，点左侧箭头展开/收起。
  用于数据库原始报错等长文本——原文不再归一化，直接给全文，靠折叠控制信息量。
-->
<template>
  <div class="fe" :class="{ 'is-expanded': expanded }">
    <button
      v-if="foldable"
      type="button"
      class="fe__caret"
      :title="expanded ? '收起' : '展开全文'"
      @click.stop="expanded = !expanded"
    >
      <el-icon>
        <CaretBottom v-if="expanded" />
        <CaretRight v-else />
      </el-icon>
    </button>
    <span v-else class="fe__caret fe__caret--ghost" aria-hidden="true" />
    <pre class="fe__text">{{ expanded ? content : firstLine }}</pre>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { CaretBottom, CaretRight } from '@element-plus/icons-vue';

defineOptions({ name: 'FoldableErrorText' });

const props = withDefaults(
  defineProps<{
    text?: string | null;
    /** 单行超过该字符数也视为「长文本」，给出折叠入口 */
    foldThreshold?: number;
  }>(),
  { text: '', foldThreshold: 120 }
);

const expanded = ref(false);

const content = computed(() => props.text ?? '');

/** 折叠态展示的首行（多行原文只露第一行） */
const firstLine = computed(() => content.value.split('\n')[0]);

/** 多行或单行过长时才给折叠入口；短错误保持原样，不增加噪音 */
const foldable = computed(() => {
  const t = content.value;
  if (!t) {
    return false;
  }
  return t.includes('\n') || t.length > props.foldThreshold;
});
</script>

<style lang="scss" scoped>
.fe {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
  color: inherit;
}

/* 箭头列固定宽度：可折叠与不可折叠的行文本左边界对齐 */
.fe__caret {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--el-color-primary);
  cursor: pointer;

  .el-icon {
    font-size: 12px;
  }
}

.fe__caret--ghost {
  cursor: default;
}

.fe__text {
  flex: 1;
  min-width: 0;
  margin: 0;
  font: inherit;
  color: inherit;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* 折叠态：只留首行，超出省略，像 IDE 的折叠行 */
.fe:not(.is-expanded) .fe__text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 展开态：限高内滚，避免长堆栈把整页撑开 */
.fe.is-expanded .fe__text {
  max-height: 40vh;
  overflow: auto;
}
</style>
