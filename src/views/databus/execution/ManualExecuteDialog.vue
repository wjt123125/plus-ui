<!--
  手动执行弹窗（设计档 §4.5）：选择已发布链路 → 按入参登记表默认值预填 JSON → 走正式 execute。
  两个入口共用：执行记录页「手动执行」（不预选链路）、链路卡片「执行」（预选该链路，选择框禁用）。
  执行成功/失败都关闭弹窗并把 DatabusExecutionResult 抛给父组件（失败也有记录，由父组件决定打开详情）。
-->
<template>
  <el-dialog
    :model-value="visible"
    title="手动执行链路"
    width="680px"
    append-to-body
    :close-on-click-modal="false"
    @update:model-value="emit('update:visible', $event)"
    @open="handleOpen"
  >
    <el-alert
      title="仅已发布链路可执行；执行走正式通道，按链路记录档位（BASIC/FULL）生成一条新执行记录。"
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />

    <el-form label-width="92px" @submit.prevent>
      <el-form-item label="选择链路" required>
        <el-select
          v-model="chainId"
          class="chain-select"
          filterable
          :disabled="lockedChainId !== undefined"
          :loading="chainLoading"
          placeholder="选择已发布链路"
          @change="handleChainChange"
        >
          <el-option
            v-for="c in publishedChains"
            :key="String(c.id)"
            :label="`${c.chainName}（#${c.chainCode}）`"
            :value="c.id!"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="执行入参">
        <JsonCodeEditor
          :model-value="requestJson"
          height="300px"
          placeholder='链路入参 JSON，作为上下文文档根 $，如 {"flag":true}'
          @update:model-value="requestJson = $event"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="executing" @click="handleExecute">
        <el-icon><VideoPlay /></el-icon>执行
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { VideoPlay } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { getChain, listChain } from '@/api/databus/chain';
import type { DatabusChainVo } from '@/api/databus/chain/types';
import { executeChain } from '@/api/databus/execution';
import type { DatabusExecutionResult } from '@/api/databus/execution/types';
import { buildDefaultsJson } from '@/views/databus/editor/input-params';
import JsonCodeEditor from '@/views/databus/editor/components/common/JsonCodeEditor.vue';

const STATUS_PUBLISHED = '1';

const props = defineProps<{
  visible: boolean;
  /** 从链路卡片进入时预选链路（选择框禁用）；记录页进入不传 */
  lockedChainId?: number | string;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  /** 执行完成（成败都抛，recordId 为新总账主键，OFF 档为 null） */
  executed: [result: DatabusExecutionResult];
}>();

const chainId = ref<number | string>();
const requestJson = ref('');
const publishedChains = ref<DatabusChainVo[]>([]);
const chainLoading = ref(false);
const executing = ref(false);

/** 弹窗每次打开：加载已发布链路 + 处理预选 */
const handleOpen = async () => {
  requestJson.value = '';
  chainId.value = props.lockedChainId;
  await loadPublishedChains();
  if (props.lockedChainId !== undefined) {
    await prefillDefaults(props.lockedChainId);
  }
};

const loadPublishedChains = async () => {
  chainLoading.value = true;
  try {
    const res = await listChain({
      pageNum: 1,
      pageSize: 500,
      status: STATUS_PUBLISHED
    });
    publishedChains.value = res.data?.rows ?? [];
  } finally {
    chainLoading.value = false;
  }
};

/** 切换/预选链路：拉详情取入参登记表，按默认值预填 JSON */
const handleChainChange = async (id: number | string) => {
  requestJson.value = '';
  await prefillDefaults(id);
};

const prefillDefaults = async (id: number | string) => {
  const detail = await getChain(id);
  const params = detail.data?.inputParams ?? [];
  const defaults = buildDefaultsJson(params);
  if (Object.keys(defaults).length > 0) {
    requestJson.value = JSON.stringify(defaults, null, 2);
  }
};

const handleExecute = async () => {
  if (chainId.value === undefined || chainId.value === null || chainId.value === '') {
    ElMessage.warning('请选择要执行的链路');
    return;
  }
  const json = requestJson.value.trim();
  if (json) {
    try {
      JSON.parse(json);
    } catch {
      ElMessage.error('执行入参不是合法 JSON，请修正后再执行');
      return;
    }
  }
  executing.value = true;
  try {
    const res = await executeChain({ chainId: chainId.value, requestJson: json });
    const result = res.data;
    emit('executed', result);
    emit('update:visible', false);
  } finally {
    executing.value = false;
  }
};
</script>

<style lang="scss" scoped>
.chain-select {
  width: 100%;
}
</style>
