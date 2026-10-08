<!--
  ④ 执行体 Tab：新建态锁定；编辑态按 databus:component:script:edit 开放 Java 脚本宿主。
  苹果风统一卡片（与 FormPane 分段控件同套 Safari token）：卡头（状态点+版本文案+发布按钮）
  → 编辑器 → 底部状态条三态。旧布局的工具行、常驻警告条、卡内错误列表全部撤除，
  编译明细汇入工作台级底部控制台（useCompileConsole），净增约 30px 编辑器高度。
-->
<template>
  <el-tab-pane name="script">
    <!-- 新建态：先存治理行 -->
    <div v-if="!isEdit" class="cf-locked">
      <el-tag size="small" type="info" effect="plain">保存后开放</el-tag>
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="先完成基础信息保存；再次打开编辑后即可在此编写完整 Java 类源码，保存即编译、热更全局生效。"
        class="cf-locked-alert"
      />
    </div>
    <!-- 编辑态但无脚本权限 -->
    <div v-else-if="!canEditScript" class="cf-locked">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="你没有脚本编辑权限（databus:component:script:edit）。脚本等同服务端代码发布，仅受信作者可维护。"
        class="cf-locked-alert"
      />
    </div>
    <!-- 编辑态且有权限：统一卡片 -->
    <div v-else class="cf-script-card">
      <div class="cf-script-card__head">
        <span class="cf-script-card__dot" :class="hasArtifact ? 'is-published' : 'is-empty'" />
        <span class="cf-script-card__state">
          {{ hasArtifact ? `已发布 v${form.version ?? '-'}` : '尚未编写脚本' }}
        </span>
        <span class="cf-script-card__spacer" />
        <el-button text size="small" :disabled="!form.id" @click="openVersions">代码变更</el-button>
        <el-tooltip
          content="保存即编译并全局热更，等同服务端发版；编译失败不落库"
          placement="top"
          :show-after="200"
        >
          <el-button
            type="primary"
            size="small"
            round
            :loading="scriptSaving"
            @click="handleSaveScript"
          >
            发布
          </el-button>
        </el-tooltip>
      </div>
      <JavaCodeEditor
        ref="scriptEditorRef"
        v-model="scriptText"
        :diagnostics="compileDiagnostics"
        class="cf-script-card__editor"
        height="calc(100vh - 210px)"
        placeholder="粘贴/编写完整 Java 类源码（统一包名 org.dromara.databus.script；@DatabusCmp 的 code 建议留空）"
      />
      <div class="cf-script-card__status" :class="`is-${scriptState}`" @click="onStatusClick">
        <SvgIcon v-if="scriptState === 'error'" icon-class="lucide:circle-alert" class="cf-script-card__status-icon" />
        <span>{{ statusText }}</span>
      </div>
    </div>
  </el-tab-pane>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { computed, nextTick, ref, watch } from 'vue';
import { saveScript } from '@/api/databus/component';
import type { ScriptDiagnostic, ScriptSaveResult } from '@/api/databus/component/types';
import modal from '@/plugins/modal';
import { checkPermi } from '@/utils/permission';
import { useLucideSubset } from '../../../workbench/composables/useLucideSubset';
import { useCompileConsole } from '../../../workbench/composables/useCompileConsole';
import type { ComponentFormModel } from '../form.types';
import JavaCodeEditor from '../JavaCodeEditor.vue';

defineOptions({ name: 'ScriptTab' });

const props = defineProps<{
  form: ComponentFormModel;
  hasArtifact: boolean;
}>();

const emit = defineEmits<{
  /** 脚本发布成功：主壳回写物化列 + 重建字段构造器 + 通知台账刷新 */
  (e: 'published', data: ScriptSaveResult, scriptBody: string): void;
  /** 打开「代码变更」tab（原版本历史抽屉已升级为右栏独立 tab） */
  (e: 'open-changes'): void;
}>();

const isEdit = computed(() => props.form.id != null);
const canEditScript = computed(() => checkPermi(['databus:component:script:edit']));

const scriptText = ref('');
const scriptSaving = ref(false);
const compileDiagnostics = ref<ScriptDiagnostic[]>([]);
const compileMessage = ref('');
/** 状态条三态：idle 提示语 / error 可点开控制台 / ok 发布确认 */
const scriptState = ref<'idle' | 'error' | 'ok'>('idle');
/** 脚本体已回填：reveal 跳行依赖编辑器内容就绪，空文档跳行会钳到第 1 行 */
const scriptLoaded = ref(false);

const scriptEditorRef = ref<InstanceType<typeof JavaCodeEditor>>();

const cc = useCompileConsole();
const { revealTarget, consumeReveal } = cc;

useLucideSubset();

const statusText = computed(() => {
  switch (scriptState.value) {
    case 'error':
      return `编译失败 · ${compileDiagnostics.value.length} 处错误，点击查看详情`;
    case 'ok':
      return `已发布 v${props.form.version ?? '-'} · 全局热更生效`;
    default:
      return '脚本等同服务端发布 · 保存即编译并全局生效 · 失败不落库、现网跑旧版';
  }
});

/** 新建态重置 */
function resetScript() {
  scriptText.value = '';
  scriptSaving.value = false;
  compileDiagnostics.value = [];
  compileMessage.value = '';
  scriptState.value = 'idle';
  scriptLoaded.value = false;
}

/** 详情加载/回滚后回填正文并清错 */
function applyScript(body: string | null | undefined) {
  scriptText.value = body ?? '';
  scriptSaving.value = false;
  compileDiagnostics.value = [];
  compileMessage.value = '';
  scriptState.value = 'idle';
  scriptLoaded.value = true;
}

/**
 * 保存脚本：编译失败不落库不弹全局错（行内标红 + 底部控制台 + 状态条三联反馈），成功即全局热更。
 */
async function handleSaveScript() {
  if (props.form.id == null || scriptSaving.value) {
    return;
  }
  if (!scriptText.value.trim()) {
    ElMessage.error('脚本正文不能为空');
    return;
  }
  scriptSaving.value = true;
  try {
    const { data } = await saveScript({
      id: props.form.id,
      scriptLang: 'java',
      scriptBody: scriptText.value
    });
    if (!data.success) {
      compileMessage.value = data.message || '编译失败';
      compileDiagnostics.value = data.diagnostics ?? [];
      scriptState.value = 'error';
      cc.append({
        level: 'error',
        componentId: props.form.id,
        code: props.form.componentCode,
        text: compileMessage.value,
        diagnostics: compileDiagnostics.value
      });
      return;
    }
    compileMessage.value = '';
    compileDiagnostics.value = [];
    scriptState.value = 'ok';
    cc.append({
      level: 'success',
      componentId: props.form.id,
      code: props.form.componentCode,
      text: `发布成功 v${data.version}，物化字段 ${data.fieldCount ?? 0} 个，已全局热更`,
      diagnostics: []
    });
    modal.msgSuccess(`脚本已保存发布（v${data.version}，物化字段 ${data.fieldCount ?? 0} 个），已全局热更`);
    emit('published', data, scriptText.value);
  } finally {
    scriptSaving.value = false;
  }
}

/** 状态条点击：仅 error 态有意义——展开底部编译控制台 */
function onStatusClick() {
  if (scriptState.value === 'error') {
    cc.open.value = true;
  }
}

function openVersions() {
  if (props.form.id == null) {
    return;
  }
  emit('open-changes');
}

/**
 * 控制台跳行最后一棒：revealTarget 指向本组件且脚本体已回填时消费目标并跳行。
 * 三源监听覆盖两种时序——已开 tab（revealTarget 变化触发）、新开 tab（loadDetail 后
 * form.id 与 scriptLoaded 同时就位触发）；nextTick 等编辑器挂载、文档同步完成。
 */
watch(
  [revealTarget, () => props.form.id, scriptLoaded],
  ([target]) => {
    if (!target || target.componentId !== props.form.id || !scriptLoaded.value) {
      return;
    }
    consumeReveal();
    void nextTick(() => scriptEditorRef.value?.reveal(target.line, target.column));
  }
);

defineExpose({ resetScript, applyScript });
</script>

<style lang="scss" scoped>
.cf-locked {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cf-locked-alert {
  margin: 0;
}

/* 苹果风统一卡片：与 FormPane 分段控件同一套 Safari token（14px 圆角 + 白卡片 + 浮起投影） */
.cf-script-card {
  display: flex;
  flex-direction: column;
  border-radius: var(--app-radius-lg, 14px);
  background: var(--el-bg-color, #fff);
  box-shadow: var(
    --wb-tab-card-shadow,
    0 0 0 1px rgba(15, 23, 42, 0.05),
    0 1px 2px rgba(15, 23, 42, 0.1),
    0 2px 8px rgba(15, 23, 42, 0.08)
  );
  overflow: hidden;

  &__head {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 6px 0 12px;
  }

  &__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    transition:
      background-color 0.2s ease,
      box-shadow 0.2s ease;

    &.is-published {
      background-color: var(--el-color-success);
      box-shadow: 0 0 0 3px var(--el-color-success-light-9);
    }

    &.is-empty {
      background-color: var(--el-text-color-placeholder);
      box-shadow: 0 0 0 3px var(--el-fill-color);
    }
  }

  &__state {
    font-size: 12px;
    font-weight: 600;
    color: var(--el-text-color-regular);
  }

  &__spacer {
    flex: 1;
  }

  &__editor {
    flex: 1;
    min-height: 0;
  }

  &__status {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 12px;
    font-size: 11px;
    color: var(--el-text-color-placeholder);
    border-top: 1px solid var(--el-border-color-lighter, #ebeef5);

    &.is-error {
      color: var(--el-color-danger, #f56c6c);
      cursor: pointer;

      &:hover {
        background: var(--el-color-danger-light-9, #fef0f0);
      }
    }

    &.is-ok {
      color: var(--el-color-success, #67c23a);
    }
  }

  &__status-icon {
    font-size: 13px;
    flex-shrink: 0;
  }
}

/* 编辑器融入卡片：去外框去圆角撑满卡身；矮屏兜底保底 480px，卡内不滚动由抽屉 body 自滚动 */
.cf-script-card :deep(.java-code-editor) {
  border: none;
  border-radius: 0;
}

.cf-script-card :deep(.java-code-editor__core) {
  min-height: 480px;
}
</style>
