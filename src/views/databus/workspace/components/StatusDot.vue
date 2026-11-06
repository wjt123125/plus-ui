<!--
  行状态圆点（2026-11-03 定，2026-11-06 改）：颜色表达状态，状态文字只在圆点 hover 时以 title 提示，
  不再行内直接显示（列表行保持干净，异常态也只在悬停时说出短词与原因）。
  数据源由 marketDisplay 统一翻译（installRowStatus / marketItemRowStatus / connectorRowStatus），
  本组件只管「点 + hover 提示 + DEV 角标」三种呈现，不碰业务枚举。
-->
<template>
  <span class="db-status">
    <span class="db-status__dot" :class="`is-${tone}`" :title="dotTip" />
    <span
      v-if="dev"
      class="db-status__dev"
      title="开发目录装载：跑的是本地编译输出，不是上传的包；改代码后点「重新加载」即可生效"
    >
      DEV
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

defineOptions({ name: 'StatusDot' });

const props = withDefaults(
  defineProps<{
    /** 圆点颜色：绿=正常 / 黄=需要留意 / 红=异常 / 灰=不可用 */
    tone?: 'success' | 'warning' | 'danger' | 'info';
    /** 状态短词：不再行内展示，只作为悬停提示的标题 */
    label?: string;
    /** 开发目录装载角标 */
    dev?: boolean;
    /** 悬停完整说明 */
    title?: string;
  }>(),
  { tone: 'info', label: '', dev: false, title: '' }
);

/** 悬停兜底文案：状态短词与原因都为空时按颜色给一句，保证任何圆点 hover 都有话说 */
const TONE_TIP = { success: '正常', warning: '需留意', danger: '异常', info: '不可用' } as const;

/** 悬停提示：短词 + 原因；两者都空就回退到色调默认文案（绿点不能 hover 后啥也不提示） */
const dotTip = computed(() => {
  const head = props.label || (props.title ? '' : TONE_TIP[props.tone]);
  if (!head) {
    return props.title;
  }
  return props.title ? `${head}：${props.title}` : head;
});
</script>

<style lang="scss" scoped>
.db-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;

  &__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    cursor: help;

    &.is-success {
      background: var(--el-color-success, #10b981);
    }

    &.is-warning {
      background: var(--el-color-warning, #e6a23c);
    }

    &.is-danger {
      background: var(--el-color-danger, #f56c6c);
    }

    &.is-info {
      background: var(--el-text-color-placeholder, #909399);
    }
  }

  &__dev {
    padding: 0 3px;
    border: 1px solid var(--el-border-color-light);
    border-radius: 3px;
    font-size: 9px;
    font-weight: 600;
    line-height: 13px;
    letter-spacing: 0.4px;
    color: var(--el-text-color-placeholder);
  }
}
</style>
