<!--
  链路新增/编辑抽屉 — 右侧滑出，同项目极简留白范式(见 ConnectionForm)
  链路基础字段少(编码/名称/记录档位/备注),单列 label-top 堆叠。
  chainCode 编辑态只读:它是链路终身身份(lf_chain.chain_id、执行通道/CHAIN 引用寻址依据),
  任何状态创建后均不可改;要换编码走「复制指定新编码 → 发布副本 → 删除原链路」(删除自动清规则)。
-->
<template>
  <el-drawer
    v-model="visible"
    direction="rtl"
    size="520px"
    append-to-body
    destroy-on-close
    :with-header="false"
    :close-on-click-modal="true"
    class="chain-form"
  >
    <div class="chain-form__header">
      <span class="chain-form__title">{{ form.id ? '编辑链路' : '新增链路' }}</span>
      <el-icon class="chain-form__close" @click="visible = false"><Close /></el-icon>
    </div>

    <el-form
      ref="formRef"
      v-loading="detailLoading"
      :model="form"
      :rules="rules"
      label-position="top"
      class="chain-form__body"
    >
      <el-form-item label="链路编码" prop="chainCode">
        <el-input
          v-model="form.chainCode"
          maxlength="64"
          placeholder="全局唯一，建议小写字母/数字/中划线，如 order-sync"
          :disabled="!!form.id"
        />
        <div v-if="form.id" class="chain-form__code-hint">
          编码是链路的终身身份，创建后不可修改；如需更换，请复制本链路并指定新编码，发布副本后删除原链路。
        </div>
      </el-form-item>
      <el-form-item label="链路名称" prop="chainName">
        <el-input v-model="form.chainName" maxlength="100" placeholder="请输入链路名称" />
      </el-form-item>
      <el-form-item label="执行记录档位" prop="logLevel">
        <el-select v-model="form.logLevel" class="chain-form__select">
          <el-option
            v-for="item in LOG_LEVEL_OPTIONS"
            :key="item.value"
            :value="item.value"
            :label="item.label"
          >
            <span class="chain-form__option-label">{{ item.label }}</span>
            <span class="chain-form__option-desc">{{ item.desc }}</span>
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
        class="chain-form__template"
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

    <div class="chain-form__footer">
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
    </div>

    <TemplateMarkDialog ref="templateDialogRef" @success="handleTemplateChanged" />
  </el-drawer>
</template>

<script setup lang="ts">
import type { DatabusChainBo, DatabusChainVo } from '@/api/databus/chain/types';
import { Close } from '@element-plus/icons-vue';
import { addChain, getChain, unmarkTemplate, updateChain } from '@/api/databus/chain';
import modal from '@/plugins/modal';
import TemplateMarkDialog from './TemplateMarkDialog.vue';

/**
 * 链路新增/编辑弹窗。
 * 父组件持 ref:openDialog() 新增、openDialog(id) 编辑;成功后 emit('success')。
 * 编辑回显走 GET /{id} 重拉详情（与连接页同范式）。
 */

/** 提交成功载荷：新建携带新主键（工作台树据此直接打开画布 tab） */
export interface ChainFormSuccessPayload {
  /** 链路主键（新增取接口返回，编辑取表单原值） */
  id: number | string;
  chainName: string;
  /** true=编辑既有链路（重命名场景）；false=新建 */
  isEdit: boolean;
}

const emit = defineEmits<{
  // payload 仅表单新增/编辑提交时携带；模板运营区的标记/取消只触发树 reload
  (e: 'success', payload?: ChainFormSuccessPayload): void;
}>();

const visible = ref(false);
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

/** 模板设置变更：通知父级刷新列表（卡片可能在两个 tab 间迁移），并重拉详情同步本抽屉 */
const handleTemplateChanged = async () => {
  emit('success');
  if (!form.value.id) return;
  try {
    const { data } = await getChain(form.value.id);
    syncTemplateMeta(data);
  } catch {
    // 列表已刷新，抽屉内同步失败不额外打扰
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

/** 新建预设（树目录右键新建时携带归属目录；头部新建不传＝未归组） */
export interface ChainFormPreset {
  directoryId?: string | number | null;
}

/**
 * 新增:openDialog() 或 openDialog(undefined, { directoryId });
 * 编辑:openDialog(id)（按主键拉详情回显）。
 * 编辑态 directoryId 恒置 null：归属变更只走 move-chain 端点，通用编辑不写字段。
 */
async function openDialog(id?: number | string, preset?: ChainFormPreset) {
  form.value = buildInitFormData();
  templateMeta.value = buildInitTemplateMeta();
  const isEdit = id !== undefined && id !== null && id !== '';
  if (!isEdit && preset?.directoryId !== undefined) {
    form.value.directoryId = preset.directoryId;
  }
  visible.value = true;
  if (!isEdit) {
    return;
  }
  detailLoading.value = true;
  try {
    const { data } = await getChain(id);
    form.value = { ...buildInitFormData(), ...data, directoryId: null };
    syncTemplateMeta(data);
  } catch {
    visible.value = false;
  } finally {
    detailLoading.value = false;
  }
}

function handleSubmit() {
  formRef.value?.validate(async (valid: boolean) => {
    if (!valid) {
      return;
    }
    const isEdit = !!form.value.id;
    submitting.value = true;
    try {
      if (isEdit) {
        await updateChain(form.value);
      } else {
        // 新主键随响应返回（Long 序列化为字符串），供树新建后直接打开画布 tab
        const { data: newId } = await addChain(form.value);
        form.value.id = newId ?? form.value.id;
      }
      modal.msgSuccess(isEdit ? '修改成功' : '新增成功');
      visible.value = false;
      emit('success', {
        id: form.value.id as number | string,
        chainName: form.value.chainName,
        isEdit
      });
    } finally {
      submitting.value = false;
    }
  });
}

defineExpose({ openDialog });
</script>

<style lang="scss" scoped>
.chain-form {
  :deep(.el-drawer__body) {
    padding: 0;
    display: flex;
    flex-direction: column;
    height: 100%;
  }
}

.chain-form__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
  flex-shrink: 0;
}

.chain-form__title {
  font-size: 17px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.chain-form__close {
  font-size: 18px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: color 0.2s ease;

  &:hover {
    color: var(--el-text-color-primary);
  }
}

.chain-form__body {
  padding: 16px 24px 4px;
  flex: 1;
  overflow-y: auto;
}

.chain-form__select {
  width: 100%;
}

.chain-form__code-hint {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.chain-form__option-label {
  font-weight: 500;
}

.chain-form__option-desc {
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 精选模板运营区 */
.chain-form__template {
  margin: 8px 24px 0;
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

.chain-form__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 12px 24px 20px;
  border-top: 1px solid var(--el-border-color-lighter, #ebeef5);
  flex-shrink: 0;
}
</style>
