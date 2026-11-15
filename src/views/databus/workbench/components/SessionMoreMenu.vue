<template>
  <el-dropdown
    trigger="click"
    placement="bottom-end"
    popper-class="db-menu-popper"
    :disabled="disabled"
    @command="(cmd: string) => emit('command', cmd)"
  >
    <el-button
      size="small"
      text
      class="db-more__btn"
      :loading="loading"
      :aria-label="ariaLabel"
      @click.stop
    >
      <!-- 实心横排三点（跨页规范，2026-11-14）：直接内联 SVG，不吃图标字体/子集 -->
      <svg class="db-more__dots" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <circle cx="2.5" cy="8" r="1.1" fill="currentColor" />
        <circle cx="8" cy="8" r="1.1" fill="currentColor" />
        <circle cx="13.5" cy="8" r="1.1" fill="currentColor" />
      </svg>
    </el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          v-for="item in items"
          :key="item.command"
          :class="['db-menu-item', item.tone ? `is-${item.tone}` : '']"
          :command="item.command"
          :divided="item.divided"
        >
          <SvgIcon :icon-class="item.icon" /><span>{{ item.label }}</span>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
/**
 * 共享「更多」菜单：只负责三点按钮与菜单规范，具体命令由调用方在 items 里声明、在 command 事件里处理。
 * 组件不内置任何业务动作，也没有默认菜单项——各页的权限判断留在自己页面。
 *
 * 规范见 assets/styles/databus/_element.scss 的 .db-menu-popper / .db-menu-item：
 * 30px 行高、7px 圆角、图标 15px 且只染图标，危险项整项变红。
 */
withDefaults(
  defineProps<{
    /** 菜单项：command 回传、label 文案、icon 图标、tone 决定图标配色（danger 整项红） */
    items: Array<{
      command: string;
      label: string;
      icon: string;
      tone?: 'primary' | 'success' | 'warning' | 'danger';
      divided?: boolean;
    }>;
    /** 按钮 loading（如开发目录连接器重载中） */
    loading?: boolean;
    /** 整体禁用 */
    disabled?: boolean;
    /** 无障碍名称 */
    ariaLabel?: string;
  }>(),
  { loading: false, disabled: false, ariaLabel: '更多操作' }
);

const emit = defineEmits<{
  /** 点了某个菜单项，回传该 item 的 command */
  (e: 'command', command: string): void;
}>();
</script>

<style lang="scss" scoped>
.db-more {
  &__btn {
    color: var(--el-text-color-secondary);

    &:hover {
      color: var(--el-color-primary);
    }
  }

  &__btn:hover &__dots {
    color: var(--el-color-primary);
  }
}
</style>