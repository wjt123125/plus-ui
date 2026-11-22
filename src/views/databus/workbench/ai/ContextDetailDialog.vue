<!--
  上下文详情浮层（§22.5）：点卡片后就近冒出来（带小三角），不做居中弹窗。
  文字摘录展示引文；整件资源展示名称 + #编码。两种都可在原地改评论，
  底部按钮的文案由父级按资源类型给出（跳转到消息 / 打开链路 / 查看组件 / 打开连接器包），
  跳转语义留在父级，浮层只负责展示与收集评论。
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
      <template v-if="resource">
        <div class="ctx-detail__title">{{ item.title }}</div>
        <div v-if="code" class="ctx-detail__code">
          <span class="ctx-detail__hash" aria-hidden="true">#</span>{{ code }}
        </div>
      </template>
      <div v-else class="ctx-detail__quote">{{ quote }}</div>
      <input
        v-model="note"
        class="ctx-detail__note"
        type="text"
        placeholder="写一句评论（可留空）"
        @blur="saveNote"
        @keydown.enter.prevent="handleVisibleChange(false)"
      />
      <div v-if="jumpLabel" class="ctx-detail__foot">
        <button type="button" class="ctx-detail__jump" @click="handleJump">{{ jumpLabel }}</button>
      </div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { isResourceContext, type AgentContextItem } from './contextTypes';
import { useAgentContext } from './useAgentContext';

defineOptions({ name: 'ContextDetailDialog' });

const props = defineProps<{
  visible: boolean;
  item: AgentContextItem | null;
  /** 浮层贴着哪张卡片冒出来；由点卡片的 DOM 事件带进来 */
  anchor: HTMLElement | null;
  /** 底部跳转按钮文案；空串表示不显示。具体跳到哪由父级决定 */
  jumpLabel?: string;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  /** 点了跳转：回传引文原文，父级按资源类型决定是跳消息还是打开资源 */
  jump: [text: string];
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

/** 整件资源：展示名称 + 编码，不展示引文 */
const resource = computed(() => (props.item ? isResourceContext(props.item) : false));
const code = computed(() => props.item?.payload?.code ?? '');

/** 只展示选中的那段；两行截断，原文再长也与用户无关 */
const quote = computed(() => {
  const payload = props.item?.payload;
  return payload?.text || props.item?.preview || props.item?.title || '';
});

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

function handleJump(): void {
  if (!props.item) {
    return;
  }
  saveNote();
  emit('jump', quote.value);
  handleVisibleChange(false);
}
</script>

<style lang="scss" scoped>
.ctx-detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 资源标题：与输入框同一套字，最多两行 */
.ctx-detail__title {
  display: -webkit-box;
  overflow: hidden;
  color: var(--el-text-color-primary);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.6;
  word-break: break-word;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

/* 资源编码：等宽 + 弱化的 #，与 hover 卡同一口径 */
.ctx-detail__code {
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
}

.ctx-detail__hash {
  margin-right: 2px;
  color: var(--el-text-color-placeholder);
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
