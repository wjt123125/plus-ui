<!--
  复制链路/使用模板共用弹窗 — 副本的名称与编码在「创建那一刻」确认。
  编码是副本终身身份（创建后不可改；想换只能再复制一条），建议值 _2/_3 递增查重，用户可改写。
  打开时拉建议值预填；确认后调 copy 端点，成功 emit('created', 新 id, 新名称)，由父级决定留列表还是跳编辑器。
-->
<template>
  <el-dialog
    v-model="visible"
    :title="mode === 'template' ? '从模板创建链路' : '复制链路'"
    width="520px"
    append-to-body
    destroy-on-close
    @closed="resetForm"
  >
    <div v-loading="suggestLoading">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="链路名称" prop="chainName">
          <el-input v-model="form.chainName" maxlength="100" placeholder="给副本起个名字" />
        </el-form-item>
        <el-form-item label="链路编码" prop="chainCode">
          <el-input
            v-model="form.chainCode"
            maxlength="64"
            placeholder="全局唯一，字母/数字/中划线/下划线"
            @keyup.enter="handleSubmit"
          />
          <div class="code-hint">编码是链路的终身身份，创建后不可修改；如需更换请再复制一条新编码链路。</div>
        </el-form-item>
      </el-form>
    </div>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">
        {{ mode === 'template' ? '创建并编排' : '确认复制' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { copyChain, getCopySuggestion } from '@/api/databus/chain';

/**
 * @property open(row, mode) 打开：mode='copy' 普通复制（留列表）；'template' 使用模板（成功后跳编辑器）
 * @event created 复制成功：(newId, newName)
 */
const emit = defineEmits<{
  (e: 'created', newId: number | string, newName: string): void;
}>();

type CopyMode = 'copy' | 'template';

const visible = ref(false);
const suggestLoading = ref(false);
const submitting = ref(false);
const formRef = ref<ElFormInstance>();
const sourceId = ref<number | string>();
const mode = ref<CopyMode>('copy');

const form = ref({
  chainName: '',
  chainCode: ''
});

const rules = {
  chainName: [
    { required: true, message: '链路名称不能为空', trigger: 'blur' },
    { max: 100, message: '链路名称长度不能超过100', trigger: 'blur' }
  ],
  chainCode: [
    { required: true, message: '链路编码不能为空', trigger: 'blur' },
    { max: 64, message: '链路编码长度不能超过64', trigger: 'blur' },
    {
      pattern: /^[a-zA-Z0-9_-]+$/,
      message: '只能包含字母、数字、中划线和下划线',
      trigger: 'blur'
    }
  ]
};

/** 打开弹窗并拉取名称/编码建议值（_2/_3 递增查重） */
function open(row: { id?: number | string }, copyMode: CopyMode = 'copy') {
  if (!row.id) return;
  mode.value = copyMode;
  sourceId.value = row.id;
  form.value = { chainName: '', chainCode: '' };
  visible.value = true;
  void loadSuggestion(row.id);
}

async function loadSuggestion(id: number | string) {
  suggestLoading.value = true;
  try {
    const { data } = await getCopySuggestion(id);
    // 用户若在加载期间已手改则不覆盖（正常网络下几乎无感，属防御）
    if (!form.value.chainName) form.value.chainName = data.chainName;
    if (!form.value.chainCode) form.value.chainCode = data.chainCode;
  } finally {
    suggestLoading.value = false;
  }
}

function handleSubmit() {
  formRef.value?.validate(async (valid: boolean) => {
    if (!valid || sourceId.value === undefined) {
      return;
    }
    submitting.value = true;
    try {
      const { data } = await copyChain(sourceId.value, { ...form.value });
      const newName = form.value.chainName;
      visible.value = false;
      emit('created', data as number | string, newName);
    } finally {
      submitting.value = false;
    }
  });
}

function resetForm() {
  form.value = { chainName: '', chainCode: '' };
  formRef.value?.resetFields();
}

defineExpose({ open });
</script>

<style lang="scss" scoped>
.code-hint {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
</style>
