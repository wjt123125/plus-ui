<!--
  自定义组件新增/编辑抽屉（2026-10-07 分包重构：主壳只保留抽屉框架、表单模型与
  加载/提交编排；五个 Tab 各自内聚于 tabs/，参数构造器逻辑沉到 useFieldBuilder，
  脚本执行体沉到 ScriptTab）。
  字段一个不删，按用户心智切五段，每段独立滚动、校验不过 tab 挂红点并自动跳转：
  ① 基础 ② 外观 ③ 参数 ④ 执行体 ⑤ 高级
  el-form 跨组件 provide：子 Tab 内 el-form-item 照常注册，主壳统一 validate。
-->
<template>
  <el-drawer
    v-model="visible"
    size="50%"
    resizable
    append-to-body
    destroy-on-close
    :close-on-click-modal="false"
    modal-class="databus-component-drawer"
    class="component-form"
  >
    <template #header>
      <div class="cf-header">
        <div class="cf-header__title-wrap">
          <span class="cf-header__title">
            <el-tooltip
              :content="form.status === '0' ? '已启用' : '已停用'"
              placement="top"
              :show-after="200"
            >
              <span
                class="cf-header__dot"
                :class="form.status === '0' ? 'is-enabled' : 'is-disabled'"
                aria-hidden="true"
              />
            </el-tooltip>
            {{ isEdit ? '编辑自定义组件' : '新增自定义组件' }}
          </span>
          <span class="cf-header__code">{{ form.componentCode || '未命名编码' }}</span>
        </div>
        <div class="cf-header__enabled" @click.stop>
          <el-switch
            v-model="form.status"
            active-value="0"
            inactive-value="1"
            size="small"
          />
        </div>
      </div>
    </template>

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
          @rolled="handleRolled"
        />
        <AdvancedTab
          :form="form"
          :has-artifact="hasScriptArtifact"
          :invalid="invalidTabs.has('advanced')"
        />
      </el-tabs>
    </el-form>

    <template #footer>
      <div class="cf-footer">
        <el-button @click="visible = false">取 消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确 定</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus';
import { computed, ref, watch } from 'vue';
import { addComponent, getComponent, updateComponent } from '@/api/databus/component';
import type { DatabusComponentForm, ScriptSaveResult } from '@/api/databus/component/types';
import modal from '@/plugins/modal';
import { defaultForm, TAB_OF, type ComponentFormModel, type TabName } from './form.types';
import { useFieldBuilder } from './useFieldBuilder';
import { validateJsonColumn } from './validate';
import AdvancedTab from './tabs/AdvancedTab.vue';
import AppearanceTab from './tabs/AppearanceTab.vue';
import BasicTab from './tabs/BasicTab.vue';
import ParamsTab from './tabs/ParamsTab.vue';
import ScriptTab from './tabs/ScriptTab.vue';

const emit = defineEmits<{
  (e: 'success'): void;
}>();

const visible = ref(false);
const submitting = ref(false);
const detailLoading = ref(false);
const formRef = ref<FormInstance>();
const tagSuggestions = ref<string[]>([]);

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

/** 新增；传 id 为编辑（拉详情回显），suggestions 为台账已有标签聚合 */
async function open(id?: number, suggestions?: string[]) {
  tagSuggestions.value = suggestions ?? [];
  activeTab.value = 'basic';
  invalidTabs.value = new Set();
  hasScriptArtifact.value = false;
  form.value = defaultForm();
  builder.reset();
  scriptTabRef.value?.resetScript();
  visible.value = true;
  if (id == null) {
    return;
  }
  await loadDetail(id);
}

/** 拉详情并回填（首次打开与脚本回滚后复用） */
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
  } finally {
    detailLoading.value = false;
  }
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
  emit('success');
}

/** 回滚产生新版本后：重拉详情同步正文/契约，并通知台账刷新合流态 */
async function handleRolled() {
  if (form.value.id != null) {
    await loadDetail(form.value.id);
  }
  emit('success');
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
    invalidTabs.value = new Set(
      badKeys.map((k) => TAB_OF[k as keyof DatabusComponentForm]!)
    );
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
    visible.value = false;
    emit('success');
  } finally {
    submitting.value = false;
  }
}

defineExpose({ open });
</script>

<style lang="scss" scoped>
.component-form {
  :deep(.el-drawer__header) {
    margin-bottom: 12px;
  }

  :deep(.el-drawer__body) {
    padding-top: 8px;
  }
}

.cf-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: 1;
  min-width: 0;
  margin-right: 8px;

  &__title-wrap {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  &__title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 700;
    color: var(--el-text-color-primary, #1d2129);
  }

  &__code {
    font-family: 'JetBrains Mono', Consolas, monospace;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  &__dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    transition: background-color 0.2s ease, box-shadow 0.2s ease;

    &.is-enabled {
      background-color: var(--el-color-success);
      box-shadow: 0 0 0 3px var(--el-color-success-light-9);
    }

    &.is-disabled {
      background-color: var(--el-text-color-placeholder);
      box-shadow: 0 0 0 3px var(--el-fill-color);
    }
  }

  &__enabled {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
  }
}

.cf-body {
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
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
