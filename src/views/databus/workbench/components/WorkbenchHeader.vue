<template>
  <header class="wb-header">
    <!--
      工作台顶部 header（共享壳，§2.0）：侧栏开关的**唯一入口**。
      只放侧栏开关，不放标题/面包屑/全局操作——避免长成第二条工具栏，页面标题由外层框架提供。
      会话历史（AI 栏左边的兄弟栏）与底部面板开关都是 opt-in：仅在对应属性传入时渲染
      （undefined 视为该页面不提供），保持共享壳对其它使用方零影响。图标用 lucide 的 panel-*
      侧栏语义图形（DArrowLeft/Right 语义是「翻页」，不是「侧栏」），经 useLucideSubset
      离线注入，不触发 iconify 联网取图。
    -->
    <div class="wb-header__side">
      <!-- 会话历史栏开关（opt-in）：历史栏在 AI 助手左边，按钮也排在 AI 开关左边。
           用 history 语义图形而不是再放一颗 panel-left，避免两个同形侧栏钮分不清 -->
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
          <SvgIcon icon-class="lucide:history" />
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
      <!-- 后台管理入口（§7 改造点3，opt-in）：仅外部传入 adminEntry 才渲染；点按抛给页面跳转。
           按钮自身按角色隐藏（v-hasRole），非后台角色不可见；后台子页路由由 sys_menu 动态注册兜底 -->
      <el-tooltip
        v-if="adminEntry"
        :content="adminLabel"
        placement="bottom"
        :show-after="300"
      >
        <button
          type="button"
          class="wb-header__btn wb-header__admin"
          v-hasRole="['admin', 'databus_ops', 'databus_gov']"
          @click="emit('admin')"
        >
          <SvgIcon icon-class="lucide:settings" />
          <span class="wb-header__admin-text">{{ adminLabel }}</span>
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
    /** 是否渲染「后台管理」入口（opt-in，§7 改造点3）；undefined = 不渲染 */
    adminEntry?: boolean;
    /** 后台管理入口文案 */
    adminLabel?: string;
  }>(),
  {
    historyLabel: '会话历史',
    aiLabel: 'AI 助手',
    navLabel: '资源树',
    aiHotkey: 'Ctrl+U',
    consoleLabel: '编译输出',
    adminLabel: '后台管理'
  }
);

const emit = defineEmits<{
  (e: 'update:historyCollapsed', value: boolean): void;
  (e: 'update:aiCollapsed', value: boolean): void;
  (e: 'update:navCollapsed', value: boolean): void;
  (e: 'update:consoleOpen', value: boolean): void;
  /** 点「后台管理」：交页面跳转，header 保持零路由依赖（§7 改造点3） */
  (e: 'admin'): void;
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

  /* 后台管理入口（§7 改造点3）：icon + 文字，比纯图标钮略宽且独立语义 */
  &__admin {
    width: auto;
    gap: 5px;
    padding: 0 8px;
    margin-left: 6px;

    &-text {
      font-size: 12px;
      font-weight: 500;
    }
  }
}
</style>
