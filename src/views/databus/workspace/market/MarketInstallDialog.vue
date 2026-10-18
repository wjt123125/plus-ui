<!--
  物料安装（fork）弹窗：目录选择 → 复制 → 进树 → 记 installedFrom（设计正本 §五/§十三 step2）。
  只负责「选装到哪个目录」；复制与血缘由 MarketPane 调市场接口完成（loading 由父传入）。
  目录选项复用统一目录树（databus_directory 全量平表），value=0 为「未归组」根哨兵。
-->
<template>
  <el-dialog
    :model-value="visible"
    title="安装物料"
    width="480px"
    append-to-body
    @update:model-value="(v: boolean) => emit('update:visible', v)"
  >
    <div class="mkt-install">
      <div class="mkt-install__head">
        <SvgIcon
          class="mkt-install__icon"
          :icon-class="itemIcon"
          :style="{ color: item?.color || 'var(--el-color-primary)' }"
        />
        <div class="mkt-install__meta">
          <div class="mkt-install__name">{{ item?.name }}</div>
          <div class="mkt-install__code">{{ item?.codeDisplay }}</div>
        </div>
      </div>

      <el-form label-width="76px">
        <el-form-item label="安装到">
          <el-tree-select
            v-model="target"
            :data="options"
            node-key="value"
            check-strictly
            default-expand-all
            style="width: 100%"
            placeholder="未归组（默认）"
          />
        </el-form-item>
      </el-form>

      <p class="mkt-install__tip">
        安装即 fork：复制一份到「我的」目录并进资源树。此后上游原作者改动或下架，都不影响你的副本。
      </p>
    </div>

    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="loading" @click="submit">安装</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { listDirectory } from '@/api/databus/directory';
import type { DirectoryVo } from '@/api/databus/directory/types';
import type { DatabusMarketItemVo } from '@/api/databus/market/types';
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';

defineOptions({ name: 'MarketInstallDialog' });

useLucideSubset();

const props = defineProps<{
  visible: boolean;
  item: DatabusMarketItemVo | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', visible: boolean): void;
  /** 选定目录后提交安装（0/'' → null＝未归组） */
  (e: 'confirm', directoryId: string | number | null): void;
}>();

const directories = ref<DirectoryVo[]>([]);
/** 目标目录 id（0=未归组哨兵） */
const target = ref<string | number>(0);

const itemIcon = computed(() =>
  props.item?.resourceType === 'CHAIN' ? 'lucide:spline' : props.item?.icon || 'lucide:box'
);

interface DirOption {
  value: string | number;
  label: string;
  children: DirOption[];
}

function build(parentId: string | number): DirOption[] {
  return directories.value
    .filter((d) => String(d.parentId) === String(parentId))
    .map((d) => ({ value: d.id, label: d.directoryName, children: build(d.id) }));
}

const options = computed<DirOption[]>(() => [
  { value: 0, label: '未归组', children: build(0) }
]);

/** 每次打开弹窗重置为「未归组」并拉取最新目录树 */
watch(
  () => props.visible,
  async (open) => {
    if (!open) {
      return;
    }
    target.value = 0;
    try {
      const { data } = await listDirectory();
      directories.value = data ?? [];
    } catch {
      directories.value = [];
    }
  }
);

function submit() {
  const dir = target.value === 0 || target.value === '0' ? null : target.value;
  emit('confirm', dir);
}
</script>

<style lang="scss" scoped>
.mkt-install {
  &__head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
  }

  &__icon {
    font-size: 22px;
    flex-shrink: 0;
  }

  &__meta {
    min-width: 0;
  }

  &__name {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  &__code {
    margin-top: 2px;
    font-size: 12px;
    color: var(--el-text-color-placeholder);
  }

  &__tip {
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--el-text-color-secondary);
  }
}
</style>
