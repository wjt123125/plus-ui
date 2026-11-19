<!--
  上下文详情浮层（§22.5）：点卡片后就近冒出来（带小三角），不做居中弹窗。
  只回答「我当初引的是哪段、我写了什么评论」，再给一个跳回原处；类型 / 来源 / 偏移是给 AI 的元信息，不展示。
-->
<template>
  <el-popover
    :visible="visible"
    :virtual-ref="anchor ?? undefined"
    virtual-triggering
    :width="300"
    placement="bottom-start"
    :persistent="false"
    @update:visible="handleVisibleChange"
  >
    <div v-if="item" class="ctx-detail">
      <div class="ctx-detail__quote">{{ quote }}</div>
      <input
        v-model="note"
        class="ctx-detail__note"
        type="text"
        placeholder="写一句评论（可留空）"
        @blur="saveNote"
        @keydown.enter.prevent="handleVisibleChange(false)"
      />
      <div v-if="canReveal" class="ctx-detail__foot">
        <button type="button" class="ctx-detail__jump" @click="handleReveal">跳转到消息</button>
      </div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { AgentContextItem, AgentContextSource } from './contextTypes';
import { useAgentContext } from './useAgentContext';

defineOptions({ name: 'ContextDetailDialog' });

const props = defineProps<{
  visible: boolean;
  item: AgentContextItem | null;
  /** 浮层贴着哪张卡片冒出来；由点卡片的 DOM 事件带进来 */
  anchor: HTMLElement | null;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  /** 第二个参数是引文原文：回跳时要在目标容器里精确定位这段字，而不是整块闪 */
  reveal: [source: AgentContextSource, text: string];
}>();

const { updateNote } = useAgentContext();

const note = ref('');

watch(
  () => [props.visible, props.item] as const,
  ([visible, item]) => {
    if (visible) {
      note.value = item?.note ?? '';
    }
  },
  { immediate: true }
);

/** 只展示选中的那段；两行截断，原文再长也与用户无关 */
const quote = computed(() => {
  const payload = props.item?.payload;
  return payload?.text || props.item?.preview || props.item?.title || '';
});

/** 资源引用没有可跳转的正文位置，就不给这个按钮 */
const canReveal = computed(() => !!props.item?.source?.anchor);

/**
 * 已发消息里的卡片不在暂存区，updateNote 查不到；
 * 但消息持有的是同一批对象引用，直接写回对象即可同步卡片。
 */
function saveNote(): void {
  const item = props.item;
  if (!item) {
    return;
  }
  const next = note.value.trim();
  if (item.note === next) {
    return;
  }
  item.note = next;
  updateNote(item.id, next);
}

function handleVisibleChange(value: boolean): void {
  if (!value) {
    saveNote();
  }
  emit('update:visible', value);
}

function handleReveal(): void {
  const source = props.item?.source;
  if (!source) {
    return;
  }
  emit('reveal', source, quote.value);
  handleVisibleChange(false);
}
</script>

<style lang="scss" scoped>
.ctx-detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 灰色引文：像输入框里的占位提示，只露两行 */
.ctx-detail__quote {
  display: -webkit-box;
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.7;
  word-break: break-word;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

/* 评论沿用输入框样式：无边框，和上面的引文同一块底 */
.ctx-detail__note {
  width: 100%;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--el-text-color-primary);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.7;

  &::placeholder {
    color: var(--el-text-color-placeholder);
  }
}

.ctx-detail__foot {
  display: flex;
  justify-content: flex-end;
}

.ctx-detail__jump {
  padding: 4px 12px;
  border: 0;
  border-radius: 6px;
  background: var(--el-text-color-primary);
  color: var(--el-bg-color);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
  cursor: pointer;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.85;
  }
}
</style>
