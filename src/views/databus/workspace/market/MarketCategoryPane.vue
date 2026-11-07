<!--
  物料分类视角（挂在「物料管理」tab 的第 5 个视角，治理动作）。
  分类是货架目录：增 / 改名 / 排序 / 推荐标签维护；空分类可直接删除，
  有物料的分类不给裸删，只能「合并到」——后端一个事务把物料整批迁走再删源分类。
  分类按 resource_type 分组：组件分类只在组件分段出现、链路分类只在链路分段出现，空串＝通用。
-->
<template>
  <div class="mcat">
    <div class="mcat__bar">
      <span class="mcat__hint">有物料的分类只能「合并到」，空分类可直接删除。</span>
      <el-button type="primary" size="small" @click="openCreate">
        <SvgIcon icon-class="lucide:plus" /><span>新增分类</span>
      </el-button>
    </div>

    <div v-loading="loading" class="mcat__body">
      <template v-for="grp in groups" :key="grp.type">
        <div class="mkt__group-title">{{ grp.label }}</div>
        <ul class="db-list db-list--framed">
          <li v-for="c in grp.items" :key="String(c.id)" class="db-row">
            <div class="db-row__meta">
              <div class="db-row__line">
                <span class="db-row__name">{{ c.name }}</span>
              </div>
              <div class="db-row__summary">排序 {{ c.sort ?? 0 }} · 物料 {{ c.itemCount ?? 0 }}</div>
              <div class="mcat__tags">
                <template v-if="c.defaultTags?.length">
                  <span class="mcat__tag-label">推荐标签</span>
                  <span v-for="t in c.defaultTags" :key="t" class="mcat__tag">{{ t }}</span>
                </template>
                <span v-else class="mcat__tag-empty">未设推荐标签</span>
              </div>
            </div>
            <div class="db-row__ops">
              <el-button size="small" @click="openEdit(c)">改名</el-button>
              <el-button v-if="(c.itemCount ?? 0) === 0" size="small" type="danger" plain @click="onDelete(c)">
                <SvgIcon icon-class="lucide:trash" /><span>删除</span>
              </el-button>
              <el-button v-else size="small" @click="openMerge(c)">合并到…</el-button>
            </div>
          </li>
        </ul>
      </template>
      <el-empty v-if="!categories.length" description="还没有分类" :image-size="72" />
    </div>

    <!-- 新增 / 编辑：适用类型只在新增时可选（已建分类改类型会让已挂物料归属对不上） -->
    <el-dialog v-model="dialogVisible" :title="editing ? '编辑分类' : '新增分类'" width="420px" append-to-body>
      <el-form label-width="80px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" maxlength="100" show-word-limit placeholder="例如：数据处理" />
        </el-form-item>
        <el-form-item v-if="!editing" label="适用类型">
          <el-select v-model="form.resourceType" class="mcat__field">
            <el-option label="通用（组件 / 链路 / 连接器都出现）" value="" />
            <el-option label="组件" value="COMPONENT" />
            <el-option label="链路" value="CHAIN" />
            <el-option label="连接器" value="CONNECTOR" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="推荐标签">
          <!-- 弹窗复用实例：按编辑对象重挂载，避免上一条分类本地新建过的标签残留 -->
          <TagSelect
            :key="String(editing?.id ?? 'new')"
            v-model="form.defaultTags"
            :options="tagPool"
            allow-create
            empty-text="暂无同类型推荐，可直接输入"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 合并：物料整批迁到目标分类后删源分类；目标「未分类」＝迁出后不归属任何分类 -->
    <el-dialog v-model="mergeVisible" title="合并分类" width="440px" append-to-body>
      <p class="mcat__merge-tip">
        「{{ merging?.name }}」下的 {{ merging?.itemCount ?? 0 }} 个物料会整体迁移到所选分类，随后该分类被删除。
      </p>
      <el-select v-model="mergeTarget" class="mcat__field" placeholder="选择目标分类">
        <el-option label="未分类（不归属任何分类）" :value="NO_TARGET" />
        <el-option v-for="c in mergeTargets" :key="String(c.id)" :label="c.name" :value="String(c.id)" />
      </el-select>
      <template #footer>
        <el-button @click="mergeVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onMerge">合并并删除</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import modal from '@/plugins/modal';
import { addMarketCategory, delMarketCategory, listMarketCategories, mergeMarketCategory, updateMarketCategory } from '@/api/databus/market';
import type { DatabusMarketCategoryVo, MarketCategoryForm } from '@/api/databus/market/types';
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';
import TagSelect from './TagSelect.vue';

defineOptions({ name: 'MarketCategoryPane' });

useLucideSubset();

/** 分组顺序与市场页类型分段一致 */
const GROUP_ORDER: { type: string; label: string }[] = [
  { type: 'COMPONENT', label: '组件' },
  { type: 'CHAIN', label: '链路' },
  { type: 'CONNECTOR', label: '连接器' },
  { type: '', label: '通用' }
];

const emit = defineEmits<{
  /** 分类动过：宿主刷市场页 chips（新分类/改名/删除都要重取） */
  (e: 'changed'): void;
}>();

const loading = ref(false);
const saving = ref(false);
const categories = ref<DatabusMarketCategoryVo[]>([]);

const groups = computed(() =>
  GROUP_ORDER.map((g) => ({
    ...g,
    items: categories.value.filter((c) => (c.resourceType ?? '') === g.type)
  })).filter((g) => g.items.length)
);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const { data } = await listMarketCategories();
    categories.value = data ?? [];
  } finally {
    loading.value = false;
  }
}

/* ---------------- 新增 / 编辑 ---------------- */

const dialogVisible = ref(false);
const editing = ref<DatabusMarketCategoryVo | null>(null);
const form = reactive<MarketCategoryForm>({ name: '', resourceType: '', sort: 0, defaultTags: [] });

/** 推荐标签候选：同适用类型（含通用）分类已配的标签，避免同一类型内词汇漂移 */
const tagPool = computed(() => {
  const type = form.resourceType ?? '';
  const pool = new Set<string>();
  for (const c of categories.value) {
    const ct = c.resourceType ?? '';
    if (type && ct !== type && ct !== '') {
      continue;
    }
    for (const t of c.defaultTags ?? []) {
      pool.add(t);
    }
  }
  return [...pool].map((t) => ({ value: t, label: t }));
});

function openCreate(): void {
  editing.value = null;
  form.name = '';
  form.resourceType = '';
  form.sort = (categories.value.at(-1)?.sort ?? 0) + 1;
  form.defaultTags = [];
  dialogVisible.value = true;
}

function openEdit(c: DatabusMarketCategoryVo): void {
  editing.value = c;
  form.name = c.name;
  form.resourceType = c.resourceType ?? '';
  form.sort = c.sort ?? 0;
  form.defaultTags = [...(c.defaultTags ?? [])];
  dialogVisible.value = true;
}

async function onSave(): Promise<void> {
  if (!form.name.trim()) {
    ElMessage.warning('分类名称不能为空');
    return;
  }
  saving.value = true;
  try {
    if (editing.value) {
      await updateMarketCategory(editing.value.id, {
        name: form.name.trim(),
        sort: form.sort,
        defaultTags: form.defaultTags ?? []
      });
      ElMessage.success('已保存');
    } else {
      await addMarketCategory({
        name: form.name.trim(),
        resourceType: form.resourceType,
        sort: form.sort,
        defaultTags: form.defaultTags ?? []
      });
      ElMessage.success('已新增');
    }
    dialogVisible.value = false;
    await load();
    emit('changed');
  } catch {
    /* 拦截器已提示 */
  } finally {
    saving.value = false;
  }
}

/* ---------------- 删除（仅空分类） ---------------- */

async function onDelete(c: DatabusMarketCategoryVo): Promise<void> {
  try {
    await modal.confirm(`确认删除分类「${c.name}」？`);
  } catch {
    return;
  }
  try {
    await delMarketCategory(c.id);
    ElMessage.success('已删除');
    await load();
    emit('changed');
  } catch {
    /* 拦截器已提示（例如后端发现仍有物料占用） */
  }
}

/* ---------------- 合并 ---------------- */

/** 「未分类」用哨兵值，空串留给「尚未选择」以便校验必选 */
const NO_TARGET = '__none';
const mergeVisible = ref(false);
const merging = ref<DatabusMarketCategoryVo | null>(null);
const mergeTarget = ref<string>('');

/** 目标候选：同适用类型或通用分类，排除自身 */
const mergeTargets = computed(() => {
  const type = merging.value?.resourceType ?? '';
  return categories.value.filter(
    (c) => String(c.id) !== String(merging.value?.id) && ((c.resourceType ?? '') === '' || (c.resourceType ?? '') === type)
  );
});

function openMerge(c: DatabusMarketCategoryVo): void {
  merging.value = c;
  mergeTarget.value = '';
  mergeVisible.value = true;
}

async function onMerge(): Promise<void> {
  const c = merging.value;
  if (!c) {
    return;
  }
  if (!mergeTarget.value) {
    ElMessage.warning('请选择目标分类');
    return;
  }
  saving.value = true;
  try {
    await mergeMarketCategory(c.id, {
      targetCategoryId: mergeTarget.value === NO_TARGET ? null : mergeTarget.value
    });
    ElMessage.success('已合并');
    mergeVisible.value = false;
    await load();
    emit('changed');
  } catch {
    /* 拦截器已提示 */
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style lang="scss" scoped>
.mcat {
  display: flex;
  flex-direction: column;
}

.mcat__bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.mcat__hint {
  flex: 1;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.mcat__body {
  min-height: 200px;
}

.mcat__field {
  width: 100%;
}

.mcat__merge-tip {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.mcat__tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-size: 11px;
}

.mcat__tag-label {
  color: var(--el-text-color-placeholder);
  margin-right: 2px;
}

.mcat__tag {
  padding: 0 6px;
  border-radius: 8px;
  line-height: 16px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
}

.mcat__tag-empty {
  color: var(--el-text-color-placeholder);
}
</style>
