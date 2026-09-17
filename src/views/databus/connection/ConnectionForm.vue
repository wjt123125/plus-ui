<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="680px"
    append-to-body
    destroy-on-close
  >
    <el-form ref="formRef" v-loading="detailLoading" :model="form" :rules="rules" label-width="100px">
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="连接ID" prop="connectionId">
            <el-input v-model="form.connectionId" maxlength="64" placeholder="全局唯一，如 bpm-prod" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="连接名称" prop="connectionName">
            <el-input v-model="form.connectionName" maxlength="100" placeholder="请输入连接名称" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="连接器类型" prop="connectorType">
            <el-select v-model="form.connectorType" placeholder="请选择连接器类型" style="width: 100%">
              <el-option
                v-for="item in CONNECTOR_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="是否启用" prop="enabled">
            <el-switch
              v-model="form.enabled"
              active-value="Y"
              inactive-value="N"
              active-text="启用"
              inactive-text="禁用"
            />
          </el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item label="连接地址" prop="endpoint">
            <el-input v-model="form.endpoint" maxlength="255" placeholder="BPM 容器地址，如 http://localhost:8088" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="用户名" prop="username">
            <el-input v-model="form.username" maxlength="64" placeholder="BPM 登录用户名" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="密码" prop="password">
            <el-input v-model="form.password" type="password" maxlength="128" show-password placeholder="BPM 登录密码" />
          </el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item label="IP白名单" prop="ipWhiteList">
            <el-input
              v-model="form.ipWhiteList"
              type="textarea"
              :rows="2"
              maxlength="1024"
              placeholder='JSON 数组字符串，如 ["192.168.1.1","10.0.0.0/24"]；留空表示不限制'
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="超时时间" prop="timeout">
            <el-input-number
              v-model="form.timeout"
              :min="1000"
              :max="600000"
              :step="1000"
              :precision="0"
              controls-position="right"
              style="width: 100%"
            />
            <span class="connection-form__unit">毫秒</span>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="重试次数" prop="retryCount">
            <el-input-number
              v-model="form.retryCount"
              :min="0"
              :max="10"
              :step="1"
              :precision="0"
              controls-position="right"
              style="width: 100%"
            />
            <span class="connection-form__unit">次（1D-P0 保留字段）</span>
          </el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item label="备注" prop="remark">
            <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="500" placeholder="请输入备注" />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
    <template #footer>
      <div class="connection-form__footer">
        <ConnectionTestButton :form-data="form" />
        <div class="connection-form__footer-right">
          <el-button @click="visible = false">取 消</el-button>
          <el-button type="primary" :loading="submitting" @click="handleSubmit">确 定</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts" name="ConnectionForm">
import type { SysDatabusConnectionBo } from '@/api/databus/connection/types';
import {
  CONNECTOR_OPTIONS,
  addConnection,
  getConnection,
  updateConnection
} from '@/api/databus/connection';
import modal from '@/plugins/modal';
import ConnectionTestButton from './ConnectionTestButton.vue';

/**
 * 连接新增/编辑弹窗。
 *
 * 使用方式：父组件持有 ref，调用 openDialog() 新增、openDialog(row) 编辑；
 * 提交成功后 emit('success')，父组件刷新列表。
 * 编辑回显走 GET /{id} 重新拉详情（跟随 notice/config 页面范式，避免列表行字段不全）。
 */

const emit = defineEmits<{
  (e: 'success'): void;
}>();

const visible = ref(false);
const detailLoading = ref(false);
const submitting = ref(false);
const dialogTitle = ref('添加连接');
const formRef = ref<ElFormInstance>();

const buildInitFormData = (): SysDatabusConnectionBo => ({
  id: undefined,
  connectionId: '',
  connectionName: '',
  connectorType: 'bpmHttp',
  endpoint: '',
  username: '',
  password: '',
  ipWhiteList: '',
  timeout: 30000,
  retryCount: 0,
  enabled: 'Y',
  remark: ''
});

const form = ref<SysDatabusConnectionBo>(buildInitFormData());

/** 非空时必须为 JSON 数组，与后端 SysDatabusConnectionServiceImpl.parseIpWhiteList 口径一致 */
const validateIpWhiteList = (
  _rule: unknown,
  value: string,
  callback: (error?: Error) => void
) => {
  if (!value || !value.trim()) {
    callback();
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    callback(new Error('IP 白名单不是合法 JSON，格式如 ["192.168.1.1","10.0.0.0/24"]'));
    return;
  }
  if (!Array.isArray(parsed)) {
    callback(new Error('IP 白名单必须是 JSON 数组，格式如 ["192.168.1.1","10.0.0.0/24"]'));
    return;
  }
  callback();
};

const rules = {
  connectionId: [
    { required: true, message: '连接ID不能为空', trigger: 'blur' },
    { max: 64, message: '连接ID长度不能超过64', trigger: 'blur' }
  ],
  connectionName: [
    { required: true, message: '连接名称不能为空', trigger: 'blur' },
    { max: 100, message: '连接名称长度不能超过100', trigger: 'blur' }
  ],
  connectorType: [{ required: true, message: '连接器类型不能为空', trigger: 'change' }],
  endpoint: [{ max: 255, message: '连接地址长度不能超过255', trigger: 'blur' }],
  username: [{ max: 64, message: '用户名长度不能超过64', trigger: 'blur' }],
  password: [{ max: 128, message: '密码长度不能超过128', trigger: 'blur' }],
  ipWhiteList: [{ required: false, validator: validateIpWhiteList, trigger: 'blur' }],
  timeout: [{ required: true, message: '超时时间不能为空', trigger: 'blur' }]
};

/** 新增：openDialog()；编辑：openDialog(id)（内部按主键拉详情回显） */
async function openDialog(id?: number | string) {
  form.value = buildInitFormData();
  const isEdit = id !== undefined && id !== null && id !== '';
  dialogTitle.value = isEdit ? '修改连接' : '添加连接';
  visible.value = true;
  if (!isEdit) {
    return;
  }
  detailLoading.value = true;
  try {
    const { data } = await getConnection(id);
    form.value = { ...buildInitFormData(), ...data };
  } catch {
    // 错误提示由 request 拦截器统一弹出，详情拉取失败直接关闭弹窗
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
        await updateConnection(form.value);
      } else {
        await addConnection(form.value);
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
.connection-form {
  &__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__unit {
    margin-left: 8px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}
</style>
