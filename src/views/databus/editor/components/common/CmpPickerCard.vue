<!--
  组件选择面板里的单个组件卡片：彩色图标 + 短标签。
  - active：键盘 ↑↓ 的高亮态（与鼠标 hover 同视觉，靠 data-index 唯一定位，推荐区与 tab 内重复出现也不串）；
  - recommended：推荐区卡片，primary 浅底描边，不再挂「推荐」角标（Top6 本身即推荐，角标刷屏等于没有重点）；
  - 全名与描述走右侧 tooltip（标题一行 + 说明最多三行，宽度封死自动换行）；
  - 推荐分是内部锅炉参数，只在 dev 构建以灰字露出供调参，生产用户看不到。
-->
<template>
  <el-tooltip
    placement="right"
    :show-after="300"
    popper-class="cmp-picker-tip"
  >
    <template #content>
      <div class="cmp-tip">
        <div class="cmp-tip__title">
          {{ def.label }}
          <span class="cmp-tip__type">{{ def.type }}</span>
        </div>
        <div class="cmp-tip__desc">{{ def.desc }}</div>
        <div v-if="dev" class="cmp-tip__score">推荐分 {{ score ?? '-' }}</div>
      </div>
    </template>
    <div
      class="cmp-picker-card"
      :class="{ 'is-active': active, 'is-recommended': recommended }"
      :data-index="index"
      @click="$emit('pick')"
      @mouseenter="$emit('hover')"
    >
      <span class="cmp-picker-card__icon" :style="{ backgroundColor: def.color }">
        <SvgIcon :icon-class="def.icon" />
      </span>
      <span class="cmp-picker-card__label">{{ def.short ?? def.label }}</span>
      <span v-if="dev && score != null" class="cmp-picker-card__score">{{ score }}</span>
    </div>
  </el-tooltip>
</template>

<script setup lang="ts">
import type { CmpDef } from '../../cmp-defs';

defineOptions({ name: 'CmpPickerCard' });

const dev = import.meta.env.DEV;

defineProps<{
  def: CmpDef;
  /** 在当前面板可见序列中的扁平下标（键盘高亮定位用，全局唯一） */
  index: number;
  active?: boolean;
  recommended?: boolean;
  /** 融合后推荐分，仅 dev 环境露出 */
  score?: number;
}>();

defineEmits<{
  (e: 'pick'): void;
  (e: 'hover'): void;
}>();
</script>

<style scoped>
.cmp-picker-card {
  /* 卡片不透明底色单一来源：角标咬口靠它盖住边框，暗色下推荐卡给不透明深蓝 */
  --card-bg: var(--el-bg-color);
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 6px 8px;
  cursor: pointer;
  background-color: var(--card-bg);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  transition: border-color 0.15s, box-shadow 0.15s, background-color 0.15s;
}

.cmp-picker-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 8px rgb(0 0 0 / 8%);
}

/* 键盘高亮：primary 描边 + 外环，推荐浅底上也能辨识 */
.cmp-picker-card.is-active {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary), 0 2px 8px rgb(var(--el-color-primary-rgb) / 20%);
}

.cmp-picker-card.is-recommended {
  --card-bg: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-5);
}

/* 暗色：项目把 primary-light-9 改成了半透明蓝，叠在深色面板上会让角标咬口失效、
   对比度不稳；这里给推荐卡不透明深蓝底 + 亮蓝描边 */
html.dark .cmp-picker-card.is-recommended {
  --card-bg: #1a2540;
  border-color: rgba(96, 165, 250, 0.42);
}

.cmp-picker-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin-right: 6px;
  color: #fff;
  font-size: 12px;
  border-radius: 4px;
}

.cmp-picker-card__label {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  color: var(--el-text-color-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* dev 调参角标：绝对定位骑在右上角边框上，水平底色盖住边框形成咬口；
   底色取卡片 --card-bg（普通/推荐、明/暗都不透明，咬口才干净） */
.cmp-picker-card__score {
  position: absolute;
  top: 0;
  right: 6px;
  transform: translateY(-50%);
  padding: 0 3px;
  font-size: 10px;
  line-height: 1;
  color: var(--el-text-color-secondary);
  background-color: var(--card-bg);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

/* 暗色下禁用灰太暗，角标改用亮蓝灰保证 10px 小字可读 */
html.dark .cmp-picker-card__score {
  color: #93b4e8;
}
</style>

<!-- tooltip 被 teleport 到 body，scoped 选择器够不到，必须用全局样式 -->
<style>
/* 提高特异性压过全局 .el-tooltip__popper 的 320px */
.el-tooltip__popper.cmp-picker-tip {
  max-width: 260px;
}

/* 全部走 app 主题变量：effect=light 的浮层在 light/dark 下背景由
   element-plus/_popper.scss 统一接管（--app-surface-bg），这里只管文字色，随主题自动换 */
.cmp-tip__title {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-title);
}

.cmp-tip__type {
  margin-left: 6px;
  font-weight: 400;
  color: var(--app-text-muted);
  font-family: var(--el-font-family-monospace, monospace);
}

.cmp-tip__desc {
  font-size: 12px;
  line-height: 1.5;
  color: var(--app-text-muted);
  word-break: break-word;
  /* 最多三行，再长省略：tooltip 只负责「补一眼」，不写说明书 */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.cmp-tip__score {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--app-surface-border);
  font-size: 11px;
  color: var(--app-text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
