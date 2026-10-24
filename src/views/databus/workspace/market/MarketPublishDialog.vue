<!--
  物料上架弹窗（供给侧入口；设计正本 §三 3.3 / §七 7.1 / §四 2026-10-23 定稿）。
  选类型 → 选源资源 → 填简介/分类/标签 → 提交进待审。
  归属校验在服务端（源资源 create_by==当前用户；系统组件仅治理角色），前端只做必填拦截。
  源资源＝统一 ResourceSelector（施工清单 d2 三型：组件/链路/连接器，切换自动换源清值）。
  d4：对齐新建向导范式（卡头＋label-top＋footer）；分类/标签均平铺点选（非下拉）；
  分类↔标签联动＝轻量聚合——标签候选池＝（选定分类后）该分类下已有物料标签聚合 Top 30
  （tagPool 思路零新表，数据源＝打开时自取的全量市场 items）。
-->
<template>
  <el-dialog
    :model-value="visible"
    width="560px"
    append-to-body
    class="mkt-pub"
    @update:model-value="(v: boolean) => emit('update:visible', v)"
  >
    <!-- 头部对齐物料市场页：标题＋副标题（默认关闭按钮由 el-dialog 渲染，标题区右缘留白避让） -->
    <template #header>
      <div class="mkt-pub__head">
        <h3 class="mkt-pub__title">上架物料</h3>
        <p class="mkt-pub__subtitle">提交审核，通过后进入市场；只能上架属于自己的资源，系统组件需治理权限</p>
      </div>
    </template>

    <div class="mkt-pub">

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        class="mkt-pub__form"
      >
        <el-form-item label="类型">
          <!-- 类型分段：胶囊样式统一走全局 .db-seg / .db-seg__item -->
          <div class="db-seg">
            <button
              v-for="opt in TYPE_OPTIONS"
              :key="opt.value"
              type="button"
              class="db-seg__item"
              :class="{ 'is-active': form.resourceType === opt.value }"
              @click="form.resourceType = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>
        </el-form-item>

        <el-form-item label="源资源" prop="sourceId">
          <ResourceSelector
            ref="selectorRef"
            v-model="form.sourceId"
            :resource-type="form.resourceType"
          />
        </el-form-item>

        <el-form-item label="简介" prop="summary">
          <el-input
            v-model="form.summary"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="一句话说明它能做什么、适合什么场景"
          />
        </el-form-item>

        <!-- d4：分类平铺点选（单选，再点取消），非下拉 -->
        <el-form-item label="分类" prop="categoryId">
          <div v-if="categories.length" class="mkt-pub__cats">
            <button
              v-for="c in categories"
              :key="String(c.id)"
              type="button"
              class="mkt-pub__cat"
              :class="{ 'is-active': form.categoryId != null && String(form.categoryId) === String(c.id) }"
              @click="toggleCategory(c)"
            >
              {{ c.name }}
            </button>
          </div>
          <p v-else class="mkt-pub__empty">暂无分类</p>
        </el-form-item>

        <!-- d4：标签平铺点选（多选＋回车新建）；候选池随分类联动 -->
        <el-form-item label="标签" prop="tags">
          <TagSelect v-model="form.tags" :options="tagOptions" placeholder="输入标签后回车新建" />
        </el-form-item>

        <!-- P1 驳回-重提闭环：被驳回后重提时填修改说明（非必填，作者说明本轮改了什么） -->
        <el-form-item label="修改说明（重提时填）" prop="modifyNote">
          <el-input
            v-model="form.modifyNote"
            type="textarea"
            :rows="2"
            maxlength="500"
            show-word-limit
            placeholder="被驳回后重新提交时，说明本次修改了什么，便于审核者复核"
          />
        </el-form-item>
      </el-form>

      <p class="mkt-pub__tip">
        选了分类后，标签候选＝该分类下已有物料的热门标签（最多 30 个）；候选外可自行输入新建。
      </p>
    </div>

    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="loading" @click="submit">提交上架</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
import type {
  DatabusMarketCategoryVo,
  DatabusMarketItemVo,
  MarketPublishForm,
  MarketResourceType
} from '@/api/databus/market/types';
import { listMarketItems } from '@/api/databus/market';
import ResourceSelector from './ResourceSelector.vue';
import TagSelect from './TagSelect.vue';
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';

defineOptions({ name: 'MarketPublishDialog' });

useLucideSubset();

const props = defineProps<{
  visible: boolean;
  categories: DatabusMarketCategoryVo[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', visible: boolean): void;
  (e: 'confirm', form: MarketPublishForm): void;
}>();

/** 类型分段选项（对齐市场页「组件 / 链路 / 连接器」） */
const TYPE_OPTIONS: { value: MarketResourceType; label: string }[] = [
  { value: 'COMPONENT', label: '组件' },
  { value: 'CHAIN', label: '链路' },
  { value: 'CONNECTOR', label: '连接器' }
];


const selectorRef = ref<InstanceType<typeof ResourceSelector>>();

const formRef = ref<FormInstance>();
const form = reactive<MarketPublishForm>({
  resourceType: 'COMPONENT',
  sourceId: '',
  summary: '',
  categoryId: undefined,
  tags: [],
  modifyNote: ''
});

const rules: FormRules = {
  resourceType: [{ required: true, message: '请选择类型', trigger: 'change' }],
  sourceId: [{ required: true, message: '请选择源资源', trigger: 'change' }]
};

/** 全量市场物料（打开时自取、不透镜不过滤，供分类↔标签轻量聚合） */
const allItems = ref<DatabusMarketItemVo[]>([]);

/** 分类单选 chips：再点同项即取消 */
function toggleCategory(c: DatabusMarketCategoryVo) {
  form.categoryId =
    form.categoryId != null && String(form.categoryId) === String(c.id) ? undefined : c.id;
}

/** 标签候选池＝（选定分类后）该分类下已有物料的标签聚合，按频次降序取 Top 30 */
const tagOptions = computed(() => {
  const counts = new Map<string, number>();
  for (const it of allItems.value) {
    if (form.categoryId != null && String(it.categoryId ?? '') !== String(form.categoryId)) {
      continue;
    }
    for (const t of it.tags ?? []) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 30)
    .map(([t]) => ({ value: t, label: t }));
});

/** 每次打开重置表单并重拉源资源与全量 items（ResourceSelector：类型切换自动换源清值） */
watch(
  () => props.visible,
  async (open) => {
    if (!open) {
      return;
    }
    form.resourceType = 'COMPONENT';
    form.sourceId = '';
    form.summary = '';
    form.categoryId = undefined;
    form.tags = [];
    form.modifyNote = '';
    formRef.value?.clearValidate();
    void selectorRef.value?.refresh();
    try {
      const { data } = await listMarketItems({ pageNum: 1, pageSize: 999 });
      allItems.value = data?.rows ?? [];
    } catch {
      allItems.value = [];
    }
  }
);

async function submit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) {
    return;
  }
  emit('confirm', {
    resourceType: form.resourceType as MarketResourceType,
    sourceId: form.sourceId,
    summary: form.summary || undefined,
    categoryId: form.categoryId,
    tags: form.tags,
    modifyNote: form.modifyNote || undefined
  });
}
</script>

<style lang="scss" scoped>
.mkt-pub {
  /* 头部：标题＋副标题（对齐市场页 .mkt__head；右缘留白避让 el-dialog 默认关闭按钮） */
  &__head {
    padding-right: 32px;
  }

  &__title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    line-height: 1.4;
    color: var(--el-text-color-primary);
  }

  &__subtitle {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--el-text-color-secondary);
  }

  &__form {
    :deep(.el-form-item__label) {
      padding-bottom: 4px;
      font-weight: 500;
      color: var(--el-text-color-primary);
      line-height: 1.5;
    }
  }

  /* 类型分段：胶囊轨道/项由全局 .db-seg / .db-seg__item 提供（databus-tabs） */

  /* 分类平铺 chips（单选，胶囊样式对齐市场页 .mkt__chip） */
  &__cats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    width: 100%;
  }

  &__cat {
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

    &:hover {
      color: var(--el-color-primary);
    }

    &.is-active {
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
    }
  }

  &__empty {
    margin: 0;
    font-size: 12px;
    line-height: 24px;
    color: var(--el-text-color-placeholder, #a8abb2);
  }

  &__tip {
    margin: 12px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--el-text-color-secondary);
  }
}
</style>
