<!-- 思考过程折叠块：思考阶段自动展开，正文开始后收起，用户可手动点开 -->
<template>
  <div class="md-think" :class="{ 'is-open': open, 'is-live': streaming }">
    <button type="button" class="md-think__head" @click="open = !open">
      <span class="md-think__label">{{ label }}</span>
      <span class="md-think__chev" />
    </button>
    <div v-if="open" class="md-think__body">{{ text }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    text: string;
    /** 思考阶段进行中：自动展开；转 false 时自动收起并结算用时 */
    streaming?: boolean;
  }>(),
  { streaming: false }
);

const open = ref(props.streaming);
const seconds = ref(0);

let startedAt = 0;
let timer: ReturnType<typeof setInterval> | undefined;

/** 计时只为在标题里给出「用时 N 秒」，与 Trae 的观感一致 */
function startTimer() {
  if (timer || startedAt) return;
  startedAt = Date.now();
  timer = setInterval(() => {
    seconds.value = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  }, 500);
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
  if (startedAt) {
    seconds.value = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  }
}

watch(
  () => props.streaming,
  (value) => {
    open.value = value;
    if (value) {
      startTimer();
    } else {
      stopTimer();
    }
  }
);

onMounted(() => {
  if (props.streaming) startTimer();
});
onBeforeUnmount(stopTimer);

const label = computed(() => {
  if (props.streaming) return '思考中';
  return seconds.value ? `已深度思考（用时 ${seconds.value} 秒）` : '思考过程';
});
</script>

<style scoped lang="scss">
.md-think {
  margin: 0 0 8px;
}

.md-think__head {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 2px 6px 2px 0;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 12px;
  line-height: 1.6;
  text-align: left;
  cursor: pointer;
}

.md-think__head:hover {
  color: var(--db-ink-secondary, #3a3a3c);
}

.md-think__label {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.md-think.is-live .md-think__label {
  animation: md-think-breathe 1.6s ease-in-out infinite;
}

@keyframes md-think-breathe {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}

/* 用边框画箭头，不引图标依赖 */
.md-think__chev {
  flex: none;
  width: 6px;
  height: 6px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg) translateY(-1px);
  transition: transform 0.15s;
}

.md-think.is-open .md-think__chev {
  transform: rotate(-135deg) translateY(-1px);
}

.md-think__body {
  max-height: 260px;
  overflow: auto;
  margin-top: 4px;
  padding-left: 10px;
  border-left: 2px solid var(--db-rule, rgba(60, 60, 67, 0.12));
  color: var(--db-ink-muted, #6e6e73);
  font-size: 12.5px;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>