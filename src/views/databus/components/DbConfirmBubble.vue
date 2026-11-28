<!--
  气泡二次确认（databus 通用件）。
  破坏性/生效类动作在触发处确认：箭头指向触发元素，用户视线不用跳到屏幕中央。

  用法（触发元素放进默认插槽，点击即开气泡）：
    <DbConfirmBubble content="确认删除该连接？" danger @confirm="handleDelete(row)">
      <el-button link type="danger">删除</el-button>
    </DbConfirmBubble>

  需要标题、非危险动作、改按钮文案时按需传 props；确认后气泡立即关闭，
  业务失败由调用方用 ElMessage 提示。
  键盘：Esc 等价点「取消」（关闭并触发 cancel），确认/回车不做隐式确认。
-->
<template>
  <el-popover
    v-model:visible="visible"
    :trigger="popoverTrigger"
    :placement="placement"
    :width="width"
    :disabled="disabled"
    :show-arrow="true"
    :hide-after="0"
    popper-class="db-scope db-confirm-bubble"
  >
    <template #reference>
      <slot />
    </template>
    <div class="db-confirm-bubble__panel">
      <p v-if="title" class="db-confirm-bubble__title">{{ title }}</p>
      <p class="db-confirm-bubble__text">{{ content }}</p>
      <div class="db-confirm-bubble__actions">
        <button type="button" class="db-confirm-bubble__btn" @click="onCancel">
          {{ cancelText }}
        </button>
        <button
          type="button"
          class="db-confirm-bubble__btn is-solid"
          :class="{ 'is-danger': danger }"
          @click="onConfirm"
        >
          {{ confirmText }}
        </button>
      </div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    /** 确认正文，一到两句，超长文案请改用弹窗 */
    content: string;
    /** 可选标题，短句 */
    title?: string;
    confirmText?: string;
    cancelText?: string;
    /** 破坏性动作：确认键用系统红 */
    danger?: boolean;
    /** 气泡宽度（px），正文长时适当放大 */
    width?: number;
    placement?:
      | 'top'
      | 'top-start'
      | 'top-end'
      | 'bottom'
      | 'bottom-start'
      | 'bottom-end'
      | 'left'
      | 'right';
    /** 触发方式：默认 click；需要「业务代码判断后再开」的场景用 manual + open() */
    trigger?: 'click' | 'focus' | 'hover' | 'manual';
    disabled?: boolean;
  }>(),
  {
    title: '',
    confirmText: '确定',
    cancelText: '取消',
    danger: false,
    width: 248,
    placement: 'top',
    trigger: 'click',
    disabled: false
  }
);

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

/** el-popover 没有 manual 触发值：空数组=不绑任何触发事件，显隐完全由 open()/close() 控制 */
const popoverTrigger = computed(() => (props.trigger === 'manual' ? [] : props.trigger));

const visible = ref(false);

function onConfirm() {
  visible.value = false;
  emit('confirm');
}

function onCancel() {
  visible.value = false;
  emit('cancel');
}

/**
 * Esc 等价「取消」：气泡 teleport 到 body、焦点仍在触发元素上，所以挂 document 级监听；
 * 只让打开中的实例响应，并在捕获阶段拦下，避免同一次 Esc 再触发工作台/编辑器的全局快捷键。
 */
function onDocKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.isComposing || !visible.value) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  onCancel();
}

onMounted(() => document.addEventListener('keydown', onDocKeydown, true));
onBeforeUnmount(() => document.removeEventListener('keydown', onDocKeydown, true));

defineExpose({
  open: () => (visible.value = true),
  close: () => (visible.value = false)
});
</script>

<style lang="scss" scoped>
.db-confirm-bubble {
  &__panel {
    padding: 2px;
  }

  &__title {
    margin: 0 0 4px;
    font-size: var(--db-fs-md, 13px);
    font-weight: 600;
    line-height: 1.5;
    color: var(--db-ink, #1c1c1e);
  }

  &__text {
    margin: 0;
    font-size: var(--db-fs-sm, 12px);
    line-height: 1.65;
    color: var(--db-ink-muted, #6e6e73);
    white-space: pre-line;
    word-break: break-word;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 10px;
  }

  &__btn {
    height: 26px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--db-r-tag, 7px);
    background: transparent;
    color: var(--db-ink-secondary, #3a3a3c);
    font-size: var(--db-fs-sm, 12px);
    line-height: 26px;
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;

    &:hover {
      background: var(--db-bg-hover, rgba(120, 120, 128, 0.08));
    }

    &.is-solid {
      background: var(--db-accent, #1c1c1e);
      color: var(--db-on-accent, #ffffff);

      &:hover {
        background: var(--db-accent-hover, #3a3a3c);
      }

      &.is-danger {
        background: var(--db-red, #ff3b30);

        &:hover {
          background: var(--db-red, #ff3b30);
          filter: brightness(0.94);
        }
      }
    }
  }
}
</style>