<!--
  连接表单主体（原 ConnectionForm 弹窗剥壳，2026-10-20 管理页 tab 化）。
  工作台 connection-form tab 与新窗体 standalone 裸页共用同一份，故不含 el-dialog。

  结构契约（2026-11-08 schema 驱动改造后）：
  - 页头（平台壳）拥有：标题、启用开关、连接ID（后端生成，只读）与连接器类型标签；
  - 平台表单区只放可编辑的平台字段：连接名称；新建时额外提供连接器类型选择（编辑态类型不可变，
    不再重复渲染一次——页头已经是它的唯一落点）；
  - 页签只承载连接器自己声明的东西：groups 元数据的顺序即 tab 顺序，字段清单一律来自 configSchema；
  - 平台字段与备注**绝不进 configSchema**，也绝不写死在前端。

  红线：无路由依赖、不 import Layout、不自行 router.push；动作一律 emit 上抛。
  红线：不出现任何具体连接器的字段名（endpoint/host/…），也不出现 "基础"/"高级" 这类具体分组名——
  分组标题、主组、列数、标签位置全部读连接器声明（老包才走「按 group 首次出现顺序」兜底）。
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
      <span class="conn-body__title">{{ isEdit ? '编辑连接' : '新建连接' }}</span>
      <span class="conn-body__code">
        {{ form.connectionId || '连接ID 保存后生成' }} · {{ currentConnectorLabel }}
      </span>
      <span class="conn-body__spacer" />
      <el-tooltip content="停用的连接不会进入运行时连接池" placement="top" :show-after="200">
        <el-switch v-model="form.enabled" active-value="Y" inactive-value="N" size="small" />
      </el-tooltip>
    </header>

    <div class="conn-body__scroll">
      <div class="conn-body__rail">
        <!-- 平台字段区：连接名称（新建时再加连接器类型选择；类型在编辑态不可变，只在页头展示一次），
             外加它们的空态/故障提示。标签在控件上方，与连接器字段同一套 label-top 节奏；
             提示必须紧跟所属字段，不能被分割线划到连接器配置那一侧 -->
        <div class="conn-body__platform">
          <div class="conn-body__meta">
            <div class="conn-body__meta-item conn-body__meta-item--grow">
              <span class="conn-body__meta-label">连接名称</span>
              <el-input v-model="form.connectionName" maxlength="100" placeholder="给这条连接起个名字" />
            </div>
            <!-- 连接器类型：只在新建时可选。同 type 多版本共存，选择项是「连接器 + 版本」，
                 落库锁 connectorDefId；编辑态不可更改，它的值与连接ID一起放在页头，
                 同一信息不在同一屏出现两次，也少一个只能看不能点的死控件 -->
            <div v-if="!isEdit" class="conn-body__meta-item">
              <span class="conn-body__meta-label">连接器版本</span>
              <el-select
                v-model="form.connectorDefId"
                placeholder="选择连接器与版本"
                class="conn-body__meta-type"
                @change="handleDefChange"
              >
                <el-option
                  v-for="opt in defOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.defId"
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
            </div>
          </div>
          <div v-if="!defOptions.length && !form.connectorType" class="conn-body__hint">
            未取到连接器清单：请确认已有连接器包处于「已上架」，且当前账号具备 databus:connector:list 权限
          </div>
          <!-- 已选中的类型后来坏了（编辑存量连接时会遇到）：选项置灰挡不住已存的值，这里补一句人话 -->
          <div v-if="typeBlockReason" class="conn-body__hint conn-body__hint--warn">
            {{ typeBlockReason }}
          </div>
        </div>

        <el-form
          ref="formRef"
          v-loading="detailLoading"
          :model="form"
          :rules="rules"
          label-position="top"
          class="conn-body__form"
        >
          <el-tabs v-model="activeTab" class="conn-body__tabs db-tabs">
            <el-tab-pane v-for="tab in tabs" :key="tab.key" :label="tab.title" :name="tab.key">
              <!-- 连接器自己的配置字段：清单/控件/必填/显隐/列数/宽度全部来自声明，前端不写死字段名 -->
              <ConnectionSchemaForm
                v-if="hasSchema"
                :model="form.config"
                :schema="configSchema"
                :group="tab.key"
                :columns="tab.columns"
                :is-edit="isEdit"
              />
              <!-- 老包（manifest 没存 configSchema）降级为裸 JSON 编辑，保住可用性 -->
              <el-form-item
                v-else-if="tab.key === firstTabKey && form.connectorType"
                label="连接配置"
                prop="config"
              >
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
              <el-form-item v-if="tab.key === lastTabKey" label="备注" prop="remark">
                <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="500" placeholder="请输入备注" />
              </el-form-item>
            </el-tab-pane>
          </el-tabs>
        </el-form>
      </div>
    </div>

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
import { buildConfigRules, resolveGroups, type ResolvedGroup } from './connectionSchema';
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
  connectorDefId: undefined,
  enabled: 'Y',
  remark: '',
  config: {}
});

const form = ref<ConnectionFormModel>(buildInitFormData());

const isEdit = computed(() => props.connectionId !== 'new');

/* 连接器清单：唯一来源是 def 表（无静态兜底，§15.7）；defOptions 供版本级选择，
   schemaOf/groupsOf/healthOf 按 (type, version) 精确取，存量回显用 defById */
const { defOptions, loadConnectorOptions, connectorLabelOf, defOf, defById, schemaOf, groupsOf, healthOf } =
  useConnectorOptions();

/** 当前锁定的 def 行：优先按 connectorDefId 精确命中；存量连接没锁版本时按 type 取最新启用版兜底 */
const currentDef = computed(() => defById(form.value.connectorDefId) ?? defOf(form.value.connectorType));

/** 当前 def 的主键（统一成 number 提交；未取到为 undefined） */
const currentDefId = computed<number | undefined>(() => {
  const id = currentDef.value?.id;
  return id === undefined || id === null || id === '' ? undefined : Number(id);
});

/** 当前连接器（含版本）的可读标签 */
const currentConnectorLabel = computed(() => {
  const label = connectorLabelOf(form.value.connectorType);
  const version = currentDef.value?.version;
  return version ? `${label} · v${version}` : label;
});

/**
 * 当前所选连接器不可用时的原因（§4.2.1：缺驱动 / 未装载 / 未启用一律挡新建连接）。
 * 健康是运行态，随时会变——编辑一条存量连接时它的连接器可能已经坏了，故这里现算不缓存。
 */
const typeBlockReason = computed(() => {
  const type = form.value.connectorType;
  if (!type) {
    return '';
  }
  const health = healthOf(type, currentDef.value?.version);
  return health.usable ? '' : `${health.label}：${health.reason}`;
});

/** 所选连接器的 configSchema（老包 manifest 没存则为空对象） */
const configSchema = computed(() => schemaOf(form.value.connectorType, currentDef.value?.version));

/** 有 schema 才走动态表单，否则降级为裸 JSON 编辑器 */
const hasSchema = computed(() => Object.keys(configSchema.value).length > 0);

/**
 * 页签清单＝连接器声明的 groups（顺序即 tab 顺序，主组排第一由声明决定）。
 * 老包没声明 groups 时由 resolveGroups 按字段 group 首次出现顺序兜底；
 * 完全没有 schema（降级模式）时给一个承载 JSON 编辑器与备注的单页签。
 */
const tabs = computed<ResolvedGroup[]>(() => {
  const declared = resolveGroups(configSchema.value, groupsOf(form.value.connectorType, currentDef.value?.version));
  if (declared.length > 0) {
    return declared;
  }
  return [
    {
      key: 'config',
      title: '配置',
      primary: true,
      columns: 1
    }
  ];
});

/** 首个 / 末个页签 key：降级 JSON 编辑器住首个，备注住末个 */
const firstTabKey = computed(() => tabs.value[0].key);
const lastTabKey = computed(() => tabs.value[tabs.value.length - 1].key);

/**
 * 激活页签 key。换连接器 / 重载后可能停在一个已不存在的分组上（pane 全空），
 * 一律夹回第一个；不用手动在每处赋值点复位。
 */
const activeTab = ref('');
watch(tabs, (list) => {
  if (!list.some((t) => t.key === activeTab.value)) {
    activeTab.value = list[0].key;
  }
});

/** 降级模式下的 config JSON 编辑器文本（与 form.config 双向：保存前 parse / 回显时 stringify） */
const configText = ref('');

/**
 * 切换连接器版本：config 是上一个连接器的字段集，必须清空，否则会把无关键提交给新连接器。
 * 选项值就是 def 主键，选中即锁定版本；type 从选项里回填（页面标题、标签展示仍按 type）。
 */
function handleDefChange(defId: number | string) {
  const def = defById(defId);
  form.value.connectorType = def?.type ?? '';
  form.value.config = {};
  configText.value = '';
}

/**
 * 测试连接入参。schema 模式下 form.config 就是编辑态本身，直接透传；
 * 降级模式下 config 由 JSON 文本持有，parse 失败置 undefined，由按钮提示「请先填写连接配置」。
 * 敏感字段留空**不剥离**：后端 isBlankValue 把 null 与空串同等看待，会自行从库中补齐旧值。
 */
const testPayload = computed<SysDatabusConnectionBo>(() => {
  // 带上解析后的 def 主键：存量连接没锁版本时也要按当前回显的那一版测，不能测到别的版本
  const base: SysDatabusConnectionBo = {
    ...form.value,
    connectorDefId: currentDefId.value ?? form.value.connectorDefId
  };
  if (hasSchema.value) {
    return base;
  }
  const payload: SysDatabusConnectionBo = { ...base };
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
 * 校验规则：平台字段（名称/类型）在页头，走提交时的手工检查；
 * config.* 全部由 schema 生成（键名与 SchemaField 的 namePath 对齐，故 el-form 能按点路径取值）。
 * 隐藏字段与编辑态的敏感字段由 buildConfigRules 自动跳过。
 */
const rules = computed<Record<string, unknown>>(() => ({
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
  activeTab.value = tabs.value[0].key;
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
    form.value = { ...buildInitFormData(), ...data, config: { ...data.config } };
    syncConfigTextFromForm();
    await nextTick();
    markBaseline();
  } finally {
    detailLoading.value = false;
  }
}

function handleSubmit() {
  // 平台字段在页头（不在 el-form 里），先做两道手工检查，再交给 schema 校验
  if (!form.value.connectionName.trim()) {
    ElMessage.warning('请填写连接名称');
    return;
  }
  if (!form.value.connectorType) {
    ElMessage.warning('请选择连接器版本');
    return;
  }
  if (!isEdit.value && !form.value.connectorDefId) {
    ElMessage.warning('请选择连接器版本');
    return;
  }
  // 锁版：新建必然已选 def；编辑存量连接时把未锁版本的记录锚定到当前回显的那一版
  form.value.connectorDefId = currentDefId.value ?? form.value.connectorDefId;
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
  gap: 12px;
  padding: 12px 24px;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
}

.conn-body__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary, #1d2129);
  white-space: nowrap;
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

/* 内容区：单栏铁轨 + 最大宽度。表单字段有天然的长度上限，
   铺满整个工作台宽度会显得松散、控件被拉长，反而比窄栏更难扫读 */
.conn-body__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 24px 28px;
}

.conn-body__rail {
  width: 100%;
  /* 表单有天然的长度上限：铺满整个工作台会把输入框拉成 900px 的空条，
     扫读路径变长且控件与内容比例失衡。左对齐窄轨是 Vercel / Linear 设置页的标准做法 */
  max-width: 640px;
}

/* 平台字段区（名称/类型 + 提示）：细分割线划开「平台信息」与「连接器配置」——
   两类字段来源不同，用色彩或卡片区分过重，一条 1px 线足够 */
.conn-body__platform {
  padding-bottom: 18px;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
}

.conn-body__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.conn-body__meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.conn-body__meta-item--grow {
  flex: 1;
  min-width: 180px;
}

.conn-body__meta-label {
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-regular);
}

.conn-body__meta-type {
  width: 220px;
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
  margin-top: 16px;

  :deep(.el-form-item) {
    margin-bottom: 14px;
  }

  /* 标签单行、常规字重、次级色：比默认深色加粗更安静，让输入框成为视觉主体 */
  :deep(.el-form-item__label) {
    padding-bottom: 4px;
    font-size: 13px;
    font-weight: 400;
    line-height: 1.5;
    color: var(--el-text-color-regular);
  }

  :deep(.el-form-item__content) {
    line-height: 1.5;
  }
}

/* 页签胶囊样式统一走全局 .db-tabs（databus-tabs），此处只留 pane 内边距修正 */
.conn-body__tabs {
  :deep(.el-tab-pane) {
    padding: 2px;

    .el-form-item:last-child {
      margin-bottom: 0;
    }
  }
}

.conn-body__hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
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
  padding: 12px 24px;
  border-top: 1px solid var(--el-border-color-lighter, #ebeef5);
}

.conn-body__dirty {
  font-size: 12px;
  color: var(--el-color-warning, #e6a23c);
}
</style>