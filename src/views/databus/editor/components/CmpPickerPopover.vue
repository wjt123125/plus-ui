<template>
  <template v-if="ctrl.picker.visible">
    <div class="cmp-picker-mask" @click="ctrl.closePicker()" />
    <div
      class="cmp-picker-popover"
      :style="{ left: `${ctrl.picker.x}px`, top: `${ctrl.picker.y}px` }"
      @click.stop
    >
      <div class="cmp-picker-popover__header">
        <span class="cmp-picker-popover__title">{{ modeLabel[ctrl.picker.mode] }}</span>
        <button type="button" class="cmp-picker-popover__close" @click="ctrl.closePicker()">
          <el-icon><Close /></el-icon>
        </button>
      </div>
      <!-- 推荐区：score ≥ 75 -->
      <template v-if="recommended.length > 0">
        <div class="cmp-picker-popover__section-label">推荐</div>
        <div class="cmp-picker-popover__grid">
          <el-tooltip
            v-for="item in recommended"
            :key="item.def.type"
            :content="`${item.def.label}（${item.def.type}）\n${item.def.desc}`"
            placement="right"
            :show-after="300"
          >
            <div class="cmp-picker-popover__item is-recommended" @click="ctrl.pickDef(item.def.type)">
              <span class="cmp-picker-popover__badge">推荐</span>
              <span class="cmp-picker-popover__icon" :style="{ backgroundColor: item.def.color }">
                <SvgIcon :icon-class="item.def.icon" />
              </span>
              <span class="cmp-picker-popover__label">{{ item.def.short ?? item.def.label }}</span>
            </div>
          </el-tooltip>
        </div>
      </template>

      <!-- 更多区：score < 75 -->
      <template v-if="others.length > 0">
        <div class="cmp-picker-popover__section-label">更多</div>
        <div class="cmp-picker-popover__grid">
          <el-tooltip
            v-for="item in others"
            :key="item.def.type"
            :content="`${item.def.label}（${item.def.type}）\n${item.def.desc}`"
            placement="right"
            :show-after="300"
          >
            <div class="cmp-picker-popover__item" @click="ctrl.pickDef(item.def.type)">
              <span class="cmp-picker-popover__icon" :style="{ backgroundColor: item.def.color }">
                <SvgIcon :icon-class="item.def.icon" />
              </span>
              <span class="cmp-picker-popover__label">{{ item.def.short ?? item.def.label }}</span>
            </div>
          </el-tooltip>
        </div>
      </template>
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue';
import { Close } from '@element-plus/icons-vue';
import { getRecommendations } from '../cmp-recommend';
import { useCanvasController } from '../composables/useCanvasController';
import type { PickerMode } from '../composables/useCanvasController';

defineOptions({ name: 'CmpPickerPopover' });

const ctrl = useCanvasController();

const all = computed(() =>
  getRecommendations(
    ctrl.picker.mode,
    ctrl.picker.anchorDefType,
    ctrl.picker.excludedTypes
  )
);

/** 推荐阈值：score ≥ 此值归入推荐区 */
const RECOMMEND_SCORE_THRESHOLD = 75;

const recommended = computed(() => all.value.filter((item) => item.score >= RECOMMEND_SCORE_THRESHOLD));
const others = computed(() => all.value.filter((item) => item.score < RECOMMEND_SCORE_THRESHOLD));

/** 模式中文名，用于标题 */
const modeLabel: Record<PickerMode, string> = {
  prepend: '上方插入',
  append: '下方插入',
  replace: '替换节点',
  insertEdge: '线上插入'
};

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && ctrl.picker.visible) {
    ctrl.closePicker();
  }
}
window.addEventListener('keydown', onKeydown);
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
.cmp-picker-mask {
  position: fixed;
  inset: 0;
  z-index: 1997;
}

.cmp-picker-popover {
  position: fixed;
  z-index: 1998;
  width: 220px;
  padding: 10px;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  box-shadow: 0 6px 24px rgb(0 0 0 / 14%);
}

.cmp-picker-popover__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.cmp-picker-popover__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.cmp-picker-popover__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  color: var(--el-text-color-placeholder);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 4px;
  transition: color 0.15s, background-color 0.15s;
}

.cmp-picker-popover__close:hover {
  color: var(--el-text-color-primary);
  background-color: var(--el-fill-color-light);
}

.cmp-picker-popover__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.cmp-picker-popover__item {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  cursor: pointer;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.cmp-picker-popover__item:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 8px rgb(0 0 0 / 8%);
}

.cmp-picker-popover__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin-right: 6px;
  color: #fff;
  font-size: 12px;
  border-radius: 4px;
}

.cmp-picker-popover__label {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  color: var(--el-text-color-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 分区标题 ── */
.cmp-picker-popover__section-label {
  margin-top: 8px;
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--el-text-color-placeholder);
}

.cmp-picker-popover__section-label:first-child {
  margin-top: 0;
}

/* ── 推荐徽章 ── */
.cmp-picker-popover__badge {
  position: absolute;
  top: -5px;
  right: -5px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 600;
  line-height: 14px;
  color: #fff;
  background-color: var(--el-color-primary);
  border-radius: 7px;
}

/* ── 推荐卡片 ── */
.cmp-picker-popover__item.is-recommended {
  position: relative;
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
}

.cmp-picker-popover__item.is-recommended:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 8px rgb(var(--el-color-primary-rgb) / 20%);
}
</style>
