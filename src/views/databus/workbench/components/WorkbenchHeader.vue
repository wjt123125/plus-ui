<template>
  <header class="wb-header">
    <!--
      工作台顶部 header（共享壳，§2.0）：侧栏开关的**唯一入口**。
      只放左右两个常设开关，不放标题/面包屑/全局操作——避免长成第二条工具栏，页面标题由外层框架提供。
      底部面板开关是 opt-in 第三块拼图：仅在 consoleOpen 属性传入时渲染（undefined 视为该页面
      不提供底部面板），保持共享壳对其它使用方零影响。图标用 lucide 的 panel-* 侧栏语义图形
      （DArrowLeft/Right 语义是「翻页」，不是「侧栏」），经 useLucideSubset 离线注入，不触发 iconify 联网取图。
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
      <el-tooltip
        v-if="consoleOpen !== undefined"
        :content="`${consoleOpen ? '收起' : '展开'}${consoleLabel}`"
        placement="bottom"
        :show-after="300"
      >
        <button
          type="button"
          class="wb-header__btn"
          :aria-expanded="!consoleOpen"
          @click="emit('update:consoleOpen', !consoleOpen)"
        >
          <SvgIcon :icon-class="consoleOpen ? 'lucide:panel-bottom-close' : 'lucide:panel-bottom-open'" />
          <span v-if="!consoleOpen && consoleCount" class="wb-header__badge">
            {{ consoleCount > 99 ? '99+' : consoleCount }}
          </span>
        </button>
      </el-tooltip>
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
    /** 底部面板是否展开；undefined = 该页面不提供底部面板，不渲染开关（opt-in） */
    consoleOpen?: boolean;
    /** 底部面板名称，进 tooltip 文案 */
    consoleLabel?: string;
    /** 面板收起时的错误角标数（>0 显示红点数字，>99 显示 99+） */
    consoleCount?: number;
  }>(),
  { aiLabel: 'AI 助手', navLabel: '资源树', aiHotkey: 'Ctrl+U', consoleLabel: '编译输出' }
);

const emit = defineEmits<{
  (e: 'update:aiCollapsed', value: boolean): void;
  (e: 'update:navCollapsed', value: boolean): void;
  (e: 'update:consoleOpen', value: boolean): void;
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
    position: relative;
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

  /* 底部面板收起时的错误角标（红点数字，仅编译失败后出现） */
  &__badge {
    position: absolute;
    top: -3px;
    right: -4px;
    min-width: 15px;
    height: 15px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--el-color-danger, #f56c6c);
    color: #fff;
    font-size: 10px;
    font-weight: 600;
    line-height: 15px;
    text-align: center;
    pointer-events: none;
  }
}
</style>
