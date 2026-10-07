<!-- 表单 Tab 标题：文案 + 校验失败红点（5 个 Tab 共用，样式自包含） -->
<template>
  <span class="cf-tab">
    {{ title }}
    <i v-if="invalid" class="cf-tab__dot" />
  </span>
</template>

<script setup lang="ts">
defineOptions({ name: 'TabLabel' });

defineProps<{
  title: string;
  invalid?: boolean;
}>();
</script>

<style lang="scss" scoped>
.cf-tab {
  display: inline-flex;
  align-items: center;
  font-style: normal;

  &__dot {
    width: 7px;
    height: 7px;
    margin-left: 5px;
    border-radius: 50%;
    background-color: var(--el-color-danger);
  }
}
</style>
