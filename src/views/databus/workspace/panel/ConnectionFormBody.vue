<!--
  连接表单主体（原 ConnectionForm 弹窗剥壳，2026-10-20 管理页 tab 化）。
  工作台 connection-form tab 与新窗体 standalone 裸页共用同一份，故不含 el-dialog；
  结构：head（状态点 + 名称 + enabled 开关）+ 表单 tabs（基础/高级）+ footer（测试/取消/保存）。
  红线：无路由依赖、不 import Layout、不自行 router.push；动作一律 emit 上抛。
  UI 范式承袭原弹窗（Vercel/Linear 极简留白，label-top + 单列 + 单位后缀 append）。
-->
<template>
  <div class="conn-body">
    <header class="conn-body__head">
      <el-tooltip
        :content="form.enabled === 'Y' ? '已启用' : '已禁用'"
        placement="top"
        :show-after="200"
      >
        <span
          class="conn-body__dot"
          :class="form.enabled === 'Y' ? 'is-enabled' : 'is-disabled'"
          aria-hidden="true"
        />
      </el-tooltip>
      <div class="conn-body__title-wrap">
        <span class="conn-body__title">{{ isEdit ? '编辑连接' : '新建连接' }}</span>
        <span class="conn-body__code">
          {{ form.connectionId || '未命名连接ID' }} · {{ currentConnectorLabel }}
        </span>
      </div>
      <span class="conn-body__spacer" />
      <el-switch v-model="form.enabled" active-value="Y" inactive-value="N" size="small" />
    </header>

    <el-form
      ref="formRef"
      v-loading="detailLoading"
      :model="form"
      :rules="rules"
      label-position="top"
      class="conn-body__form"
    >
      <el-tabs v-model="activeTab" class="conn-body__tabs">
        <el-tab-pane label="基础" name="basic">
          <el-form-item label="连接ID" prop="connectionId">
            <el-input v-model="form.connectionId" maxlength="64" placeholder="全局唯一,如 bpm-prod" />
          </el-form-item>
          <el-form-item label="连接名称" prop="connectionName">
            <el-input v-model="form.connectionName" maxlength="100" placeholder="请输入连接名称" />
          </el-form-item>
          <el-form-item label="连接地址" prop="endpoint">
            <el-input v-model="form.endpoint" maxlength="255" placeholder="BPM 容器地址,如 http://localhost:8088" />
          </el-form-item>
          <el-form-item label="AccessKey" prop="accessKey" class="conn-body__credential">
            <el-input
              v-model="form.accessKey"
              maxlength="128"
              placeholder="CC 身份策略 access_key,如 databus"
            />
          </el-form-item>
          <el-form-item label="Secret" prop="apiSecret" class="conn-body__credential">
            <el-input
              v-model="form.apiSecret"
              type="password"
              maxlength="128"
              show-password
              :placeholder="isEdit ? '留空表示不修改' : 'CC 身份策略 secret'"
            />
          </el-form-item>
        </el-tab-pane>
        <el-tab-pane label="高级" name="advanced">
          <el-form-item label="超时时间" prop="timeout">
            <el-input
              :model-value="form.timeout == null ? '' : String(form.timeout)"
              placeholder="30000"
              class="conn-body__input-with-unit"
              @update:model-value="handleNumberUpdate('timeout', $event)"
            >
              <template #append>毫秒</template>
            </el-input>
          </el-form-item>
          <el-form-item label="重试次数" prop="retryCount">
            <el-input
              :model-value="form.retryCount == null ? '' : String(form.retryCount)"
              placeholder="0"
              class="conn-body__input-with-unit"
              @update:model-value="handleNumberUpdate('retryCount', $event)"
            >
              <template #append>次</template>
            </el-input>
            <div class="conn-body__hint">1D-P0 保留字段</div>
          </el-form-item>
          <el-form-item label="备注" prop="remark">
            <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="500" placeholder="请输入备注" />
          </el-form-item>
        </el-tab-pane>
      </el-tabs>
    </el-form>

    <footer class="conn-body__footer">
      <ConnectionTestButton :form-data="form" />
      <span v-if="dirty" class="conn-body__dirty">有未保存的改动</span>
      <span class="conn-body__spacer" />
      <el-button size="small" @click="emit('cancel')">取 消</el-button>
      <el-button size="small" type="primary" :loading="submitting" @click="handleSubmit">
        保 存
      </el-button>
    </footer>
  </div>
</template>

<script setup lang="ts" name="ConnectionFormBody">
import type { FormInstance } from 'element-plus';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { SysDatabusConnectionBo } from '@/api/databus/connection/types';
import {
  CONNECTOR_OPTIONS,
  addConnection,
  getConnection,
  updateConnection
} from '@/api/databus/connection';
import modal from '@/plugins/modal';
import ConnectionTestButton from '@/views/databus/connection/ConnectionTestButton.vue';
import type { ConnectionSaved } from '../workbench.types';

/**
 * 连接表单主体。
 * - connectionId='new' 即新增；数字为编辑（挂载/切换时按主键 GET /{id} 回显详情）
 * - 保存成功 emit('saved', payload)，由宿主决定关 tab / 刷新列表 / 改标题
 * - 表单快照比对上报 dirty-change，供 tab 条脏圆点与关闭确认
 */
const props = defineProps<{
  connectionId: number | 'new';
}>();

const emit = defineEmits<{
  (e: 'saved', payload: ConnectionSaved): void;
  (e: 'cancel'): void;
  (e: 'dirty-change', dirty: boolean): void;
}>();

const detailLoading = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();

const buildInitFormData = (): SysDatabusConnectionBo => ({
  id: undefined,
  connectionId: '',
  connectionName: '',
  connectorType: 'bpmHttp',
  endpoint: '',
  accessKey: '',
  apiSecret: '',
  timeout: 30000,
  retryCount: 0,
  enabled: 'Y',
  remark: ''
});

const form = ref<SysDatabusConnectionBo>(buildInitFormData());

/** 激活 tab；重载时复位到「基础」，避免上次编辑停在「高级」 */
const activeTab = ref<'basic' | 'advanced'>('basic');

const isEdit = computed(() => props.connectionId !== 'new');

/** 当前 connectorType 对应的可读 label（后续多 connector 时改 dynamic map） */
const currentConnectorLabel = computed(
  () =>
    CONNECTOR_OPTIONS.find((item) => item.value === form.value.connectorType)?.label ??
    form.value.connectorType
);

/** openapi 网关 secret：新增必填，编辑留空表示沿用原密钥 */
const validateApiSecret = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  if (!form.value.id && (!value || !value.trim())) {
    callback(new Error('Secret 不能为空'));
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
  accessKey: [
    { required: true, message: 'AccessKey 不能为空', trigger: 'blur' },
    { max: 128, message: 'AccessKey 长度不能超过128', trigger: 'blur' }
  ],
  apiSecret: [
    { max: 128, message: 'Secret 长度不能超过128', trigger: 'blur' },
    { validator: validateApiSecret, trigger: 'blur' }
  ],
  timeout: [{ required: true, message: '超时时间不能为空', trigger: 'blur' }]
};

/**
 * el-input #append 替代 input-number 后,需要手动把字符串转回 number 写回 form。
 * 空字符串视为 undefined(让后端兜底默认值),NaN 也兜底为 undefined 避免污染数据。
 */
function handleNumberUpdate(field: 'timeout' | 'retryCount', value: string) {
  if (value === '') {
    form.value[field] = undefined;
    return;
  }
  const num = Number(value);
  form.value[field] = Number.isNaN(num) ? undefined : num;
}

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

async function reload() {
  form.value = buildInitFormData();
  activeTab.value = 'basic';
  if (props.connectionId === 'new') {
    await nextTick();
    markBaseline();
    return;
  }
  detailLoading.value = true;
  try {
    const { data } = await getConnection(props.connectionId);
    form.value = { ...buildInitFormData(), ...data };
    await nextTick();
    markBaseline();
  } finally {
    detailLoading.value = false;
  }
}

function handleSubmit() {
  formRef.value?.validate(async (valid: boolean) => {
    if (!valid) {
      return;
    }
    const isNew = !form.value.id;
    submitting.value = true;
    try {
      if (isNew) {
        await addConnection(form.value);
      } else {
        await updateConnection(form.value);
      }
      modal.msgSuccess(isNew ? '新增成功' : '修改成功');
      markBaseline();
      emit('saved', { connectionName: form.value.connectionName, isNew });
    } finally {
      submitting.value = false;
    }
  });
}

onMounted(reload);
watch(() => props.connectionId, reload);

defineExpose({ reload });
</script>

<style lang="scss" scoped>
.conn-body {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: var(--el-bg-color, #fff);
}

.conn-body__head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
}

.conn-body__title-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.conn-body__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--el-text-color-primary, #1d2129);
}

.conn-body__code {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conn-body__spacer {
  flex: 1;
}

.conn-body__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
  transition:
    background-color 0.2s ease,
    box-shadow 0.2s ease;

  &.is-enabled {
    background-color: var(--el-color-success);
    box-shadow: 0 0 0 3px var(--el-color-success-light-9);
  }

  &.is-disabled {
    background-color: var(--el-text-color-placeholder);
    box-shadow: 0 0 0 3px var(--el-fill-color);
  }
}

.conn-body__form {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 20px 20px;

  :deep(.el-form-item) {
    margin-bottom: 10px;
  }

  :deep(.el-form-item__label) {
    padding-bottom: 4px;
    font-weight: 500;
    color: var(--el-text-color-primary);
    line-height: 1.5;
  }

  :deep(.el-form-item__content) {
    line-height: 1.5;
  }
}

.conn-body__tabs {
  :deep(.el-tabs__header) {
    margin: 0 0 8px;
    padding: 0 2px;
  }

  :deep(.el-tabs__nav-wrap::after) {
    height: 1px;
    background-color: var(--el-border-color-lighter);
  }

  :deep(.el-tabs__item) {
    height: 30px;
    font-size: 13px;
    font-weight: 500;
    padding: 0 14px;
  }

  :deep(.el-tab-pane) {
    padding: 0 2px;

    .el-form-item:last-child {
      margin-bottom: 0;
    }
  }
}

.conn-body__credential {
  :deep(.el-input__inner) {
    font-family: var(--el-font-family-mono, 'JetBrains Mono', Menlo, Monaco, Consolas, monospace);
    letter-spacing: 0.2px;
  }
}

.conn-body__input-with-unit {
  :deep(.el-input-group__append) {
    min-width: 56px;
    padding: 0 12px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
    background-color: var(--el-fill-color-light);
  }
}

.conn-body__hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.conn-body__footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-top: 1px solid var(--el-border-color-lighter, #ebeef5);
}

.conn-body__dirty {
  font-size: 12px;
  color: var(--el-color-warning, #e6a23c);
}
</style>