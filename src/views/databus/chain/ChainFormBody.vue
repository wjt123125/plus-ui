<!--
  链路表单主体（原 ChainForm 抽屉剥壳，2026-10-21 新建向导统一入口）。
  新建向导 create tab 与编辑抽屉（ChainForm 薄壳）共用同一份，故不含 el-drawer；
  结构：head（标题 + 编码）+ label-top 单列表单 + 精选模板运营区（仅编辑态）+ footer（取消/保存）。
  chainCode 编辑态只读：它是链路终身身份(lf_chain.chain_id、执行通道/CHAIN 引用寻址依据)，
  任何状态创建后均不可改；要换编码走「复制指定新编码 → 发布副本 → 删除原链路」(删除自动清规则)。
  脏状态走表单快照比对上报 dirty-change（供 tab 条脏圆点、切段与关闭确认）。
-->
<template>
  <div class="chain-body">
    <header class="chain-body__head">
      <div class="chain-body__title-wrap">
        <span class="chain-body__title">{{ isEdit ? '编辑链路' : '新增链路' }}</span>
        <span class="chain-body__code">{{ form.chainCode || '未命名编码' }}</span>
      </div>
    </header>

    <el-form
      ref="formRef"
      v-loading="detailLoading"
      :model="form"
      :rules="rules"
      label-position="top"
      class="chain-body__form"
    >
      <el-form-item label="链路编码" prop="chainCode">
        <el-input
          v-model="form.chainCode"
          maxlength="64"
          placeholder="全局唯一，建议小写字母/数字/中划线，如 order-sync"
          :disabled="!!form.id"
        />
        <div v-if="form.id" class="chain-body__code-hint">
          编码是链路的终身身份，创建后不可修改；如需更换，请复制本链路并指定新编码，发布副本后删除原链路。
        </div>
      </el-form-item>
      <el-form-item label="链路名称" prop="chainName">
        <el-input v-model="form.chainName" maxlength="100" placeholder="请输入链路名称" />
      </el-form-item>
      <el-form-item label="执行记录档位" prop="logLevel">
        <el-select v-model="form.logLevel" class="chain-body__select">
          <el-option
            v-for="item in LOG_LEVEL_OPTIONS"
            :key="item.value"
            :value="item.value"
            :label="item.label"
          >
            <span class="chain-body__option-label">{{ item.label }}</span>
            <span class="chain-body__option-desc">{{ item.desc }}</span>
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="备注" prop="remark">
        <el-input v-model="form.remark" type="textarea" maxlength="500" :rows="3" placeholder="选填" />
      </el-form-item>

      <!-- 精选模板运营区（仅编辑态；模板标记权限独立：能改链路不等于能把链路推给全员当样板） -->
      <div
        v-if="form.id"
        v-hasPermi="['databus:editor:template']"
        class="chain-body__template"
      >
        <div class="template-head">
          <span class="template-title">精选模板</span>
          <el-tag v-if="templateMeta.isTemplate" type="warning" size="small" disable-transitions>
            当前为精选模板
          </el-tag>
        </div>
        <p v-if="templateMeta.isTemplate" class="template-desc-preview">{{ templateMeta.templateDesc }}</p>
        <div v-if="templateMeta.isTemplate" class="template-actions">
          <el-button size="small" @click="openTemplateDialog">保存模板设置</el-button>
          <el-button size="small" type="danger" plain @click="handleUnmark">取消模板</el-button>
        </div>
        <template v-else>
          <el-button size="small" :disabled="templateMeta.status === STATUS_PUBLISHED" @click="openTemplateDialog">
            设为精选模板
          </el-button>
          <p v-if="templateMeta.status === STATUS_PUBLISHED" class="template-tip">
            已发布链路需先下线后再设为模板；模板恒为草稿，不进执行入口。
          </p>
        </template>
      </div>
    </el-form>

    <footer class="chain-body__footer">
      <span v-if="dirty" class="chain-body__dirty">有未保存的改动</span>
      <span class="chain-body__spacer" />
      <el-button size="small" @click="emit('cancel')">取 消</el-button>
      <el-button size="small" type="primary" :loading="submitting" @click="handleSubmit">
        保 存
      </el-button>
    </footer>

    <TemplateMarkDialog ref="templateDialogRef" @success="handleTemplateChanged" />
  </div>
</template>

<script setup lang="ts" name="ChainFormBody">
import type { DatabusChainBo, DatabusChainVo } from '@/api/databus/chain/types';
import { addChain, getChain, unmarkTemplate, updateChain } from '@/api/databus/chain';
import modal from '@/plugins/modal';
import TemplateMarkDialog from './TemplateMarkDialog.vue';
import type { FormPreset } from '../workspace/workbench.types';

/**
 * 链路表单主体。
 * - chainId 空=新增（preset.directoryId 预填归属目录，未传=未归组）；非空=编辑（GET /{id} 回显详情）
 * - 保存成功 emit('saved', payload)，由宿主决定关抽屉 / 刷树 / 开画布 tab / 向导复位
 * - 表单快照比对上报 dirty-change，供 tab 条脏圆点与关闭确认
 */

/** 提交成功载荷：新建携带新主键（宿主据此直接打开画布 tab） */
export interface ChainFormSuccessPayload {
  /** 链路主键（新增取接口返回，编辑取表单原值） */
  id: number | string;
  chainName: string;
  /** true=编辑既有链路（重命名场景）；false=新建 */
  isEdit: boolean;
}

const props = defineProps<{
  /** 编辑目标链路主键；null/undefined=新增（向导） */
  chainId?: number | string | null;
  /** 新建预设（归属目录；目录右键「新建链路」携带） */
  preset?: FormPreset;
}>();

const emit = defineEmits<{
  // payload 仅表单新增/编辑提交时携带；模板运营区的标记/取消只触发宿主刷树
  (e: 'saved', payload?: ChainFormSuccessPayload): void;
  (e: 'cancel'): void;
  (e: 'dirty-change', dirty: boolean): void;
}>();

const detailLoading = ref(false);
const submitting = ref(false);
const formRef = ref<ElFormInstance>();

/** 记录档位选项（字典 databus_log_level 镜像；默认 BASIC） */
const LOG_LEVEL_OPTIONS = [
  { value: 'BASIC', label: '基础', desc: '执行级：入参/出参/状态/耗时' },
  { value: 'FULL', label: '完整', desc: '基础 + 每个节点的逐步 IO' },
  { value: 'OFF', label: '关闭', desc: '完全不落库' }
] as const;

const buildInitFormData = (): DatabusChainBo => ({
  id: undefined,
  chainCode: '',
  chainName: '',
  logLevel: 'BASIC',
  remark: '',
  // 归属仅新建时随表单提交；树头部新建为 null（未归组），目录右键新建预填目录 id
  directoryId: null
});

const form = ref<DatabusChainBo>(buildInitFormData());

const isEdit = computed(() => props.chainId != null && props.chainId !== '');

/** 模板运营区所需状态（通用保存表单不含这些字段，单独从详情同步） */
const STATUS_PUBLISHED = '1';

interface TemplateMetaState {
  isTemplate: boolean;
  status?: string;
  templateDesc?: string;
  templateSort?: number;
}

const buildInitTemplateMeta = (): TemplateMetaState => ({ isTemplate: false });
const templateMeta = ref<TemplateMetaState>(buildInitTemplateMeta());
const templateDialogRef = ref<InstanceType<typeof TemplateMarkDialog>>();

const syncTemplateMeta = (data: DatabusChainVo) => {
  templateMeta.value = {
    isTemplate: data.isTemplate === '1',
    status: data.status,
    templateDesc: data.templateDesc ?? undefined,
    templateSort: data.templateSort
  };
};

const openTemplateDialog = () => {
  if (!form.value.id) return;
  templateDialogRef.value?.open({
    id: form.value.id,
    isTemplate: templateMeta.value.isTemplate,
    templateDesc: templateMeta.value.templateDesc,
    templateSort: templateMeta.value.templateSort
  });
};

const handleUnmark = async () => {
  if (!form.value.id) return;
  await modal.confirm('取消后该链路回到普通草稿，历史副本不受影响。确认取消精选模板？');
  await unmarkTemplate(form.value.id);
  modal.msgSuccess('已取消精选模板');
  await handleTemplateChanged();
};

/** 模板设置变更：通知宿主刷新树，并重拉详情同步本表单体 */
const handleTemplateChanged = async () => {
  emit('saved');
  if (!form.value.id) return;
  try {
    const { data } = await getChain(form.value.id);
    syncTemplateMeta(data);
  } catch {
    // 树已刷新，表单体内同步失败不额外打扰
  }
};

const rules = {
  chainCode: [
    { required: true, message: '链路编码不能为空', trigger: 'blur' },
    { max: 64, message: '链路编码长度不能超过64', trigger: 'blur' },
    {
      pattern: /^[a-zA-Z0-9_-]+$/,
      message: '只能包含字母、数字、中划线和下划线',
      trigger: 'blur'
    }
  ],
  chainName: [
    { required: true, message: '链路名称不能为空', trigger: 'blur' },
    { max: 100, message: '链路名称长度不能超过100', trigger: 'blur' }
  ],
  logLevel: [{ required: true, message: '请选择执行记录档位', trigger: 'change' }]
};

/* ---------------- 脏状态：表单快照比对 ---------------- */

const dirty = ref(false);
/** null=尚未完成初次基线（mount 初始化期间不上报，避免瞬时脏误报闪跳） */
let baseline: string | null = null;

function snapshot(): string {
  return JSON.stringify(form.value);
}

function markBaseline() {
  baseline = snapshot();
  dirty.value = false;
  emit('dirty-change', false);
}

watch(snapshot, (val) => {
  if (baseline === null) {
    return;
  }
  // 快照回到基线同样要复位（输入又删净等 A→B→A 轨迹不再残留脏标记，2026-10-21 脏态误报修复）
  const next = val !== baseline && !detailLoading.value;
  if (next !== dirty.value) {
    dirty.value = next;
    emit('dirty-change', next);
  }
});

/* ---------------- 加载 / 保存 ---------------- */

/**
 * 复位/回显：新增取 preset 预填归属目录；编辑按主键拉详情（directoryId 恒置 null——
 * 归属变更只走 move-chain 端点，通用编辑不写字段）。
 */
async function reload() {
  form.value = buildInitFormData();
  templateMeta.value = buildInitTemplateMeta();
  if (!isEdit.value) {
    if (props.preset?.directoryId !== undefined) {
      form.value.directoryId = props.preset.directoryId ?? null;
    }
    await nextTick();
    markBaseline();
    return;
  }
  detailLoading.value = true;
  try {
    const { data } = await getChain(props.chainId as number | string);
    form.value = { ...buildInitFormData(), ...data, directoryId: null };
    syncTemplateMeta(data);
    await nextTick();
    markBaseline();
  } finally {
    detailLoading.value = false;
  }
}

onMounted(reload);
watch(() => props.chainId, reload);

/** 换目录再次「新建链路」：脏草稿就地预填归属目录不打断输入；干净态整表复位 */
watch(
  () => props.preset?.directoryId,
  (val, old) => {
    if (val === old) {
      return;
    }
    if (dirty.value) {
      form.value.directoryId = val ?? null;
      return;
    }
    void reload();
  }
);

function handleSubmit() {
  formRef.value?.validate(async (valid: boolean) => {
    if (!valid) {
      return;
    }
    const isEditSave = !!form.value.id;
    submitting.value = true;
    try {
      if (isEditSave) {
        await updateChain(form.value);
        modal.msgSuccess('修改成功');
        markBaseline();
        emit('saved', {
          id: form.value.id as number | string,
          chainName: form.value.chainName,
          isEdit: true
        });
      } else {
        // 新主键随响应返回（Long 序列化为字符串），供宿主新建后直接打开画布 tab；
        // 表单体不复位——由宿主决定（向导内 CreatePane 调 reload 复位，抽屉壳自关）
        const { data: newId } = await addChain(form.value);
        modal.msgSuccess('新增成功');
        markBaseline();
        emit('saved', {
          id: newId as number | string,
          chainName: form.value.chainName,
          isEdit: false
        });
      }
    } finally {
      submitting.value = false;
    }
  });
}

defineExpose({ reload });
</script>

<style lang="scss" scoped>
.chain-body {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: var(--el-bg-color, #fff);
}

.chain-body__head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
}

.chain-body__title-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.chain-body__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--el-text-color-primary, #1d2129);
}

.chain-body__code {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chain-body__form {
  padding: 14px 20px 4px;
  flex: 1;
  overflow-y: auto;

  :deep(.el-form-item) {
    margin-bottom: 10px;
  }

  :deep(.el-form-item__label) {
    padding-bottom: 4px;
    font-weight: 500;
    color: var(--el-text-color-primary);
    line-height: 1.5;
  }
}

.chain-body__select {
  width: 100%;
}

.chain-body__code-hint {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.chain-body__option-label {
  font-weight: 500;
}

.chain-body__option-desc {
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 精选模板运营区 */
.chain-body__template {
  margin: 8px 0 0;
  padding: 14px 16px;
  border: 1px dashed var(--el-color-warning-light-5, #f3d19e);
  border-radius: 10px;
  background: var(--el-color-warning-light-9, #fdf6ec);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.template-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.template-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.template-desc-preview {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  word-break: break-word;
}

.template-actions {
  display: flex;
  gap: 8px;
}

.template-tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-color-warning);
}

.chain-body__footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-top: 1px solid var(--el-border-color-lighter, #ebeef5);
}

.chain-body__spacer {
  flex: 1;
}

.chain-body__dirty {
  font-size: 12px;
  color: var(--el-color-warning, #e6a23c);
}
</style>
