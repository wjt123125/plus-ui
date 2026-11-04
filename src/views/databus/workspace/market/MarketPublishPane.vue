<!--
  物料上架 tab 面板（工作区中栏 kind market-publish，全局单例；设计正本 databus-material-market.md §三 3.3）。
  2026-11-01 由 MarketManagePane 内部的 MarketPublishDialog 去壳提为独立 tab：上架是供给侧的
  完整业务动作而非管理页附属，tab 化后与市场/管理 tab 并存，提交后原地不动（tab 保留＋表单内容
  保留＋成功提示），作者可连续提交下一件，也可点返回钮回看来路页的审核状态。
  顶栏返回钮按 tab.publishFrom 回跳：市场来的回市场、管理来的回管理（聚焦已开 tab，本 tab 不关）。
  表单口径：选类型 → 组件/链路选源资源、连接器直接传 zip → 填简介/分类/标签 → 提交进待审；
  连接器的包上传没有独立入口，提交上架时一次性完成落包、建 def、建市场物料，统一走审核启用闭环。
  归属校验在服务端（源资源 create_by==当前用户；系统组件仅治理角色），前端只做必填拦截。
  分类↔标签联动＝轻量聚合——标签候选池＝（选定分类后）该分类下已有物料标签聚合 Top 30
  （数据源＝进 tab 时自取的全量市场 items）。表单内容不落盘（刷新后重进是空表，定案边界：不做草稿）。
-->
<template>
  <section class="mkt">
    <div class="mkt__topbar">
      <button type="button" class="mkt__back" @click="emit('back')">
        <SvgIcon icon-class="lucide:chevron-left" /><span>{{ backLabel }}</span>
      </button>
    </div>
    <header class="mkt__head mkt__head--sub">
      <div class="mkt__titles">
        <h2 class="mkt__title">上架物料</h2>
        <p class="mkt__sub">提交审核，通过后进入市场；只能上架属于自己的资源，系统组件需治理权限</p>
      </div>
      <el-button type="primary" :loading="submitting" @click="submit">
        <SvgIcon icon-class="lucide:send" /><span>提交上架</span>
      </el-button>
    </header>

    <div class="mkt__body">
      <div class="mpub">
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="mpub__form">
          <el-form-item label="类型">
            <!-- 类型分段：胶囊样式统一走全局 .db-seg / .db-seg__item -->
            <div class="db-seg">
              <button
                v-for="opt in TYPE_OPTIONS"
                :key="opt.value"
                type="button"
                class="db-seg__item"
                :class="{ 'is-active': form.resourceType === opt.value }"
                @click="setType(opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </el-form-item>

          <!-- 连接器：上传即上架。包不在别处上传——提交时落包、建 def、建市场物料一起进待审 -->
          <el-form-item v-if="form.resourceType === 'CONNECTOR'" label="连接器包" prop="sourceId">
            <div class="mpub__pkg">
              <input ref="packageInputRef" type="file" accept=".zip" class="mpub__hidden-input" @change="onPackageChange" />
              <el-button :loading="submitting" @click="pickPackage">
                <SvgIcon icon-class="lucide:upload" />
                <span>{{ packageFile ? '重新选择包' : '选择连接器包（.zip）' }}</span>
              </el-button>
              <div v-if="packageFile" class="mpub__pkg-file">
                <SvgIcon icon-class="lucide:file-archive" />
                <span class="mpub__pkg-name">{{ packageFile.name }}</span>
                <span class="mpub__pkg-size">{{ sizeLabel(packageFile.size) }}</span>
                <button type="button" class="mpub__pkg-remove" @click="clearPackage">移除</button>
              </div>
              <p class="mpub__tip">
                提交后进入待审核：治理者审核并启用后才会装载运行；同 type 升版本会重新走一遍审核，旧版本审核结论不继承。
              </p>
            </div>
          </el-form-item>

          <el-form-item v-else label="源资源" prop="sourceId">
            <ResourceSelector ref="selectorRef" v-model="form.sourceId" :resource-type="form.resourceType" />
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

          <!-- 分类平铺点选（单选，再点取消），非下拉 -->
          <el-form-item label="分类" prop="categoryId">
            <div v-if="categories.length" class="mpub__cats">
              <button
                v-for="c in categories"
                :key="String(c.id)"
                type="button"
                class="mpub__cat"
                :class="{ 'is-active': form.categoryId != null && String(form.categoryId) === String(c.id) }"
                @click="toggleCategory(c)"
              >
                {{ c.name }}
              </button>
            </div>
            <p v-else class="mpub__empty">暂无分类</p>
          </el-form-item>

          <!-- 标签平铺点选（多选＋回车新建）；候选池随分类联动 -->
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

        <p class="mpub__tip">选了分类后，标签候选＝该分类下已有物料的热门标签（最多 30 个）；候选外可自行输入新建。</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import type { DatabusMarketCategoryVo, DatabusMarketItemVo, MarketPublishForm, MarketResourceType } from '@/api/databus/market/types';
import { listMarketItems, publishConnector } from '@/api/databus/market';
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';
import { useMarketData } from './useMarketData';
import type { MarketPublishedInfo } from './marketDisplay';
import ResourceSelector from './ResourceSelector.vue';
import TagSelect from './TagSelect.vue';

defineOptions({ name: 'MarketPublishPane' });

useLucideSubset();

const props = defineProps<{
  /** 来路（＝tab.publishFrom，随会话落盘）：决定返回钮文案与回跳目标 */
  from?: 'market' | 'manage';
}>();

const emit = defineEmits<{
  /** 返回来路：宿主按 from 聚焦市场/管理 tab（本 tab 不关，表单内容保留） */
  (e: 'back'): void;
  /** 提交成功：宿主广播市场刷新令牌；连接器提交另带新物料 id，宿主切「我的上架」并高亮新行 */
  (e: 'published', info?: MarketPublishedInfo): void;
}>();

const backLabel = computed(() => (props.from === 'market' ? '返回市场' : '返回管理'));

const market = useMarketData();
const { categories } = market;

/** 类型分段选项（对齐市场页「组件 / 链路 / 连接器」） */
const TYPE_OPTIONS: { value: MarketResourceType; label: string }[] = [
  { value: 'COMPONENT', label: '组件' },
  { value: 'CHAIN', label: '链路' },
  { value: 'CONNECTOR', label: '连接器' }
];

const selectorRef = ref<InstanceType<typeof ResourceSelector>>();
const formRef = ref<FormInstance>();
const packageInputRef = ref<HTMLInputElement>();
/** 连接器包：唯一上传入口，提交时随上架元数据一起进待审 */
const packageFile = ref<File>();
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
  sourceId: [
    {
      // 连接器的「源资源」就是上传的 zip；其余类型仍选已有资源
      validator: (_rule, value, callback) => {
        if (form.resourceType === 'CONNECTOR') {
          packageFile.value ? callback() : callback(new Error('请选择连接器包（.zip）'));
          return;
        }
        value ? callback() : callback(new Error('请选择源资源'));
      },
      trigger: 'change'
    }
  ]
};

const submitting = ref(false);

/** 全量市场物料（进 tab 时自取、不透镜不过滤，供分类↔标签轻量聚合） */
const allItems = ref<DatabusMarketItemVo[]>([]);

/** 切类型：源资源与已选包都要清掉，避免把组件的 sourceId 带到连接器上架里 */
function setType(type: MarketResourceType) {
  if (form.resourceType === type) {
    return;
  }
  form.resourceType = type;
  form.sourceId = '';
  clearPackage();
  formRef.value?.clearValidate('sourceId');
}

function pickPackage() {
  packageInputRef.value?.click();
}

function onPackageChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) {
    return;
  }
  if (!file.name.toLowerCase().endsWith('.zip')) {
    ElMessage.warning('连接器包必须是 .zip');
    return;
  }
  packageFile.value = file;
  formRef.value?.validateField('sourceId').catch(() => undefined);
}

function clearPackage() {
  packageFile.value = undefined;
}

function sizeLabel(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 分类单选 chips：再点同项即取消 */
function toggleCategory(c: DatabusMarketCategoryVo) {
  form.categoryId = form.categoryId != null && String(form.categoryId) === String(c.id) ? undefined : c.id;
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

onMounted(async () => {
  // 连接器类型下不渲染 ResourceSelector，selectorRef 为空，跳过预取
  void selectorRef.value?.refresh();
  market.loadCategories();
  try {
    const { data } = await listMarketItems({ pageNum: 1, pageSize: 999 });
    allItems.value = data?.rows ?? [];
  } catch {
    allItems.value = [];
  }
});

/** 提交上架：成功后原地不动＋表单内容保留（定案 2026-11-01），只弹成功提示并广播刷新 */
async function submit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) {
    return;
  }
  submitting.value = true;
  try {
    const meta = {
      summary: form.summary || undefined,
      categoryId: form.categoryId,
      tags: form.tags,
      modifyNote: form.modifyNote || undefined
    };
    if (form.resourceType === 'CONNECTOR') {
      // 上传即提交：落包、建 def、建市场物料一次完成，统一进待审
      const { data: itemId } = await publishConnector(packageFile.value as File, meta);
      ElMessage.success('连接器包已提交，等待治理审核启用');
      emit('published', { scope: 'mine', highlightId: itemId });
    } else {
      await market.publish({
        resourceType: form.resourceType as MarketResourceType,
        sourceId: form.sourceId,
        ...meta
      });
      ElMessage.success('已提交，等待治理审核');
      emit('published');
    }
  } catch {
    /* 拦截器已提示 */
  } finally {
    submitting.value = false;
  }
}
</script>

<style lang="scss" scoped>
/* 面板外壳 / 页头 / 限宽居中 / 滚动体走全局 _databus-market.scss（与市场/管理 pane 同源同宽，取全局统一列宽＝工作区比例）；
   此处只留本 pane 独有的：返回条（复制自管理 pane 同款）、分类 chips。
   表单页不单独收窄——顶栏/页头/表单体同吃全局比例宽度，与市场/管理等宽、切 tab 不跳宽，
   且页头「提交上架」右缘与表单体右缘对齐（都顶到同一内容区右边） */

.mkt__topbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 14px 20px 2px;
}

.mkt__head--sub {
  padding-top: 8px;
}

.mkt__back {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  height: 28px;
  padding: 0 10px 0 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  background: transparent;
  border: 1px solid var(--el-border-color-light);
  border-radius: 7px;
  cursor: pointer;

  &:hover {
    color: var(--el-color-primary);
    border-color: var(--el-color-primary-light-5);
  }
}

/* 表单体：铺满全局统一列宽容器的内容区（与市场/管理内容区同宽），字段随容器宽 */
.mpub {
  padding-bottom: 24px;

  &__form {
    :deep(.el-form-item__label) {
      padding-bottom: 4px;
      font-weight: 500;
      color: var(--el-text-color-primary);
      line-height: 1.5;
    }
  }

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

  /* 连接器包上传：唯一入口，提交时随上架元数据一起进待审 */
  &__pkg {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  &__hidden-input {
    display: none;
  }

  &__pkg-file {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
    padding: 6px 10px;
    font-size: 13px;
    color: var(--el-text-color-regular);
    background: var(--el-fill-color-lighter);
    border-radius: 7px;
  }

  &__pkg-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__pkg-size {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  &__pkg-remove {
    flex-shrink: 0;
    padding: 0;
    font-size: 12px;
    color: var(--el-color-primary);
    background: transparent;
    border: 0;
    cursor: pointer;
  }
}
</style>
