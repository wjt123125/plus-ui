<!--
  物料上架弹窗（供给侧入口；设计正本 §三 3.3 / §七 7.1）。
  选类型 → 选源资源 → 填简介/分类/标签 → 提交进待审。
  归属校验在服务端（源资源 create_by==当前用户；系统组件仅治理角色），前端只做必填拦截。
  源资源下拉：组件取启用件、链路取已发布非模板件（各自台账 list 端点）。
-->
<template>
  <el-dialog
    :model-value="visible"
    title="上架物料"
    width="520px"
    append-to-body
    @update:model-value="(v: boolean) => emit('update:visible', v)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="76px">
      <el-form-item label="类型">
        <el-radio-group v-model="form.resourceType" @change="onTypeChange">
          <el-radio-button value="COMPONENT">组件</el-radio-button>
          <el-radio-button value="CHAIN">链路</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="源资源" prop="sourceId">
        <el-select
          v-model="form.sourceId"
          filterable
          :loading="sourceLoading"
          placeholder="选择要上架的资源"
          style="width: 100%"
        >
          <el-option v-for="o in sources" :key="o.id" :label="o.label" :value="o.id" />
        </el-select>
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

      <el-form-item label="分类">
        <el-select v-model="form.categoryId" clearable placeholder="选择分类（可选）" style="width: 100%">
          <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
      </el-form-item>

      <el-form-item label="标签">
        <el-select
          v-model="form.tags"
          multiple
          filterable
          allow-create
          default-first-option
          :reserve-keyword="false"
          placeholder="回车创建标签（可选）"
          style="width: 100%"
        />
      </el-form-item>
    </el-form>

    <p class="mkt-pub__tip">
      上架＝提交审核，通过后进入市场；只能上架属于自己的资源，系统组件需治理权限。
    </p>

    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="loading" @click="submit">提交上架</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
import { listChain } from '@/api/databus/chain';
import { listComponent } from '@/api/databus/component';
import type { DatabusMarketCategoryVo, MarketPublishForm, MarketResourceType } from '@/api/databus/market/types';
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

/** 源资源下拉项（组件 / 链路统一结构） */
interface SourceOption {
  id: string | number;
  label: string;
}

const formRef = ref<FormInstance>();
const form = reactive<MarketPublishForm>({
  resourceType: 'COMPONENT',
  sourceId: '',
  summary: '',
  categoryId: undefined,
  tags: []
});

const rules: FormRules = {
  resourceType: [{ required: true, message: '请选择类型', trigger: 'change' }],
  sourceId: [{ required: true, message: '请选择源资源', trigger: 'change' }]
};

const sources = ref<SourceOption[]>([]);
const sourceLoading = ref(false);

/** 拉取可选源资源：组件取启用件，链路取已发布非模板件 */
async function loadSources(): Promise<void> {
  sourceLoading.value = true;
  try {
    if (form.resourceType === 'CHAIN') {
      const { data } = await listChain({ status: '1', isTemplate: '0', pageNum: 1, pageSize: 999 });
      sources.value = (data?.rows ?? []).map((c) => ({
        id: c.id as string | number,
        label: `${c.chainName}（${c.chainCode}）`
      }));
    } else {
      const { data } = await listComponent({ status: '0', pageNum: 1, pageSize: 999 });
      sources.value = (data?.rows ?? []).map((c) => ({
        id: c.id as number,
        label: `${c.componentName}（${c.componentCode}）`
      }));
    }
  } catch {
    sources.value = [];
  } finally {
    sourceLoading.value = false;
  }
}

function onTypeChange() {
  form.sourceId = '';
  void loadSources();
}

/** 每次打开重置表单并拉取当前类型的源资源 */
watch(
  () => props.visible,
  (open) => {
    if (!open) {
      return;
    }
    form.resourceType = 'COMPONENT';
    form.sourceId = '';
    form.summary = '';
    form.categoryId = undefined;
    form.tags = [];
    formRef.value?.clearValidate();
    void loadSources();
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
    tags: form.tags
  });
}
</script>

<style lang="scss" scoped>
.mkt-pub__tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
</style>