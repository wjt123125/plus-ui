<!--
  编辑器身份卡（IDE 化去顶栏后，仅全屏 editor 宿主渲染）：
  返回 + 当前链路名 + 未保存脏点。画布内浮层，不占网格行。
  workbench 宿主不渲染——链路身份由中栏 tab（标题 + 脏点）承载。
  物料区折叠时右移 38px，与左上角 palette-expand 浮动钮并排不重叠。
-->
<template>
  <div class="editor-identity" :class="{ 'is-shifted': collapsed }">
    <button type="button" class="editor-identity__back" title="返回链路列表" @click="emit('back')">
      <el-icon><ArrowLeft /></el-icon>
    </button>
    <span class="editor-identity__name" :title="chainName">{{ chainName || '未命名链路' }}</span>
    <span
      v-if="dirty"
      class="editor-identity__dot"
      title="有未保存改动（Ctrl+S 保存）"
    />
  </div>
</template>

<script setup lang="ts">
import { ArrowLeft } from '@element-plus/icons-vue';

defineOptions({ name: 'EditorIdentityCard' });

defineProps<{
  chainName: string;
  /** 未保存改动（tab 脏点同源信号） */
  dirty: boolean;
  /** 物料区折叠：为左上角展开钮让位 */
  collapsed: boolean;
}>();

const emit = defineEmits<{ back: [] }>();
</script>

<style scoped>
.editor-identity {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 260px;
  height: 26px;
  padding: 0 8px 0 4px;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  box-shadow: 0 1px 4px rgb(0 0 0 / 12%);
  transition: left 0.2s ease;
}

/* 物料区折叠：展开钮占 left:12/宽 26/间隔 8，身份卡原位右移并排 */
.editor-identity.is-shifted {
  left: 46px;
}

.editor-identity__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  padding: 0;
  color: var(--el-text-color-regular);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 4px;
  transition: color 0.15s, background-color 0.15s;
}

.editor-identity__back:hover {
  color: var(--el-color-primary);
  background-color: var(--el-fill-color-light);
}

.editor-identity__name {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-identity__dot {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: var(--el-color-warning);
}
</style>
