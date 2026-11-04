<!--
  行状态圆点（2026-11-03 定）：颜色表达状态，正常态只留点不写字，异常才跟一小段短词。
  数据源由 marketDisplay 统一翻译（installRowStatus / marketItemRowStatus / connectorRowStatus），
  本组件只管「点 + 短词 + DEV 角标」三种呈现，不碰业务枚举。
-->
<template>
  <span class="db-status">
    <span class="db-status__dot" :class="`is-${tone}`" :title="title" />
    <span v-if="label" class="db-status__label">{{ label }}</span>
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
defineOptions({ name: 'StatusDot' });

withDefaults(
  defineProps<{
    /** 圆点颜色：绿=正常 / 黄=需要留意 / 红=异常 / 灰=不可用 */
    tone?: 'success' | 'warning' | 'danger' | 'info';
    /** 短词：只给异常态，正常态传空串 */
    label?: string;
    /** 开发目录装载角标 */
    dev?: boolean;
    /** 悬停完整说明 */
    title?: string;
  }>(),
  { tone: 'info', label: '', dev: false, title: '' }
);
</script>

<style lang="scss" scoped>
.db-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;

  &__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;

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

  &__label {
    font-size: 12px;
    line-height: 1.5;
    color: var(--el-text-color-secondary);
    white-space: nowrap;
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
