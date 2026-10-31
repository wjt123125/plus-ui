<!--
  连接表单主体（原 ConnectionForm 弹窗剥壳，2026-10-20 管理页 tab 化）。
  工作台 connection-form tab 与新窗体 standalone 裸页共用同一份，故不含 el-dialog；
  结构：head（状态点 + 名称 + enabled 开关）+ 表单 tabs（按连接器 configSchema 的 group 动态生成）+ footer（测试/取消/保存）。
  红线：无路由依赖、不 import Layout、不自行 router.push；动作一律 emit 上抛。
  红线：不出现任何具体连接器的字段名（endpoint/host/…），字段清单一律来自 configSchema（万物皆包）。
  UI 范式承袭原弹窗（Vercel/Linear 极简留白，label-top + 单列）。
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
      <el-tabs v-model="activeTab" class="conn-body__tabs db-tabs">
        <el-tab-pane v-for="tab in tabs" :key="tab" :label="tab" :name="tab">
          <!-- 平台固定字段（与连接器无关），只住第一个 tab -->
          <template v-if="tab === BASIC_GROUP">
            <el-form-item label="连接ID" prop="connectionId">
              <el-input v-model="form.connectionId" maxlength="64" placeholder="全局唯一,如 bpm-prod" />
            </el-form-item>
            <el-form-item label="连接名称" prop="connectionName">
              <el-input v-model="form.connectionName" maxlength="100" placeholder="请输入连接名称" />
            </el-form-item>
            <el-form-item label="连接器类型" prop="connectorType">
              <el-select
                v-model="form.connectorType"
                placeholder="选择连接器类型"
                style="width: 100%"
                @change="handleTypeChange"
              >
                <el-option
                  v-for="opt in connectorOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                  :disabled="!opt.usable"
                >
                  <span>{{ opt.label }}</span>
                  <!-- 不可用的选项当场说清为什么（缺驱动 / 未装载 / 未启用），
                       别让用户选完填完一整张表单再在测试时报错 -->
                  <span v-if="!opt.usable" class="conn-body__opt-flag" :title="opt.healthReason">
                    {{ opt.healthLabel }}
                  </span>
                </el-option>
              </el-select>
              <div v-if="!connectorOptions.length" class="conn-body__hint">
                未取到连接器清单：请确认已有连接器包处于「已上架」，且当前账号具备 databus:connector:list 权限
              </div>
              <!-- 已选中的类型后来坏了（编辑存量连接时会遇到）：选项置灰挡不住已存的值，这里补一句人话 -->
              <div v-if="typeBlockReason" class="conn-body__hint conn-body__hint--warn">{{ typeBlockReason }}</div>
            </el-form-item>
          </template>

          <!-- 连接器自己的配置字段：清单/控件/必填/显隐全部来自 configSchema，前端不写死字段名 -->
          <ConnectionSchemaForm
            v-if="hasSchema"
            :model="form.config"
            :schema="configSchema"
            :group="tab"
            :is-edit="isEdit"
          />
          <!-- 老包（manifest 没存 configSchema）降级为裸 JSON 编辑，保住可用性 -->
          <el-form-item v-else-if="tab === BASIC_GROUP && form.connectorType" label="连接配置" prop="config">
            <el-input
              v-model="configText"
              type="textarea"
              :rows="8"
              placeholder='连接器配置 JSON，如 {"host":"127.0.0.1","port":5432,"database":"demo","username":"postgres","password":"xxx"}'
            />
            <div class="conn-body__hint">
              该连接器包未提供 configSchema，只能直接填写配置 JSON；敏感字段编辑时留空即沿用旧值
            </div>
          </el-form-item>

          <!-- 备注：平台字段，落在最后一个 tab 末尾 -->
          <el-form-item v-if="tab === lastTab" label="备注" prop="remark">
            <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="500" placeholder="请输入备注" />
          </el-form-item>
        </el-tab-pane>
      </el-tabs>
    </el-form>

    <footer class="conn-body__footer">
      <ConnectionTestButton
        :form-data="testPayload"
        :schema="hasSchema ? configSchema : undefined"
        :is-edit="isEdit"
        :block-reason="typeBlockReason"
      />
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
import { ElMessage } from 'element-plus';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { SysDatabusConnectionBo } from '@/api/databus/connection/types';
import {
  addConnection,
  getConnection,
  updateConnection
} from '@/api/databus/connection';
import modal from '@/plugins/modal';
import ConnectionTestButton from '@/views/databus/connection/ConnectionTestButton.vue';
import ConnectionSchemaForm from './ConnectionSchemaForm.vue';
import { BASIC_GROUP, buildConfigRules, schemaGroups } from './connectionSchema';
import { useConnectorOptions } from './useConnectorOptions';
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

/**
 * 本地表单模型：config 收紧成非空对象。
 * SysDatabusConnectionBo.config 可空，但 ConnectionSchemaForm / SchemaField 是**原地读写** model，
 * 传 undefined 进去会让用户填的值静默丢失，故表单内部一律保证 config 是对象。
 */
type ConnectionFormModel = SysDatabusConnectionBo & { config: Record<string, unknown> };

const buildInitFormData = (): ConnectionFormModel => ({
  id: undefined,
  connectionId: '',
  connectionName: '',
  connectorType: '',
  enabled: 'Y',
  remark: '',
  config: {}
});

const form = ref<ConnectionFormModel>(buildInitFormData());

const isEdit = computed(() => props.connectionId !== 'new');

/* 连接器清单：唯一来源是 def 表（无静态兜底，§15.7）；options 供选择器，schemaOf 供动态表单 */
const { options: connectorOptions, loadConnectorOptions, connectorLabelOf, schemaOf, healthOf } =
  useConnectorOptions();

/** 当前 connectorType 对应的可读 label */
const currentConnectorLabel = computed(() => connectorLabelOf(form.value.connectorType));

/**
 * 当前所选连接器不可用时的原因（§4.2.1：缺驱动 / 未装载 / 未启用一律挡新建连接）。
 * 健康是运行态，随时会变——编辑一条存量连接时它的连接器可能已经坏了，故这里现算不缓存。
 */
const typeBlockReason = computed(() => {
  const type = form.value.connectorType;
  if (!type) {
    return '';
  }
  const health = healthOf(type);
  return health.usable ? '' : `${health.label}：${health.reason}`;
});

/** 所选连接器的 configSchema（老包 manifest 没存则为空对象） */
const configSchema = computed(() => schemaOf(form.value.connectorType));

/** 有 schema 才走动态表单，否则降级为裸 JSON 编辑器 */
const hasSchema = computed(() => Object.keys(configSchema.value).length > 0);

/** tab 清单＝schema 的 group 去重保序（BASIC_GROUP 恒第一）；无 schema 时只剩一个「基础」 */
const tabs = computed<string[]>(() => {
  const groups = schemaGroups(configSchema.value);
  return groups.length > 0 ? groups : [BASIC_GROUP];
});

/** 备注住最后一个 tab */
const lastTab = computed(() => tabs.value[tabs.value.length - 1]);

/**
 * 激活 tab。换连接器 / 重载后 activeTab 可能停在一个已不存在的分组上（pane 全空），
 * 一律夹回第一个；不用手动在每处赋值点复位。
 */
const activeTab = ref(BASIC_GROUP);
watch(tabs, (list) => {
  if (!list.includes(activeTab.value)) {
    activeTab.value = list[0];
  }
});

/** 降级模式下的 config JSON 编辑器文本（与 form.config 双向：保存前 parse / 回显时 stringify） */
const configText = ref('');

/** 换连接器类型：config 是上一个连接器的字段集，必须清空，否则会把无关键提交给新连接器 */
function handleTypeChange() {
  form.value.config = {};
  configText.value = '';
}

/**
 * 测试连接入参。schema 模式下 form.config 就是编辑态本身，直接透传；
 * 降级模式下 config 由 JSON 文本持有，parse 失败置 undefined，由按钮提示「请先填写连接配置」。
 * 敏感字段留空**不剥离**：后端 isBlankValue 把 null 与空串同等看待，会自行从库中补齐旧值。
 */
const testPayload = computed<SysDatabusConnectionBo>(() => {
  if (hasSchema.value) {
    return { ...form.value };
  }
  const payload: SysDatabusConnectionBo = { ...form.value };
  if (!configText.value.trim()) {
    payload.config = undefined;
    return payload;
  }
  try {
    payload.config = JSON.parse(configText.value);
  } catch {
    payload.config = undefined;
  }
  return payload;
});

/**
 * 校验规则：三个平台固定字段写死，config.* 全部由 schema 生成
 * （键名与 SchemaField 的 namePath 对齐，故 el-form 能按点路径取值）。
 * 隐藏字段与编辑态的敏感字段由 buildConfigRules 自动跳过。
 */
const rules = computed<Record<string, unknown>>(() => ({
  connectionId: [
    { required: true, message: '连接ID不能为空', trigger: 'blur' },
    { max: 64, message: '连接ID长度不能超过64', trigger: 'blur' }
  ],
  connectionName: [
    { required: true, message: '连接名称不能为空', trigger: 'blur' },
    { max: 100, message: '连接名称长度不能超过100', trigger: 'blur' }
  ],
  connectorType: [{ required: true, message: '连接器类型不能为空', trigger: 'change' }],
  ...buildConfigRules(configSchema.value, form.value.config, isEdit.value)
}));

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

/** 回显：form.config → config JSON 编辑器文本（null/空则空串，避免把 "{}" 灌给用户） */
function syncConfigTextFromForm() {
  const cfg = form.value.config;
  configText.value = cfg && Object.keys(cfg).length > 0 ? JSON.stringify(cfg, null, 2) : '';
}

async function reload() {
  form.value = buildInitFormData();
  activeTab.value = BASIC_GROUP;
  configText.value = '';
  if (props.connectionId === 'new') {
    await nextTick();
    markBaseline();
    return;
  }
  detailLoading.value = true;
  try {
    const { data } = await getConnection(props.connectionId);
    // config 必须是可变对象：SchemaField 直接原地写 model[name]；老数据可能整列缺省，统一兜成 {}
    form.value = { ...buildInitFormData(), ...data, config: { ...(data.config ?? {}) } };
    syncConfigTextFromForm();
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
    // 降级模式：config 由 JSON 文本编辑器持有，提交前 parse 回对象
    if (!hasSchema.value) {
      if (!configText.value.trim()) {
        ElMessage.warning('请填写连接配置 JSON');
        return;
      }
      try {
        form.value.config = JSON.parse(configText.value);
      } catch {
        ElMessage.warning('连接配置 JSON 格式非法，请检查括号/引号');
        return;
      }
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

onMounted(() => {
  void reload();
  void loadConnectorOptions();
});
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

/* 页签胶囊样式统一走全局 .db-tabs（databus-tabs），此处只留 pane 内边距修正 */
.conn-body__tabs {
  :deep(.el-tab-pane) {
    padding: 0 2px;

    .el-form-item:last-child {
      margin-bottom: 0;
    }
  }
}

.conn-body__hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

/* 不可用原因用告警色，与上面的灰色说明分开——它是故障，不是补充说明 */
.conn-body__hint--warn {
  color: var(--el-color-warning);
}

/* 选择器选项尾部的健康角标：右浮，不与选项名挤在一处 */
.conn-body__opt-flag {
  float: right;
  margin-left: 16px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
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