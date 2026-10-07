<!--
  Phosphor（ph）图标选择器：替换 RuoYi 通用 icon-select。

  通用 icon-select 的候选集来自本地 svg（requireIcons 的 import.meta.glob），永远选不到
  `ph:*`；一旦用户挑了本地 svg 名保存，icon 就从 iconify 契约静默漂移（refactor §4.2）。
  本控件数据源＝usePhIcons 动态加载的 ph 全集，回填值必然是 `ph:xxx`，契约不再漂移。

  交互：只读输入框样式的触发区（当前图标 + 名称 + 清空）→ 弹窗内关键字搜索 + 网格浏览，
  点选进入待确认态并在预览区实时放大显示，「确定」才写回 v-model。
  全集约 6000 个图标，网格只渲染前 MAX_RENDER 个，靠关键字缩小范围。
-->
<template>
  <div class="ph-picker">
    <div class="ph-picker__field" :class="{ 'is-disabled': disabled }" @click="open">
      <SvgIcon v-if="modelValue" :icon-class="modelValue" class="ph-picker__field-icon" />
      <span class="ph-picker__field-name" :class="{ 'is-empty': !modelValue }">
        {{ modelValue || '点击选择图标' }}
      </span>
      <el-icon v-if="modelValue && !disabled" class="ph-picker__field-clear" @click.stop="clear">
        <CircleClose />
      </el-icon>
      <el-icon v-else class="ph-picker__field-arrow"><ArrowDown /></el-icon>
    </div>

    <el-dialog
      v-model="visible"
      title="选择图标（Phosphor）"
      width="620px"
      append-to-body
      :close-on-click-modal="false"
    >
      <div class="ph-picker__panel">
        <div class="ph-picker__toolbar">
          <el-input
            v-model="keyword"
            placeholder="搜索图标名，如 pencil / arrow / database"
            clearable
            :prefix-icon="Search"
          />
          <div class="ph-picker__preview">
            <SvgIcon v-if="picked" :icon-class="picked" class="ph-picker__preview-icon" />
            <span class="ph-picker__preview-name" :class="{ 'is-empty': !picked }">
              {{ picked || '未选择' }}
            </span>
          </div>
        </div>

        <div v-if="error" class="ph-picker__state is-error">
          图标集加载失败
          <button type="button" class="ph-picker__retry" @click="retry">重试</button>
        </div>
        <div v-else-if="loading" class="ph-picker__state">图标集加载中…</div>
        <div v-else-if="filtered.length === 0" class="ph-picker__state">无匹配图标</div>
        <template v-else>
          <div class="ph-picker__grid">
            <button
              v-for="name in visibleNames"
              :key="name"
              type="button"
              class="ph-picker__cell"
              :class="{ 'is-picked': picked === withPrefix(name) }"
              :title="withPrefix(name)"
              @click="picked = withPrefix(name)"
            >
              <SvgIcon :icon-class="withPrefix(name)" />
            </button>
          </div>
          <div v-if="truncated" class="ph-picker__more">
            命中 {{ filtered.length }} 个，仅显示前 {{ MAX_RENDER }} 个，请输入关键字缩小范围
          </div>
        </template>
      </div>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :disabled="!picked" @click="confirm">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ArrowDown, CircleClose, Search } from '@element-plus/icons-vue';
import { usePhIcons } from '../../../editor/composables/usePhIcons';

defineOptions({ name: 'PhIconPicker' });

const props = withDefaults(
  defineProps<{
    /** 图标值（`ph:xxx`）；空串/null 表示未设置 */
    modelValue?: string | null;
    disabled?: boolean;
  }>(),
  {
    modelValue: '',
    disabled: false
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

/** 网格单页上限：全集约 6000 个，全量进 DOM 会卡死弹窗 */
const MAX_RENDER = 240;

const { phNames, loading, error, loadPhIcons, retryPhIcons, withPrefix } = usePhIcons();

const visible = ref(false);
const keyword = ref('');
/** 弹窗内的待确认值（点「确定」才写回 v-model） */
const picked = ref('');

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) {
    return phNames.value;
  }
  return phNames.value.filter((n) => n.toLowerCase().includes(kw));
});
const visibleNames = computed(() => filtered.value.slice(0, MAX_RENDER));
const truncated = computed(() => filtered.value.length > MAX_RENDER);

function open() {
  if (props.disabled) {
    return;
  }
  picked.value = props.modelValue ?? '';
  keyword.value = '';
  visible.value = true;
  // 弹窗内网格要全集；已加载时是同步返回的缓存
  void loadPhIcons();
}

function confirm() {
  emit('update:modelValue', picked.value);
  visible.value = false;
}

function clear() {
  emit('update:modelValue', '');
}

function retry() {
  void retryPhIcons();
}

onMounted(() => {
  // 触发区要渲染当前值（ph: 前缀走 iconify），未注入 collection 会联网取图
  void loadPhIcons();
});
</script>

<style lang="scss" scoped>
.ph-picker {
  width: 100%;

  &__field {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    height: 32px;
    padding: 0 11px;
    cursor: pointer;
    background-color: var(--el-fill-color-blank);
    border: 1px solid var(--el-border-color);
    border-radius: var(--el-border-radius-base);
    transition: border-color 0.15s;

    &:hover {
      border-color: var(--el-border-color-hover);
    }

    &.is-disabled {
      cursor: not-allowed;
      background-color: var(--el-fill-color-light);
    }
  }

  &__field-icon {
    font-size: 16px;
    color: var(--el-text-color-regular);
  }

  &__field-name {
    flex: 1;
    overflow: hidden;
    font-size: 14px;
    color: var(--el-text-color-regular);
    text-overflow: ellipsis;
    white-space: nowrap;

    &.is-empty {
      color: var(--el-text-color-placeholder);
    }
  }

  &__field-clear,
  &__field-arrow {
    color: var(--el-text-color-placeholder);
  }

  &__field-clear:hover {
    color: var(--el-text-color-secondary);
  }

  &__panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  &__toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__preview {
    display: flex;
    flex: none;
    align-items: center;
    gap: 6px;
    width: 180px;
    padding: 0 10px;
    border: 1px dashed var(--el-border-color);
    border-radius: var(--el-border-radius-base);
  }

  &__preview-icon {
    font-size: 22px;
    color: var(--el-color-primary);
  }

  &__preview-name {
    overflow: hidden;
    font-size: 12px;
    color: var(--el-text-color-regular);
    text-overflow: ellipsis;
    white-space: nowrap;

    &.is-empty {
      color: var(--el-text-color-placeholder);
    }
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
    gap: 4px;
    height: 320px;
    padding: 4px;
    overflow-y: auto;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);
  }

  &__cell {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 40px;
    padding: 0;
    font-size: 20px;
    color: var(--el-text-color-regular);
    cursor: pointer;
    background: none;
    border: 1px solid transparent;
    border-radius: 6px;

    &:hover {
      background-color: var(--el-fill-color-light);
    }

    &.is-picked {
      color: var(--el-color-primary);
      border-color: var(--el-color-primary);
      background-color: var(--el-color-primary-light-9);
    }
  }

  &__state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 320px;
    font-size: 13px;
    color: var(--el-text-color-secondary);

    &.is-error {
      color: var(--el-color-danger);
    }
  }

  &__retry {
    padding: 0;
    color: var(--el-color-primary);
    cursor: pointer;
    background: none;
    border: none;
  }

  &__more {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    text-align: center;
  }
}
</style>
