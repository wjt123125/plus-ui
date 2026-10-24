<!--
  物料安装弹窗：链路＝fork 快照（选目录 → 复制 → 进树）；组件＝共享注册 + 引用挂树（选目录归属，§十二-7）。
  只负责选目录与提交；fork/注册与血缘由宿主调市场接口完成（loading 由父传入）。
  目录选项复用统一目录树（databus_directory 全量平表），树根为可选中的「根目录」节点（parentId=0）：
  它只作为新分组的父级（建在根目录＝与现有分组同级），安装仍须选具体分组——
  不提供「未归组」，避免默认堆进未归组造成树脏。
  选中态即新分组的父级，footer 内有文字提示建到哪儿，弹层用 popper-class 强化高亮。
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

      <!-- 链路＝fork 副本落目录；组件＝引用挂树目录归属（两者都选） -->
      <el-form label-width="76px">
        <el-form-item label="安装到">
          <el-tree-select
            v-model="target"
            :data="options"
            node-key="value"
            :current-node-key="target === '' ? undefined : target"
            check-strictly
            highlight-current
            default-expand-all
            popper-class="mkt-install-popper"
            style="width: 100%"
            placeholder="选择安装分组"
          >
            <!-- 节点自定义内容只作用于下拉内（收起后的选中框仍显示 data.label）：
                 面性 ph 图标（macOS/iOS 观感；全集已由 workspace 宿主 onMounted 注入，离线可用），
                 根节点用 house 而非 folder——它是父级容器不是一个分组，再配副文案点明 -->
            <template #default="{ data }">
              <span class="mkt-install__node" :class="{ 'is-root': data.value === 0 }">
                <SvgIcon
                  class="mkt-install__node-icon"
                  :icon-class="data.value === 0 ? 'ph:house-fill' : 'ph:folder-fill'"
                />
                <span>{{ data.label }}</span>
                <span v-if="data.value === 0" class="mkt-install__node-hint"></span>
              </span>
            </template>

            <!-- d5：新建分组收进下拉 footer——展开下拉才出现，父级＝树中选中节点（含「根目录」），建完自动选中，不离开安装流程 -->
            <template #footer>
              <div v-hasPermi="['databus:directory:add']" class="mkt-install__create">
                <div class="mkt-install__create-hint">
                  <span>新分组将建在「{{ parentLabel }}」下</span>
                  <el-button v-if="!isRootSelected" link type="primary" size="small" @click="target = 0">
                    移到根目录
                  </el-button>
                </div>
                <div class="mkt-install__create-row">
                  <el-input
                    v-model="newGroupName"
                    placeholder="输入新分组名，回车创建"
                    maxlength="100"
                    size="small"
                    :disabled="creating"
                    @keyup.enter="createGroup"
                  />
                  <el-button size="small" :loading="creating" @click="createGroup">新建</el-button>
                </div>
              </div>
            </template>
          </el-tree-select>
        </el-form-item>
      </el-form>

      <p class="mkt-install__tip">
        {{
          isChain
            ? '安装即 fork：复制一份链路到「我的」目录并进资源树。此后上游原作者改动或下架，都不影响你的副本。'
            : '安装即共享注册：与原作者共用同一份组件，按所选目录挂在你的资源树（来自市场）。上游更新与下架实时生效。'
        }}
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
import { addDirectory, listDirectory } from '@/api/databus/directory';
import type { DirectoryVo } from '@/api/databus/directory/types';
import type { DatabusMarketItemVo } from '@/api/databus/market/types';
import modal from '@/plugins/modal';
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
  /** 选定目录后提交安装（必选明确分组，不再允许未归组） */
  (e: 'confirm', directoryId: string | number): void;
}>();

const directories = ref<DirectoryVo[]>([]);
/** 目标目录 id：空＝未选；0＝选中「根目录」（仅供新分组当父级，不可作为安装目标） */
const target = ref<string | number>('');
/* —— d5：下拉 footer 内新建分组（链路/组件安装统一适用） —— */
const newGroupName = ref('');
const creating = ref(false);

/** 链路才 fork 副本选目录；组件为共享注册，不落目录 */
const isChain = computed(() => props.item?.resourceType === 'CHAIN');

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

/** 树根＝可选中的「根目录」节点（value=0，对应 parentId=0）：选它即把新分组建在与现有分组同级的位置 */
const options = computed<DirOption[]>(() => [{ value: 0, label: '根目录', children: build(0) }]);

/** 选中「根目录」或未选＝新分组建在根目录下 */
const isRootSelected = computed(() => !target.value || String(target.value) === '0');

/** 新分组的父级名（跟随树中选中态，footer 提示用） */
const parentLabel = computed(() => {
  if (isRootSelected.value) {
    return '根目录';
  }
  return directories.value.find((d) => String(d.id) === String(target.value))?.directoryName ?? '根目录';
});

/** 每次打开弹窗重置为未选并拉取最新目录树 */
watch(
  () => props.visible,
  async (open) => {
    if (!open) {
      return;
    }
    target.value = '';
    newGroupName.value = '';
    // 两种类型都要目录树（链路为副本目录，组件为引用叶子归属）
    try {
      const { data } = await listDirectory();
      directories.value = data ?? [];
    } catch {
      directories.value = [];
    }
  }
);

function submit() {
  if (!target.value) {
    modal.msgWarning('请选择安装分组，或在下拉内输入新分组名回车创建');
    return;
  }
  if (String(target.value) === '0') {
    modal.msgWarning('「根目录」只用于指定新分组的父级，安装请选择一个具体分组');
    return;
  }
  emit('confirm', target.value);
}

/**
 * 父级＝树中当前选中节点（选「根目录」或未选即建为顶级分组，与现有分组互为兄弟；
 * 选已有分组则建为其子级），footer 提示已明示建到哪儿。建完重拉目录并自动选中，
 * 不离开安装流程。add 端点不回新 id，故按「父＋名」在平表中回找兜底
 * （同父同名时选中旧目录，语义等价）。
 */
async function createGroup() {
  const name = newGroupName.value.trim();
  if (!name) {
    modal.msgWarning('请输入分组名');
    return;
  }
  const parentId = isRootSelected.value ? 0 : target.value;
  const parentName = parentLabel.value;
  creating.value = true;
  try {
    await addDirectory({ parentId, directoryName: name });
    const { data } = await listDirectory();
    directories.value = data ?? [];
    const created = directories.value.find(
      (d) => String(d.parentId) === String(parentId) && d.directoryName === name
    );
    if (created) {
      target.value = created.id;
    }
    newGroupName.value = '';
    modal.msgSuccess(`分组「${name}」已建在「${parentName}」下`);
  } catch {
    /* 拦截器已提示（含后端同名拦截等） */
  } finally {
    creating.value = false;
  }
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

  /* 下拉节点内容（tree-select 默认 slot）：面性图标＋名称＋根节点副文案。
     slot 内容带本组件 scope，故 teleported 弹层内 scoped 样式同样命中 */
  &__node {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;

    /* 图标固定上色（浅蓝面性文件夹，macOS 观感），不随 hover/选中态变灰，保证层级一眼可辨 */
    &-icon {
      font-size: 15px;
      color: var(--el-color-primary-light-3);
    }

    &-hint {
      font-size: 12px;
      color: var(--el-text-color-placeholder);
    }

    /* 根节点是父级容器，用主色 house 与普通目录拉开对比 */
    &.is-root &-icon {
      color: var(--el-color-primary);
    }
  }

  /* d5：下拉 footer 内的新建分组（位置提示＋输入行）；slot 内容带本组件 scope，scoped 样式可命中 teleported 弹层 */
  &__create {
    padding-top: 8px;
    border-top: 1px solid var(--el-border-color-lighter);
  }

  &__create-hint {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 12px;
    line-height: 20px;
    color: var(--el-text-color-secondary);

    .el-button {
      height: 20px;
      padding: 0;
      font-size: 12px;
    }
  }

  &__create-row {
    display: flex;
    gap: 8px;

    :deep(.el-input) {
      flex: 1;
    }
  }
}
</style>

<style lang="scss">
/* 弹层被 teleport 到 body，EP 内部节点不带本组件 scope 属性，故用 popper-class + 全局样式强化选中态 */
.mkt-install-popper {
  .el-tree-node.is-current > .el-tree-node__content {
    background-color: var(--el-color-primary-light-8);
    border-radius: 4px;

    .el-select-dropdown__item.is-selected {
      color: var(--el-color-primary);
      font-weight: 600;
    }
  }
}
</style>
