<template>
  <header class="wb-header">
    <!--
      工作台顶部 header（共享壳，§2.0）：侧栏开关的**唯一入口**。
      只放左右两个开关，不放标题/面包屑/全局操作——避免长成第二条工具栏，页面标题由外层框架提供。
      图标用 lucide 的 panel-* 侧栏语义图形（DArrowLeft/Right 语义是「翻页」，不是「侧栏」），
      经 useLucideSubset 离线注入，不触发 iconify 联网取图。
    -->
    <div class="wb-header__side">
      <el-tooltip :content="`${aiCollapsed ? '展开' : '收起'}${aiLabel}${aiHotkey ? `（${aiHotkey}）` : ''}`" placement="bottom" :show-after="300">
        <button
          type="button"
          class="wb-header__btn"
          :aria-expanded="!aiCollapsed"
          @click="emit('update:aiCollapsed', !aiCollapsed)"
        >
          <SvgIcon :icon-class="aiCollapsed ? 'lucide:panel-left-open' : 'lucide:panel-left-close'" />
        </button>
      </el-tooltip>
    </div>

    <div class="wb-header__side">
      <el-tooltip :content="`${navCollapsed ? '展开' : '收起'}${navLabel}`" placement="bottom" :show-after="300">
        <button
          type="button"
          class="wb-header__btn"
          :aria-expanded="!navCollapsed"
          @click="emit('update:navCollapsed', !navCollapsed)"
        >
          <SvgIcon :icon-class="navCollapsed ? 'lucide:panel-right-open' : 'lucide:panel-right-close'" />
        </button>
      </el-tooltip>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useLucideSubset } from '../composables/useLucideSubset';

defineOptions({ name: 'WorkbenchHeader' });

withDefaults(
  defineProps<{
    /** 左栏（对话栏）是否收起 */
    aiCollapsed: boolean;
    /** 右栏（资源树）是否收起 */
    navCollapsed: boolean;
    /** 左栏名称，进 tooltip 文案 */
    aiLabel?: string;
    /** 右栏名称，进 tooltip 文案 */
    navLabel?: string;
    /** 左栏快捷键提示（无则不显示） */
    aiHotkey?: string;
  }>(),
  { aiLabel: 'AI 助手', navLabel: '资源树', aiHotkey: 'Ctrl+U' }
);

const emit = defineEmits<{
  (e: 'update:aiCollapsed', value: boolean): void;
  (e: 'update:navCollapsed', value: boolean): void;
}>();

useLucideSubset();
</script>

<style lang="scss" scoped>
.wb-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  padding: 0 4px;

  &__side {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  &__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--el-text-color-secondary);
    font-size: 15px;
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      color 0.15s ease;

    &:hover {
      background: var(--el-fill-color-light, #f5f7fa);
      color: var(--el-color-primary);
    }
  }
}
</style>
