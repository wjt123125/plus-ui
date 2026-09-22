<!--
  链路新增/编辑弹窗 — 同项目 Vercel/Linear 极简留白范式(见 ConnectionForm)
  链路基础字段少(编码/名称/记录档位/备注),无需 tabs,单列 label-top 堆叠。
  chainCode 编辑态只读:它是 Rule-DB lf_chain.chain_id,发布后变更会造成
  旧规则残留(后端 update 不迁移 lf_chain 主键),要换编码请新建链路。
-->
<template>
  <el-dialog
    v-model="visible"
    width="520px"
    append-to-body
    destroy-on-close
    :show-close="false"
    :close-on-click-modal="true"
    class="chain-form"
  >
    <template #header>
      <div class="chain-form__header">
        <span class="chain-form__title">{{ form.id ? '编辑链路' : '新增链路' }}</span>
        <el-icon class="chain-form__close" @click="visible = false"><Close /></el-icon>
      </div>
    </template>

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
    </el-form>

    <template #footer>
      <div class="chain-form__footer">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { DatabusChainBo } from '@/api/databus/chain/types';
import { Close } from '@element-plus/icons-vue';
import { addChain, getChain, updateChain } from '@/api/databus/chain';
import modal from '@/plugins/modal';

/**
 * 链路新增/编辑弹窗。
 * 父组件持 ref:openDialog() 新增、openDialog(id) 编辑;成功后 emit('success')。
 * 编辑回显走 GET /{id} 重拉详情（与连接页同范式）。
 */

const emit = defineEmits<{
  (e: 'success'): void;
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
  remark: ''
});

const form = ref<DatabusChainBo>(buildInitFormData());

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

/** 新增:openDialog();编辑:openDialog(id)(按主键拉详情回显) */
async function openDialog(id?: number | string) {
  form.value = buildInitFormData();
  const isEdit = id !== undefined && id !== null && id !== '';
  visible.value = true;
  if (!isEdit) {
    return;
  }
  detailLoading.value = true;
  try {
    const { data } = await getChain(id);
    form.value = { ...buildInitFormData(), ...data };
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
        await addChain(form.value);
      }
      modal.msgSuccess(isEdit ? '修改成功' : '新增成功');
      visible.value = false;
      emit('success');
    } finally {
      submitting.value = false;
    }
  });
}

defineExpose({ openDialog });
</script>

<style lang="scss" scoped>
.chain-form {
  :deep(.el-dialog__header) {
    margin: 0;
    padding: 0;
  }
  :deep(.el-dialog__body) {
    padding: 0;
  }
  :deep(.el-dialog) {
    border-radius: 16px;
    overflow: hidden;
  }
}

.chain-form__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 0;
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
  padding: 8px 24px 4px;
}

.chain-form__select {
  width: 100%;
}

.chain-form__option-label {
  font-weight: 500;
}

.chain-form__option-desc {
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.chain-form__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
