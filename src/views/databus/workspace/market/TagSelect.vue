<!--
  标签平铺点选器（market §四 2026-10-23 定稿：候选平铺点选，非下拉 select）。
  专做多选标签：chips 点选 toggle ＋输入回车新建；已选值不在候选集时补渲染 chip
  （切换分类换池不丢已选）。分类单选场景由 MarketPublishDialog 内联 chips 承担。
-->
<template>
  <div class="tag-select">
    <div v-if="chips.length" class="tag-select__list">
      <button
        v-for="opt in chips"
        :key="opt.value"
        type="button"
        class="tag-select__chip"
        :class="{ 'is-active': isActive(opt.value) }"
        :disabled="disabled"
        @click="toggle(opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>
    <p v-else class="tag-select__empty">{{ emptyText }}</p>
    <el-input
      v-model="draft"
      class="tag-select__create"
      size="small"
      maxlength="30"
      :placeholder="placeholder"
      :disabled="disabled"
      @keyup.enter="create"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

defineOptions({ name: 'TagSelect' });

interface TagOption {
  value: string;
  label: string;
}

const props = withDefaults(
  defineProps<{
    /** 已选标签（多选） */
    modelValue?: string[];
    /** 候选池（分类↔标签联动时由父切换） */
    options?: TagOption[];
    placeholder?: string;
    emptyText?: string;
    disabled?: boolean;
  }>(),
  {
    placeholder: '输入标签后回车新建',
    emptyText: '暂无候选'
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', tags: string[]): void;
}>();

const draft = ref('');
/** 本地新建项（候选池切换后仍保留渲染） */
const created = ref<TagOption[]>([]);

const selected = computed<string[]>(() => props.modelValue ?? []);

/** 候选 ∪ 新建 ∪ 已选补项（已选但不在前两者的，补 chip 保显示） */
const chips = computed<TagOption[]>(() => {
  const base = [...props.options, ...created.value];
  const seen = new Set(base.map((o) => o.value));
  const extra = selected.value
    .filter((v) => !seen.has(v))
    .map((v) => ({ value: v, label: v }));
  return [...base, ...extra];
});

function isActive(value: string): boolean {
  return selected.value.includes(value);
}

function toggle(value: string) {
  const list = [...selected.value];
  const idx = list.indexOf(value);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.push(value);
  }
  emit('update:modelValue', list);
}

/** 回车新建：候选池已有同名标签则只选中，不重复造 chip */
function create() {
  const text = draft.value.trim();
  if (!text) {
    return;
  }
  draft.value = '';
  const exist = chips.value.find((o) => o.label === text);
  if (!exist) {
    created.value.push({ value: text, label: text });
  }
  const value = exist ? exist.value : text;
  if (!selected.value.includes(value)) {
    emit('update:modelValue', [...selected.value, value]);
  }
}
</script>

<style lang="scss" scoped>
.tag-select {
  width: 100%;

  &__list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 6px;
  }

  &__chip {
    appearance: none;
    height: 26px;
    padding: 0 12px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-light, #f5f7fa);
    border: none;
    border-radius: 13px;
    cursor: pointer;
    transition:
      color 0.15s,
      background-color 0.15s;

    &:hover:not(:disabled) {
      color: var(--el-color-primary);
    }

    &.is-active {
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
  }

  &__empty {
    margin: 0 0 6px;
    font-size: 12px;
    line-height: 24px;
    color: var(--el-text-color-placeholder, #a8abb2);
  }
}
</style>
