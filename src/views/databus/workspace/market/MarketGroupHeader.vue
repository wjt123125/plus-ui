<!--
  物料管理四个视角共用的平铺分组标题（2026-11-06 抽取）：
  折叠箭头 + 类型名 + 计数，整条可点即折叠开关。
  只做展示与「切换」上抛，折叠状态与分组数据归各视角自己持有——四个视角语义不同，
  抽象停在标题这一层，避免把行内容/操作列也塞进插槽（治理还要扩组件/链路）。
-->
<template>
  <button type="button" class="mkt__group-title" :class="{ 'is-collapsed': collapsed }" @click="emit('toggle')">
    <SvgIcon class="mkt__group-chevron" icon-class="lucide:chevron-down" />
    <span>{{ label }}</span>
    <span class="mkt__group-count">{{ count }}</span>
  </button>
</template>

<script setup lang="ts">
defineOptions({ name: 'MarketGroupHeader' });

withDefaults(
  defineProps<{
    /** 分组类型名（组件 / 链路 / 连接器） */
    label: string;
    /** 组内行数 */
    count?: number;
    /** 是否已折叠（箭头转 -90°、列表不渲染，渲染与否由调用方决定） */
    collapsed?: boolean;
  }>(),
  { count: 0, collapsed: false }
);

const emit = defineEmits<{
  /** 点整条标题切换折叠 */
  (e: 'toggle'): void;
}>();
</script>

<style lang="scss" scoped>
/* 组标题右侧灰色小计数（平铺分组的类型总数，信息量展示不报警） */
.mkt__group-count {
  margin-left: 4px;
  padding: 0 6px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 400;
  line-height: 16px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color, #f0f2f5);
  vertical-align: 1px;
}

/* 组标题＝折叠开关（四个视角共用）。箭头展开朝下、折叠转 -90°，整条可点，悬停只给一层极浅底。
   两个坑：① <button> 不吃页面字体（UA 默认字体栈，和周围字重/字形对不上），故字体与行高显式给定；
   ② 左右负边距抵消内边距，箭头贴列表框左边框、文字仍与框内首行同一个视觉起点。 */
.mkt__group-title {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 4px -4px 8px;
  padding: 3px 8px 3px 4px;
  border: 0;
  border-radius: var(--db-r-tag);
  background: transparent;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
  color: var(--el-text-color-primary);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--db-dur-fast) var(--db-ease);

  &:hover {
    background: var(--el-fill-color-lighter);
  }

  &:active {
    background: var(--el-fill-color-light);
  }

  &:focus-visible {
    outline: 2px solid var(--el-color-primary-light-5);
    outline-offset: 1px;
  }
}

.mkt__group-chevron {
  font-size: 13px;
  color: var(--el-text-color-placeholder);
  transition:
    transform var(--db-dur-normal) var(--db-ease),
    color var(--db-dur-fast) var(--db-ease);
}

.mkt__group-title:hover .mkt__group-chevron {
  color: var(--el-text-color-secondary);
}

.mkt__group-title.is-collapsed .mkt__group-chevron {
  transform: rotate(-90deg);
}
</style>
