<!--
  失效资源只读占位（2026-11-03，docs/databus-workspace-tabs.md §15 阶段一）。
  恢复的旧 tab 引用的实体已不存在（或当前账号无权查看）时，由宿主 pane 渲染本组件替代真实内容；
  自身不发任何请求，避免触发会抛异常的业务接口，从而不再弹「连接器不存在」之类的红条。
  文案并列「已删除」与「无权查看」两种成因，不武断断言——列表为空 ≠ 资源被删。
-->
<template>
  <section class="rmp">
    <el-empty :image-size="88">
      <template #description>
        <p class="rmp__title">{{ title }}</p>
        <p class="rmp__text">{{ reasonText }}</p>
        <p v-if="checkedAt" class="rmp__time">校验时间：{{ checkedAt }}</p>
      </template>
    </el-empty>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    /** 资源类别，只用于文案 */
    kind: 'connector' | 'component' | 'chain' | 'market';
    /** 页签标题（形如 jdbc-mysql · v1.0.0） */
    title: string;
    /** missing＝查不到；denied＝明确无权限 */
    state?: 'missing' | 'denied';
    /** 校验时间文案（可选，由宿主填入） */
    checkedAt?: string;
  }>(),
  { state: 'missing', checkedAt: '' }
);

const KIND_LABEL: Record<'connector' | 'component' | 'chain' | 'market', string> = {
  connector: '连接器包',
  component: '组件',
  chain: '链路',
  market: '物料'
};

const reasonText = computed(() => {
  const label = KIND_LABEL[props.kind];
  return props.state === 'denied'
    ? `当前账号无权查看该${label}，或该${label}已不存在。`
    : `该${label}已不存在（可能已被卸载或删除），也可能当前账号无权查看。`;
});
</script>

<style lang="scss" scoped>
.rmp {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 透明：底色由工作台面板统一铺（与 pane 口径一致） */
  background: transparent;
}

.rmp__title {
  margin-bottom: 6px;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.rmp__text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.rmp__time {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
