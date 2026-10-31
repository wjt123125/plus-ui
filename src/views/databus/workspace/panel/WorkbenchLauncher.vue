<!--
  中栏空态导航（对标 Trae 空态「打开工具」）：tab 全关时给空白工作台配入口，避免走成死路。
  视觉对齐参考截图：3 列定宽卡片（约 124×100）+ 16px 间距、无描边、卡片比面板略亮一档、
  图标为彩色字形（每卡一色，Trae 同款多点着色），标题大而重、副标题灰小。
  底色走 Element Plus 主题变量：深色主题下贴近截图（#202124 卡 / #1A1B1D 页），浅色主题自动出浅色版。
  卡片自身零业务：点击仅 emit('command')，由宿主分发到已有动作；无权限的卡片不渲染（与资源树头部同口径）。
-->
<template>
  <div class="wb-launcher">
    <div class="wb-launcher__inner">
      <h2 class="wb-launcher__title">打开工具</h2>
      <p class="wb-launcher__desc">选择入口，开启数据总线工作流</p>
      <div class="wb-launcher__grid">
        <button
          v-for="card in cards"
          :key="card.key"
          type="button"
          class="wb-launcher__card"
          @click="emit('command', card.key)"
        >
          <SvgIcon class="wb-launcher__icon" :icon-class="card.icon" :style="{ color: card.color }" />
          <span class="wb-launcher__label">{{ card.label }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { checkPermi } from '@/utils/permission';
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';
import type { LauncherCommand } from '../workbench.types';
import { LAUNCHER_ENTRIES } from './launcherEntries';

defineOptions({ name: 'WorkbenchLauncher' });

useLucideSubset();

const emit = defineEmits<{ (e: 'command', cmd: LauncherCommand): void }>();

/** 按权限过滤（checkPermi 依赖 useUserStore，须在 setup 内调用）；清单与「+」菜单共用一份 */
const cards = computed(() => LAUNCHER_ENTRIES.filter((c) => !c.perm || checkPermi(c.perm)));
</script>

<style lang="scss" scoped>
.wb-launcher {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: auto;
}

.wb-launcher__inner {
  width: 100%;
  max-width: 404px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.wb-launcher__title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: var(--el-text-color-primary, #1d2129);
}

.wb-launcher__desc {
  margin: 10px 0 28px;
  font-size: 13px;
  color: var(--el-text-color-secondary, #86909c);
}

/* 定宽 3 列（每列约 124px）+ 16px 间距，对齐参考截图节奏 */
.wb-launcher__grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.wb-launcher__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 100px;
  padding: 14px 8px;
  border: 0;
  border-radius: 12px;
  background: var(--el-fill-color-light, #f5f7fa);
  font-family: inherit;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    background-color 0.15s ease;

  &:hover {
    transform: translateY(-2px);
    background: var(--el-fill-color, #eef0f3);
  }

  &:active {
    transform: translateY(0);
  }
}

.wb-launcher__icon {
  font-size: 22px;
}

.wb-launcher__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary, #1d2129);
}

/* 深色主题精确贴合参考截图（面板 #1A1B1D、卡片 #202124） */
:global(html.dark) {
  .wb-launcher__card {
    background: #202124;

    &:hover {
      background: #26282b;
    }
  }
}
</style>
