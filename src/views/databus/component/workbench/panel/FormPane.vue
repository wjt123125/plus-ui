<!--
  组件编辑面板（工作台右栏 tab 内容，原新增/编辑抽屉剥壳而来）。
  主壳只保留面板框架、表单模型与加载/提交编排；五个 Tab 各自内聚于 form/tabs/，
  参数构造器逻辑在 useFieldBuilder，脚本执行体在 ScriptTab。
  字段一个不删，按用户心智切五段，校验不过 tab 挂红点并自动跳转：
  ① 基础 ② 外观 ③ 参数 ④ 执行体 ⑤ 高级
  el-form 跨组件 provide：子 Tab 内 el-form-item 照常注册，主壳统一 validate。
  tab 内容缓存不销毁：切走草稿保留，脏状态通过 dirty-change 上报给 tab 条。
-->
<template>
  <div class="cf-pane">
    <header class="cf-head">
      <el-tooltip
        :content="form.status === '0' ? '已启用' : '已停用'"
        placement="top"
        :show-after="200"
      >
        <span
          class="cf-head__dot"
          :class="form.status === '0' ? 'is-enabled' : 'is-disabled'"
          aria-hidden="true"
        />
      </el-tooltip>
      <div class="cf-head__title-wrap">
        <span class="cf-head__title">{{ isEdit ? '编辑组件' : '新增组件' }}</span>
        <span class="cf-head__code">{{ form.componentCode || '未命名编码' }}</span>
      </div>
      <span class="cf-head__spacer" />
      <el-switch v-model="form.status" active-value="0" inactive-value="1" size="small" />
    </header>

    <el-form
      ref="formRef"
      v-loading="detailLoading"
      :model="form"
      :rules="rules"
      label-position="top"
      class="cf-body"
    >
      <el-tabs v-model="activeTab" class="cf-tabs">
        <BasicTab :form="form" :is-edit="isEdit" :invalid="invalidTabs.has('basic')" />
        <AppearanceTab
          :form="form"
          :tag-suggestions="tagSuggestions"
          :invalid="invalidTabs.has('appearance')"
        />
        <ParamsTab
          :form="form"
          :builder="builder"
          :has-artifact="hasScriptArtifact"
          :invalid="invalidTabs.has('params')"
        />
        <ScriptTab
          ref="scriptTabRef"
          :form="form"
          :has-artifact="hasScriptArtifact"
          :invalid="invalidTabs.has('script')"
          @published="onScriptPublished"
          @open-changes="emit('open-changes')"
        />
        <AdvancedTab
          :form="form"
          :has-artifact="hasScriptArtifact"
          :invalid="invalidTabs.has('advanced')"
        />
      </el-tabs>
    </el-form>

    <footer class="cf-footer">
      <span v-if="dirty" class="cf-footer__dirty">有未保存的改动</span>
      <span class="cf-footer__spacer" />
      <el-button size="small" @click="emit('cancel')">取 消</el-button>
      <el-button size="small" type="primary" :loading="submitting" @click="handleSubmit">
        保 存
      </el-button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { addComponent, getComponent, updateComponent } from '@/api/databus/component';
import type { DatabusComponentForm, ScriptSaveResult } from '@/api/databus/component/types';
import modal from '@/plugins/modal';
import { defaultForm, TAB_OF, type ComponentFormModel, type TabName } from '../../form/form.types';
import { useFieldBuilder } from '../../form/useFieldBuilder';
import { validateJsonColumn } from '../../form/validate';
import AdvancedTab from '../../form/tabs/AdvancedTab.vue';
import AppearanceTab from '../../form/tabs/AppearanceTab.vue';
import BasicTab from '../../form/tabs/BasicTab.vue';
import ParamsTab from '../../form/tabs/ParamsTab.vue';
import ScriptTab from '../../form/tabs/ScriptTab.vue';
import type { ComponentSaved, FormPreset } from '../workbench.types';

defineOptions({ name: 'ComponentFormPane' });

const props = defineProps<{
  /** databus_component 行 id；空为新增 */
  dbId?: number;
  /** 台账已有标签聚合，供标签输入联想 */
  tagSuggestions?: string[];
  /** 宿主自增触发重载（回滚/外部保存后同步） */
  refreshToken?: number;
  /** 新增态的目录上下文预设（树目录节点右键「新建组件」携带 group/domain） */
  preset?: FormPreset;
}>();

const emit = defineEmits<{
  (e: 'saved', payload: ComponentSaved): void;
  (e: 'cancel'): void;
  (e: 'dirty-change', dirty: boolean): void;
  /** 执行体 Tab 请求打开同组件「代码变更」tab */
  (e: 'open-changes'): void;
}>();

const submitting = ref(false);
const detailLoading = ref(false);
const formRef = ref<FormInstance>();

/** 当前激活 tab 与校验不过的 tab 集合（红点 + 自动跳转） */
const activeTab = ref<TabName>('basic');
const invalidTabs = ref<Set<TabName>>(new Set());

const form = ref<ComponentFormModel>(defaultForm());

/** 参数构造器（字段行 / 双模式 / 序列化） */
const builder = useFieldBuilder();

/** 已存在脚本工件（script_body 非空）：契约四列被脚本物化正本接管，治理只读 */
const hasScriptArtifact = ref(false);
const scriptTabRef = ref<InstanceType<typeof ScriptTab>>();

const isEdit = computed(() => form.value.id != null);

const rules: FormRules<DatabusComponentForm> = {
  componentCode: [
    { required: true, message: '组件编码不能为空', trigger: 'blur' },
    {
      pattern: /^[A-Za-z][A-Za-z0-9_-]{0,63}$/,
      message: '字母开头，仅含字母/数字/-/_，最长 64',
      trigger: 'blur'
    }
  ],
  componentName: [
    { required: true, message: '组件名称不能为空', trigger: 'blur' },
    { max: 100, message: '长度不超过 100 个字符', trigger: 'blur' }
  ],
  category: [{ required: true, message: '请选择台账分类', trigger: 'change' }]
};

/** 脏状态基线：表单 + 构造器状态的快照，与当前快照不等即为脏 */
const dirty = ref(false);
let baseline = '';

function snapshot(): string {
  return JSON.stringify({
    form: form.value,
    rows: builder.fieldRows.value,
    jsonMode: builder.jsonMode.value,
    schemaJson: builder.schemaJson.value
  });
}

function markBaseline() {
  baseline = snapshot();
  dirty.value = false;
  emit('dirty-change', false);
}

watch(
  () => snapshot(),
  (val) => {
    if (val === baseline) {
      return;
    }
    const next = !detailLoading.value;
    if (next !== dirty.value) {
      dirty.value = next;
      emit('dirty-change', next);
    }
  }
);

/**
 * 表单任意变化后静默复校：红点随修随灭；valid 时清空集合。
 * 仅在已有红点时触发，避免每次击键都跑全量校验。
 */
watch(
  form,
  () => {
    if (!invalidTabs.value.size || !formRef.value) {
      return;
    }
    formRef.value.validate((valid, fields) => {
      if (valid) {
        invalidTabs.value = new Set();
        return;
      }
      invalidTabs.value = new Set(
        Object.keys(fields ?? {}).map((k) => TAB_OF[k as keyof DatabusComponentForm]!)
      );
    });
  },
  { deep: true }
);

/** 复位为空表单（新增，或切换编辑对象时先清场） */
function resetForm() {
  activeTab.value = 'basic';
  invalidTabs.value = new Set();
  hasScriptArtifact.value = false;
  form.value = defaultForm();
  applyPreset();
  builder.reset();
  scriptTabRef.value?.resetScript();
}

/** 目录右键「新建组件」的上下文预设；仅新增态生效，避免用户在表单里再选一次 */
function applyPreset() {
  if (props.dbId != null || !props.preset) {
    return;
  }
  if (props.preset.group !== undefined) {
    form.value.groupName = props.preset.group;
  }
  form.value.domain = props.preset.domain ?? null;
}

/** 拉详情并回填（首次挂载、宿主刷新与脚本回滚后复用） */
async function loadDetail(id: number) {
  detailLoading.value = true;
  try {
    const { data } = await getComponent(id);
    form.value = {
      id: data.id,
      componentCode: data.componentCode,
      componentName: data.componentName,
      shortName: data.shortName ?? '',
      category: data.category,
      groupName: data.groupName ?? '',
      domain: data.domain ?? null,
      icon: data.icon ?? '',
      color: data.color ?? '',
      sort: data.sort ?? 100,
      description: data.description ?? '',
      tags: data.tags ?? [],
      nodeType: data.nodeType ?? 'NODE',
      editor: data.editor ?? 'form',
      paramSchema: data.paramSchema ?? '',
      dataExample: data.dataExample ?? '',
      inputSchema: data.inputSchema ?? '',
      outputSchema: data.outputSchema ?? '',
      scriptLang: data.scriptLang ?? '',
      scriptBody: data.scriptBody ?? '',
      version: data.version ?? null,
      status: data.status ?? '0',
      deprecated: data.deprecated ?? '0',
      deprecateNote: data.deprecateNote ?? '',
      docUrl: data.docUrl ?? '',
      remark: data.remark ?? ''
    };
    hasScriptArtifact.value = !!data.scriptBody;
    // schema 解析失败时 builder 自行锁定 JSON 模式并装原文（不丢数据）
    builder.load(form.value.paramSchema ?? '');
    scriptTabRef.value?.applyScript(data.scriptBody);
    await nextTick();
    markBaseline();
  } finally {
    detailLoading.value = false;
  }
}

/** 重载当前面板（宿主 refreshToken 变化时调用） */
async function reload() {
  resetForm();
  if (props.dbId != null) {
    await loadDetail(props.dbId);
    return;
  }
  await nextTick();
  markBaseline();
}

/** 脚本发布成功：物化列回写 form + 重建字段构造器（ScriptTab 已负责清错与提示） */
function onScriptPublished(data: ScriptSaveResult, scriptBody: string) {
  hasScriptArtifact.value = true;
  form.value.version = data.version ?? form.value.version;
  form.value.scriptLang = data.scriptLang ?? 'java';
  form.value.scriptBody = scriptBody;
  if (data.nodeType) {
    form.value.nodeType = data.nodeType;
  }
  if (data.editor) {
    form.value.editor = data.editor;
  }
  form.value.paramSchema = data.paramSchema ?? '';
  if (data.dataExample != null) {
    form.value.dataExample = data.dataExample;
  }
  // 物化 schema 必然合法；强制回到可视化只读字段列表
  builder.load(form.value.paramSchema);
  emitSaved();
}

function emitSaved() {
  emit('saved', {
    id: form.value.id,
    code: form.value.componentCode,
    name: form.value.componentName,
    version: form.value.version
  });
}

/** el-form 校验：回调形式收集逐字段错误，供 tab 红点与跳转 */
function validateFormFields(): Promise<{ valid: boolean; fields: Record<string, unknown> }> {
  return new Promise((resolve) => {
    formRef.value!.validate((valid, fields) => {
      resolve({ valid: !!valid, fields: (fields ?? {}) as Record<string, unknown> });
    });
  });
}

/** 参数构造器校验失败：params tab 挂红点并跳过去 */
function markParamsInvalid() {
  invalidTabs.value = new Set([...invalidTabs.value, 'params']);
  activeTab.value = 'params';
}

async function handleSubmit() {
  if (!formRef.value) {
    return;
  }
  const { valid, fields } = await validateFormFields();
  if (!valid) {
    const badKeys = Object.keys(fields);
    invalidTabs.value = new Set(badKeys.map((k) => TAB_OF[k as keyof DatabusComponentForm]!));
    activeTab.value = TAB_OF[badKeys[0] as keyof DatabusComponentForm]!;
    return;
  }

  // 字段构造器校验 + 序列化（失败弹消息、展开问题行）
  const schema = builder.commit();
  if (schema === null) {
    markParamsInvalid();
    return;
  }
  form.value.paramSchema = schema;

  // 高级区 JSON 列校验（CodeMirror 实时标红，提交再兜底）
  if (
    !validateJsonColumn('配置示例', form.value.dataExample, false) ||
    !validateJsonColumn('输入 Schema', form.value.inputSchema) ||
    !validateJsonColumn('输出 Schema', form.value.outputSchema)
  ) {
    invalidTabs.value = new Set([...invalidTabs.value, 'advanced']);
    activeTab.value = 'advanced';
    return;
  }

  // 工件三列不走治理提交（脚本走独立保存端点；后端对库存件另有契约列保护）
  const { scriptLang: _lang, scriptBody: _body, version: _ver, ...payload } = form.value;
  submitting.value = true;
  try {
    if (isEdit.value) {
      await updateComponent(payload);
    } else {
      await addComponent(payload);
    }
    modal.msgSuccess(isEdit.value ? '修改成功' : '新增成功');
    markBaseline();
    emitSaved();
  } finally {
    submitting.value = false;
  }
}

onMounted(reload);

// 编辑对象切换 / 宿主请求刷新 / 新建预设换目录
watch(
  () => [props.dbId, props.refreshToken, props.preset?.group, props.preset?.domain],
  () => {
    // 新建表单已有草稿时只就地改预设，不清空用户输入
    if (props.dbId == null && dirty.value) {
      applyPreset();
      return;
    }
    reload();
  }
);

defineExpose({ reload });
</script>

<style lang="scss" scoped>
.cf-pane {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: var(--el-bg-color, #fff);
}

.cf-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);

  &__title-wrap {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  &__title {
    font-size: 15px;
    font-weight: 700;
    color: var(--el-text-color-primary, #1d2129);
  }

  &__code {
    font-family: 'JetBrains Mono', Consolas, monospace;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  &__spacer {
    flex: 1;
  }

  &__dot {
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
}

.cf-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 20px 20px;

  :deep(.el-form-item) {
    margin-bottom: 12px;
  }

  :deep(.el-form-item__label) {
    padding-bottom: 4px;
    font-weight: 500;
    line-height: 1.5;
  }

  :deep(.el-form-item__content) {
    line-height: 1.5;
  }
}

.cf-tabs {
  :deep(.el-tabs__header) {
    margin: 0 0 10px;
  }

  :deep(.el-tabs__nav-wrap::after) {
    height: 1px;
    background-color: var(--el-border-color-lighter);
  }

  :deep(.el-tabs__item) {
    height: 32px;
    font-size: 13px;
    font-weight: 500;
    padding: 0 14px;
  }

  :deep(.el-tab-pane) {
    .el-form-item:last-child {
      margin-bottom: 0;
    }
  }
}

.cf-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-top: 1px solid var(--el-border-color-lighter, #ebeef5);

  &__dirty {
    font-size: 12px;
    color: var(--el-color-warning, #e6a23c);
  }

  &__spacer {
    flex: 1;
  }
}
</style>
