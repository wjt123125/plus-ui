<!--
  说明性文字的统一收纳：一个小小的问号图标，hover 才展开。
  2026-10-30 从 ConnectorPackagePane 的 dev 说明段与 ConnectorRuntimePanel 的 PLATFORM 告警正文抽出——
  两处原文各有一屏，铺在页面上会把真正要看的信息（装载目录 / 驱动表）挤下去。

  正文用「小标题 + 分组标签 + 一句人话」的结构，而不是一整坨段落：
  每组的 label 交代这段在讲哪一面（本应如此 / 实际情况 / 后果），读者扫一眼就知道重点在哪。
-->
<template>
  <el-popover :width="width" :placement="placement" trigger="hover" :show-after="120" popper-class="ih__pop">
    <template #reference>
      <SvgIcon class="ih__icon" :icon-class="icon" />
    </template>
    <div class="ih">
      <div v-if="title" class="ih__title">{{ title }}</div>
      <div v-for="(item, index) in items" :key="index" class="ih__item">
        <div v-if="item.label" class="ih__label">{{ item.label }}</div>
        <div class="ih__text">{{ item.text }}</div>
      </div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';

defineOptions({ name: 'InfoHint' });

useLucideSubset();

withDefaults(
  defineProps<{
    /** 提示正文：一项一个分组，label 是这个分组的名字（可省），text 是一句人话 */
    items: { label?: string; text: string }[];
    /** 顶部小标题（可省），一句话交代这组提示在讲什么 */
    title?: string;
    /** popover 宽度（px），分组式文案 340~380 比较耐读 */
    width?: number;
    placement?: 'bottom-start' | 'bottom' | 'bottom-end' | 'top-start' | 'top' | 'top-end' | 'left' | 'right';
    /** 图标名（Iconify 字符串） */
    icon?: string;
  }>(),
  {
    title: '',
    width: 340,
    placement: 'bottom-start',
    icon: 'lucide:circle-help'
  }
);
</script>

<style lang="scss" scoped>
/* 图标只是「这里能 hover」，不抢视线：次级色、help 光标，hover 才转主色 */
.ih__icon {
  flex-shrink: 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
  cursor: help;
  transition: color 0.15s ease;

  &:hover {
    color: var(--el-color-primary);
  }
}

.ih {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 顶部标题：一条细主色竖线做视觉锚点，和下面的分组拉开层级 */
.ih__title {
  padding-left: 8px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--el-text-color-primary);
  border-left: 2px solid var(--el-color-primary-light-5);
}

.ih__item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

/* 分组标签：小一号、主色、加宽字距，扫读时先落在这里 */
.ih__label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.4px;
  color: var(--el-color-primary);
}

.ih__text {
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-regular);
}

/* popover 外壳：默认 12px 内边距在小字号分组文案上偏挤，单独放一点气口 */
:global(.el-popover.ih__pop) {
  padding: 14px 16px;
  border-radius: 10px;
  box-shadow: var(--el-box-shadow-light);
}
</style>
