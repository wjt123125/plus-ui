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
 * - 成功：后端 R.data 为"BPM 连接测试成功: ..."说明文本，弹 success 提示
 * - 失败：request 拦截器已统一弹出 R.msg 错误提示，这里 catch 静默避免重复弹窗
 * - 前置校验只做后端实测必需项（connectorType/endpoint/username）与白名单 JSON 格式，
 *   必填项的完整校验仍由 ConnectionForm 表单 rules 负责
 */
const props = defineProps<{
  formData: SysDatabusConnectionBo;
}>();

const loading = ref(false);

/** 校验非空时的 IP 白名单必须是 JSON 数组（与后端 parseIpWhiteList 口径一致） */
function validateIpWhiteList(raw?: string): string | null {
  if (!raw || !raw.trim()) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 'IP 白名单不是合法 JSON，格式如 ["192.168.1.1","10.0.0.0/24"]';
  }
  if (!Array.isArray(parsed)) {
    return 'IP 白名单必须是 JSON 数组，格式如 ["192.168.1.1","10.0.0.0/24"]';
  }
  return null;
}

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
  if (!form.username) {
    ElMessage.warning('请先填写用户名');
    return;
  }
  const ipError = validateIpWhiteList(form.ipWhiteList);
  if (ipError) {
    ElMessage.warning(ipError);
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
