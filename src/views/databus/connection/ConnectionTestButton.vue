<template>
  <el-button
    v-hasPermi="['databus:connection:test']"
    type="info"
    plain
    icon="Connection"
    :loading="loading"
    @click="handleTest"
  >
    测试连接
  </el-button>
</template>

<script setup lang="ts" name="ConnectionTestButton">
import type { SysDatabusConnectionBo } from '@/api/databus/connection/types';
import { testConnection } from '@/api/databus/connection';
import { ElMessage } from 'element-plus';

/**
 * 连接测试按钮（连接管理表单弹窗内使用）。
 *
 * 契约：
 * - 接收当前表单值（无需落库），POST /databus/connection/test 直传后端实测
 * - 成功：后端 R.data 为网关自检说明文本，弹 success 提示
 * - 失败：request 拦截器已统一弹出 R.msg 错误提示，这里 catch 静默避免重复弹窗
 * - 前置校验网关实测必需项（connectorType/endpoint/accessKey），
 *   编辑场景 secret 已回显；必填项的完整校验仍由 ConnectionForm 表单 rules 负责
 */
const props = defineProps<{
  formData: SysDatabusConnectionBo;
}>();

const loading = ref(false);

async function handleTest() {
  const form = props.formData;
  if (!form.connectorType) {
    ElMessage.warning('请先选择 Connector 类型');
    return;
  }
  if (!form.endpoint) {
    ElMessage.warning('请先填写连接地址');
    return;
  }
  if (!form.accessKey) {
    ElMessage.warning('请先填写 AccessKey');
    return;
  }
  if (!form.id && !form.apiSecret) {
    ElMessage.warning('请先填写 Secret');
    return;
  }
  loading.value = true;
  try {
    const { data } = await testConnection({ ...form });
    ElMessage.success(data || '测试成功');
  } catch {
    // 错误提示由 request 拦截器统一处理（ElMessage/ElNotification），此处不重复弹窗
  } finally {
    loading.value = false;
  }
}
</script>
