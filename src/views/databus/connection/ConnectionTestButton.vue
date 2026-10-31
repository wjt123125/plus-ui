<template>
  <el-button
    v-hasPermi="['databus:connection:test']"
    type="info"
    plain
    icon="Connection"
    :loading="loading"
    :disabled="!!blockReason"
    :title="blockReason"
    @click="handleTest"
  >
    测试连接
  </el-button>
</template>

<script setup lang="ts" name="ConnectionTestButton">
import type { SysDatabusConnectionBo } from '@/api/databus/connection/types';
import type { ConnectorConfigField } from '@/api/databus/connector/types';
import { testConnection, testResultMessage } from '@/api/databus/connection';
import { ElMessage } from 'element-plus';
import { findMissingRequired } from '@/views/databus/workspace/panel/connectionSchema';

/**
 * 连接测试按钮（连接表单 footer 内使用）。
 *
 * 契约：
 * - 接收当前表单值（无需落库），POST /databus/connection/test 直传后端实测
 * - 成功：返回体形态由连接器决定（方案 §10.1），一律经 testResultMessage 取文案再弹提示，
 *   否则 JDBC 的结构化返回会弹成 [object Object]
 * - 失败：request 拦截器已统一弹出 R.msg 错误提示，这里 catch 静默避免重复弹窗
 * - 前置校验走 schema（万物皆包：平台不认识任何具体字段）：必填项清单与显隐规则都来自
 *   所选连接器的 configSchema，敏感字段在编辑态放行（后端 mergeMissingSensitive 从库中补齐）
 * - 连接器本身不健康（缺驱动 / 未装载 / 未启用）时按钮禁用：宿主传 blockReason，
 *   它既是禁用理由也是 hover 文案（§4.2.1），别让人点一下再吃一个后端异常
 */
const props = withDefaults(
  defineProps<{
    formData: SysDatabusConnectionBo;
    /** 所选连接器的 configSchema；空表示该包没提供 schema，降级为「config 非空」粗校验 */
    schema?: Record<string, ConnectorConfigField>;
    /** 编辑态：敏感字段留空即沿用库中旧值，不参与必填校验 */
    isEdit?: boolean;
    /** 禁用理由（人话）：非空即禁用按钮，同时做 hover 提示 */
    blockReason?: string;
  }>(),
  { schema: undefined, isEdit: false, blockReason: '' }
);

const loading = ref(false);

async function handleTest() {
  const form = props.formData;
  if (!form.connectorType) {
    ElMessage.warning('请先选择连接器类型');
    return;
  }
  const config = form.config ?? {};
  const entries = Object.entries(props.schema ?? {});
  if (entries.length > 0) {
    const missing = findMissingRequired(props.schema, config, props.isEdit);
    if (missing) {
      ElMessage.warning(`请先填写${missing}`);
      return;
    }
  } else if (Object.keys(config).length === 0) {
    ElMessage.warning('请先填写连接配置');
    return;
  }
  loading.value = true;
  try {
    const { data } = await testConnection({ ...form });
    ElMessage.success(testResultMessage(data));
  } catch {
    // 错误提示由 request 拦截器统一处理（ElMessage/ElNotification），此处不重复弹窗
  } finally {
    loading.value = false;
  }
}
</script>
