<template>
  <header class="wb-header">
    <!--
      工作台顶部 header（共享壳，§2.0）：侧栏开关的**唯一入口**。
      只放侧栏开关，不放标题/面包屑/全局操作——避免长成第二条工具栏，页面标题由外层框架提供。
      会话历史（AI 栏左边的兄弟栏）与底部面板开关都是 opt-in：仅在对应属性传入时渲染
      （undefined 视为该页面不提供），保持共享壳对其它使用方零影响。图标统一为「面板 + 分隔线」
      的简化图形：展开态用实心侧栏带、收起态用空心矩形，不再内嵌小箭头方向标识；
      会话历史用纯气泡图形，避免回转箭头带来的视觉噪音。
    -->
    <div class="wb-header__side">
      <!-- 会话历史栏开关（opt-in）：历史栏在 AI 助手左边，按钮也排在 AI 开关左边。
           用纯气泡图形与侧栏面板区分，避免同形按钮分不清 -->
      <el-tooltip
        v-if="historyCollapsed !== undefined"
        :content="`${historyCollapsed ? '展开' : '收起'}${historyLabel}`"
        placement="bottom"
        :show-after="300"
      >
        <button
          type="button"
          class="wb-header__btn"
          :aria-expanded="!historyCollapsed"
          @click="emit('update:historyCollapsed', !historyCollapsed)"
        >
          <SvgIcon icon-class="lucide:message-square" />
        </button>
      </el-tooltip>
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
    /** 会话历史栏（AI 助手左边的兄弟栏）是否收起；undefined = 该页面不提供历史栏，不渲染开关 */
    historyCollapsed?: boolean;
    /** 会话历史栏名称，进 tooltip 文案 */
    historyLabel?: string;
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
  {
    historyLabel: '会话历史',
    aiLabel: 'AI 助手',
    navLabel: '资源树',
    aiHotkey: 'Ctrl+U',
    consoleLabel: '编译输出'
  }
);

const emit = defineEmits<{
  (e: 'update:historyCollapsed', value: boolean): void;
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
  /* 34px：与 AI 栏头、tab 条、资源树头、抽屉 tab 齐成一条水平线 */
  height: 34px;
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
    width: 26px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: var(--db-r-tag);
    background: transparent;
    /* 图标走实心/描边结合的面板图形：略大、略重，观感更饱满 */
    color: var(--db-ink-secondary);
    opacity: 0.85;
    font-size: 17px;
    cursor: pointer;
    transition:
      background-color var(--db-dur-fast) var(--db-ease),
      color var(--db-dur-fast) var(--db-ease),
      opacity var(--db-dur-fast) var(--db-ease);

    &:hover {
      background: var(--db-bg-hover);
      color: var(--db-ink);
      opacity: 1;
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
    border-radius: var(--db-r-pill);
    background: var(--el-color-danger, #f56c6c);
    color: #fff;
    font-size: 10px;
    font-weight: 600;
    line-height: 15px;
    text-align: center;
    pointer-events: none;
    font-variant-numeric: tabular-nums;
  }
}
</style>
