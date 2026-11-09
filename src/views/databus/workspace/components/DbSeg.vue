<!--
  分段控件（databus 唯一实现）：
  浅灰胶囊轨道 + 白色浮起选中项 + 滑动 thumb。thumb 在几何测量后 translate3d 平移，
  切段时 0.22s 滑过去；段宽由内容决定，所以位移必须测量而不能用纯 CSS 推算。
  外观由全局 _databus-tabs.scss 的 .db-seg 族提供，组件只负责测量与受控交互。
-->
<template>
  <div ref="trackRef" class="db-seg">
    <span class="db-seg__thumb" :class="{ 'is-ready': ready }" :style="thumbStyle" aria-hidden="true" />
    <button
      v-for="option in options"
      :key="String(option.value)"
      type="button"
      class="db-seg__item"
      :class="[itemClass, { 'is-active': option.value === modelValue }]"
      @click="pick(option)"
    >
      <slot name="item" :option="option">
        {{ option.label }}
      </slot>
    </button>
  </div>
</template>

<script lang="ts">
/** 分段项：value 与宿主模型同型；badge 只给 #item 插槽消费，缺省渲染纯文案 */
export interface DbSegOption {
  label: string;
  value: string | number;
  badge?: string | number;
}
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

const props = defineProps<{
  options: DbSegOption[];
  /** 当前选中值（受控）：只读，点击只上抛，是否真的切换由宿主决定（如弃稿确认可取消） */
  modelValue: string | number | null | undefined;
  /** 额外段类名（如终端 ws-term__tab、组件卡头 cf-seg），轨道类名直接走 attrs */
  itemClass?: string;
}>();

defineSlots<{
  /** 自定义段内容（角标/红点等），缺省渲染 label */
  item?: (props: { option: DbSegOption }) => unknown;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string | number];
  change: [value: string | number];
}>();

const trackRef = ref<HTMLElement>();
/** 首帧直接落位，避免 thumb 从 (0,0) 滑入的假动画 */
const ready = ref(false);
/** thumb 相对轨道的盒模型（用 offset* 与 absolute left:0 同基准，不受 transform 影响） */
const box = reactive({ x: 0, y: 0, w: 0, h: 0 });

const thumbStyle = computed(() => ({
  width: `${box.w}px`,
  height: `${box.h}px`,
  transform: `translate3d(${box.x}px, ${box.y}px, 0)`
}));

function measure() {
  const track = trackRef.value;
  if (!track) {
    return;
  }
  const active = track.querySelector<HTMLElement>(':scope > .db-seg__item.is-active');
  if (!active) {
    ready.value = false;
    return;
  }
  box.x = active.offsetLeft;
  box.y = active.offsetTop;
  box.w = active.offsetWidth;
  box.h = active.offsetHeight;
  if (!ready.value) {
    requestAnimationFrame(() => {
      ready.value = true;
    });
  }
}

function pick(option: DbSegOption) {
  if (option.value === props.modelValue) {
    return;
  }
  emit('update:modelValue', option.value);
  emit('change', option.value);
}

watch(
  () => [props.modelValue, props.itemClass],
  () => nextTick(measure)
);
watch(
  () => props.options,
  () => nextTick(measure),
  { deep: true }
);

let observer: ResizeObserver | undefined;

onMounted(() => {
  void nextTick(measure);
  if (typeof ResizeObserver !== 'undefined' && trackRef.value) {
    observer = new ResizeObserver(() => measure());
    observer.observe(trackRef.value);
  }
  // 字体迟到会改变段宽（首次测量可能落在字体 swap 之前）
  void document.fonts?.ready.then(() => measure());
});

onBeforeUnmount(() => {
  observer?.disconnect();
});
</script>