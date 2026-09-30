<!--
  「设为精选模板 / 保存模板设置」弹窗 — 链路编辑抽屉内的运营动作子弹窗。
  模板说明写给使用者看（适用场景/前置条件/能学到什么），排序控制模板库露出顺序。
  标记/取消走专用端点（databus:editor:template），不进通用链路保存。
-->
<template>
  <el-dialog
    v-model="visible"
    :title="alreadyTemplate ? '保存模板设置' : '设为精选模板'"
    width="520px"
    append-to-body
    destroy-on-close
    @closed="resetForm"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <el-form-item label="模板说明" prop="templateDesc">
        <el-input
          v-model="form.templateDesc"
          type="textarea"
          :rows="4"
          maxlength="500"
          show-word-limit
          placeholder="写给使用者看：适用场景 / 前置条件 / 能学到什么"
        />
      </el-form-item>
      <el-form-item label="模板排序" prop="templateSort">
        <div class="sort-row">
          <el-input-number v-model="form.templateSort" :min="0" :step="10" controls-position="right" />
          <span class="sort-hint">值越小越靠前，同值按最近更新时间排序</span>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { markTemplate } from '@/api/databus/chain';
import modal from '@/plugins/modal';

/**
 * 标记弹窗。父组件持 ref：open(chainMeta) 打开；保存成功 emit('success')，由父组件重拉详情。
 */
const emit = defineEmits<{
  (e: 'success'): void;
}>();

interface TemplateMeta {
  id: number | string;
  templateDesc?: string;
  templateSort?: number;
  isTemplate?: boolean | string;
}

const visible = ref(false);
const submitting = ref(false);
const formRef = ref<ElFormInstance>();
const chainId = ref<number | string>();
const alreadyTemplate = ref(false);

const form = ref({
  templateDesc: '',
  templateSort: 0
});

const rules = {
  templateDesc: [
    { required: true, message: '请填写模板说明', trigger: 'blur' },
    { max: 500, message: '模板说明长度不能超过500个字符', trigger: 'blur' }
  ]
};

/** 打开：传当前链路 id 与已有模板设置（回显说明/排序） */
function open(meta: TemplateMeta) {
  chainId.value = meta.id;
  alreadyTemplate.value = meta.isTemplate === true || meta.isTemplate === '1';
  form.value = {
    templateDesc: meta.templateDesc ?? '',
    templateSort: meta.templateSort ?? 0
  };
  visible.value = true;
}

function handleSubmit() {
  formRef.value?.validate(async (valid: boolean) => {
    if (!valid || chainId.value === undefined) {
      return;
    }
    submitting.value = true;
    try {
      await markTemplate(chainId.value, { ...form.value });
      modal.msgSuccess(alreadyTemplate.value ? '模板设置已保存' : '已设为精选模板');
      visible.value = false;
      emit('success');
    } finally {
      submitting.value = false;
    }
  });
}

function resetForm() {
  form.value = { templateDesc: '', templateSort: 0 };
  formRef.value?.resetFields();
}

defineExpose({ open });
</script>

<style lang="scss" scoped>
.sort-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sort-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
