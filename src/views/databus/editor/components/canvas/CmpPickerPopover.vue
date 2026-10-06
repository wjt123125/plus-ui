<!--
  组件选择弹层的薄外壳：只负责遮罩、锚点定位与控制器接线。
  定位规则：锚点（「+」圆心 / 右键光标）右下优先，留 GAP 净间距；
  右/下空间不足时翻到锚点左/上侧；最终夹取在视口内。
  弹层尺寸在渲染后实测，不预设固定高度——矮视口下预设高度会把垂直偏移夹没。
  面板本体（搜索/推荐/Tab/键盘）全部内聚在 common/CmpPickerPanel。
-->
<template>
  <template v-if="ctrl.picker.visible">
    <div class="cmp-picker-mask" @click="ctrl.closePicker()" />
    <div
      ref="popRef"
      class="cmp-picker-popover"
      :style="popStyle"
      @click.stop
    >
      <CmpPickerPanel
        :mode="ctrl.picker.mode"
        :anchor-def-type="ctrl.picker.anchorDefType"
        :excluded-types="ctrl.picker.excludedTypes"
        @pick="onPick"
        @close="ctrl.closePicker"
      />
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useCanvasController } from '../../composables/useCanvasController';
import { recordCmpPick } from '../../composables/useCmpRecommend';
import CmpPickerPanel from '../common/CmpPickerPanel.vue';

defineOptions({ name: 'CmpPickerPopover' });

const ctrl = useCanvasController();

/** 锚点与弹层角的净间距：「+」圆 11px + 光环 3px，24px 保证圆圈完整露出且不贴弹窗 */
const GAP = 24;
/** 弹层距视口边缘的最小留白 */
const MARGIN = 8;

const popRef = ref<HTMLElement | null>(null);
/** 实测尺寸后算出的最终左上角；null 时先隐藏，避免一帧错位闪现 */
const pos = ref<{ x: number; y: number } | null>(null);

const popStyle = computed(() => ({
  left: `${pos.value?.x ?? ctrl.picker.x}px`,
  top: `${pos.value?.y ?? ctrl.picker.y}px`,
  visibility: (pos.value ? 'visible' : 'hidden') as 'visible' | 'hidden'
}));

/** 渲染后实测弹层宽高：右下优先，对侧空间够就翻转，最后夹进取进视口 */
function place() {
  const el = popRef.value;
  if (!el) return;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ax = ctrl.picker.x;
  const ay = ctrl.picker.y;

  let x = ax + GAP;
  let y = ay + GAP;
  if (x + w > vw - MARGIN) x = ax - GAP - w;
  if (y + h > vh - MARGIN) y = ay - GAP - h;
  x = Math.min(Math.max(x, MARGIN), Math.max(MARGIN, vw - w - MARGIN));
  y = Math.min(Math.max(y, MARGIN), Math.max(MARGIN, vh - h - MARGIN));

  pos.value = { x, y };
}

watch(
  () => ctrl.picker.visible,
  async (visible) => {
    if (visible) {
      pos.value = null;
      await nextTick();
      place();
      window.addEventListener('resize', place);
    } else {
      window.removeEventListener('resize', place);
    }
  }
);

onBeforeUnmount(() => window.removeEventListener('resize', place));

/**
 * 选中组件：先记真账（后端全局共现 + 本地个人频次），再执行插入。
 * 必须在 pickDef 之前取 mode/anchor——pickDef 内部会先 closePicker 清空弹层状态。
 */
function onPick(defType: string) {
  const { mode, anchorDefType } = ctrl.picker;
  recordCmpPick(mode, anchorDefType, defType);
  ctrl.pickDef(defType);
}
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
}
</style>
