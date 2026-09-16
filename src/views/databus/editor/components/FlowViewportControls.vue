<template>
  <Panel position="bottom-left" class="fvc">
  <!-- 画布浮层按钮一律自绘 Element Plus 风格（决策见 project_memory）：
       zoomIn/zoomOut/zoomTo/fitView 直接调 useVueFlow store，
       边界禁用态与官方 Controls 同款比较（viewport.value.zoom vs minZoom/maxZoom）；
       全屏为编辑器整体全屏（含工具栏/物料/属性区），能力由 useEditorFullscreen inject -->
    <el-tooltip content="放大" placement="right">
      <button class="fvc__btn" :disabled="atMaxZoom" @click="zoomIn()">
        <span class="fvc__glyph">+</span>
      </button>
    </el-tooltip>
    <button class="fvc__btn fvc__zoom-text" title="点击恢复 100%" @click="zoomTo(1)">
      {{ zoomPercent }}
    </button>
    <el-tooltip content="缩小" placement="right">
      <button class="fvc__btn" :disabled="atMinZoom" @click="zoomOut()">
        <span class="fvc__glyph">−</span>
      </button>
    </el-tooltip>

    <span class="fvc__sep" />

    <el-tooltip content="适应窗口：缩放并居中全部节点" placement="right">
      <button class="fvc__btn" @click="fitView({ padding: 0.2, duration: 300 })">
        <el-icon><ScaleToOriginal /></el-icon>
      </button>
    </el-tooltip>
    <el-tooltip
      :content="isFullscreen ? '退出全屏 (Esc)' : '全屏：编辑器整体进入全屏（Esc 退出）'"
      placement="right"
    >
      <button class="fvc__btn" :class="{ 'is-active': isFullscreen }" @click="toggleFullscreen">
        <el-icon><FullScreen /></el-icon>
      </button>
    </el-tooltip>

    <span class="fvc__sep" />

    <el-tooltip
      :content="
        boxSelect
          ? '框选模式已开启：左键拖拽框选，空格+拖拽或中键平移画布'
          : '框选模式（默认 Shift+拖拽也可框选）'
      "
      placement="right"
    >
      <button class="fvc__btn" :class="{ 'is-active': boxSelect }" @click="toggleBoxSelect">
        <el-icon><Pointer /></el-icon>
      </button>
    </el-tooltip>
  </Panel>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { FullScreen, Pointer, ScaleToOriginal } from '@element-plus/icons-vue';
import { Panel, useVueFlow } from '@vue-flow/core';
import { useEditorFullscreen } from '../composables/useEditorFullscreen';

defineOptions({ name: 'FlowViewportControls' });

// useVueFlow() 解构出的 viewport/minZoom/maxZoom/selectionKeyCode/panOnDrag 均为 Ref，
// 必须 .value（官方 @vue-flow/controls 源码同款写法）
const {
  viewport,
  minZoom,
  maxZoom,
  zoomIn,
  zoomOut,
  zoomTo,
  fitView,
  selectionKeyCode,
  panOnDrag
} = useVueFlow();

const zoomPercent = computed(() => `${Math.round(viewport.value.zoom * 100)}`);
const atMinZoom = computed(() => viewport.value.zoom <= minZoom.value);
const atMaxZoom = computed(() => viewport.value.zoom >= maxZoom.value);

// 全屏宿主是页面根 .databus-editor（工具栏/物料/画布/属性区一起进入），
// 状态与动作由 index.vue 通过 useEditorFullscreen provide；黑底与撑高样式也在 index.vue
const { isFullscreen, toggleFullscreen } = useEditorFullscreen();

// 框选模式（@vue-flow/core 源码核实的判定链）：
// 仅把 selectionKeyCode 置 true 不够——panOnDrag 默认 true 时 shouldPanOnDrag 恒真、
// isSelecting 恒假，拖拽仍走 d3 平移。必须同步把 panOnDrag 改为 [1]（仅中键可平移），
// 左键拖拽才会启动框选；空格按下期间临时放开左键平移（官方 panActivationKeyCode=Space
// 的语义在数组模式下被 d3 按钮过滤拦截，故在此手动切换）
const boxSelect = ref(false);

function toggleBoxSelect() {
  boxSelect.value = !boxSelect.value;
  if (boxSelect.value) {
    selectionKeyCode.value = true;
    panOnDrag.value = [1];
  } else {
    selectionKeyCode.value = 'Shift';
    panOnDrag.value = true;
  }
}

function onSpaceDown(event: KeyboardEvent) {
  if (event.code === 'Space' && !event.repeat && boxSelect.value) {
    panOnDrag.value = true;
  }
}

function onSpaceUp(event: KeyboardEvent) {
  if (event.code === 'Space' && boxSelect.value) {
    panOnDrag.value = [1];
  }
}

// 空格按住期间切窗会丢失 keyup，失焦时必须复位，否则框选模式会"卡住"为平移
function onWindowBlur() {
  if (boxSelect.value) {
    panOnDrag.value = [1];
  }
}

onMounted(() => {
  window.addEventListener('keydown', onSpaceDown);
  window.addEventListener('keyup', onSpaceUp);
  window.addEventListener('blur', onWindowBlur);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onSpaceDown);
  window.removeEventListener('keyup', onSpaceUp);
  window.removeEventListener('blur', onWindowBlur);
  selectionKeyCode.value = 'Shift';
  panOnDrag.value = true;
});
</script>

<style scoped>
.fvc {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  margin: 10px;
  padding: 3px;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  box-shadow: 0 1px 4px rgb(0 0 0 / 12%);
}

.fvc__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  color: var(--el-text-color-regular);
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.fvc__btn .el-icon {
  font-size: 15px;
}

/* 缩放 +/− 用字符而非放大镜图标，更简洁 */
.fvc__glyph {
  font-size: 16px;
  font-weight: 500;
  line-height: 1;
}

.fvc__btn:hover:not(:disabled) {
  color: var(--el-color-primary);
  background-color: var(--el-fill-color);
}

.fvc__btn.is-active {
  color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
}

.fvc__btn:disabled {
  color: var(--el-text-color-disabled);
  cursor: not-allowed;
}

.fvc__zoom-text {
  width: 46px;
  font-size: 11px;
  font-weight: 600;
}

.fvc__sep {
  width: 18px;
  height: 1px;
  margin: 2px 0;
  background-color: var(--el-border-color-lighter);
}
</style>
