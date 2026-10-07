<!-- ④ 执行体 Tab：新建态锁定；编辑态按 databus:component:script:edit 开放 Java 脚本宿主 -->
<template>
  <el-tab-pane name="script">
    <template #label>
      <TabLabel title="执行体" :invalid="invalid" />
    </template>
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
    <!-- 编辑态且有权限 -->
    <div v-else>
      <div class="cf-script-head">
        <el-tag size="small" :type="hasArtifact ? 'success' : 'info'" effect="plain">
          {{ hasArtifact ? `已发布 v${form.version ?? '-'}` : '尚未编写脚本' }}
        </el-tag>
        <span class="cf-script-head__spacer" />
        <el-button size="small" plain :disabled="!form.id" @click="openVersions">
          版本历史{{ hasArtifact ? `（v${form.version ?? '-'} 最新）` : '' }}
        </el-button>
        <el-tooltip
          content="保存即编译并全局热更，等同服务端发版；编译失败不落库"
          placement="top"
          :show-after="200"
        >
          <el-button
            type="primary"
            size="small"
            :icon="Promotion"
            :loading="scriptSaving"
            @click="handleSaveScript"
          >
            发布
          </el-button>
        </el-tooltip>
      </div>
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="脚本等同服务端代码发布：保存即编译并立即全局生效，编译失败整体不落库、现网继续跑旧版。"
        class="cf-locked-alert"
      />
      <JavaCodeEditor
        v-model="scriptText"
        :diagnostics="compileDiagnostics"
        class="cf-script-editor"
        height="calc(100vh - 240px)"
        placeholder="粘贴/编写完整 Java 类源码（统一包名 org.dromara.databus.script；@DatabusCmp 的 code 建议留空）"
      />
      <div v-if="compileDiagnostics.length" class="cf-diag">
        <div class="cf-diag__title">
          编译失败，{{ compileDiagnostics.length }} 处错误，本次未保存{{
            compileMessage ? '：' + compileMessage : ''
          }}
        </div>
        <div v-for="(d, di) in compileDiagnostics" :key="di" class="cf-diag__row">
          <span v-if="d.line > 0" class="cf-diag__loc">[{{ d.line }}:{{ d.column }}]</span>
          <span class="cf-diag__msg">{{ d.message }}</span>
        </div>
      </div>
    </div>

    <ScriptVersionDrawer ref="versionDrawerRef" @rolled="emit('rolled')" />
  </el-tab-pane>
</template>

<script setup lang="ts">
import { Promotion } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { computed, ref } from 'vue';
import { saveScript } from '@/api/databus/component';
import type { ScriptDiagnostic, ScriptSaveResult } from '@/api/databus/component/types';
import modal from '@/plugins/modal';
import { checkPermi } from '@/utils/permission';
import type { ComponentFormModel } from '../form.types';
import JavaCodeEditor from '../JavaCodeEditor.vue';
import ScriptVersionDrawer from '../ScriptVersionDrawer.vue';
import TabLabel from './TabLabel.vue';

defineOptions({ name: 'ScriptTab' });

const props = defineProps<{
  form: ComponentFormModel;
  hasArtifact: boolean;
  invalid?: boolean;
}>();

const emit = defineEmits<{
  /** 脚本发布成功：主壳回写物化列 + 重建字段构造器 + 通知台账刷新 */
  (e: 'published', data: ScriptSaveResult, scriptBody: string): void;
  /** 版本回滚后：主壳重拉详情 */
  (e: 'rolled'): void;
}>();

const isEdit = computed(() => props.form.id != null);
const canEditScript = computed(() => checkPermi(['databus:component:script:edit']));

const scriptText = ref('');
const scriptSaving = ref(false);
const compileDiagnostics = ref<ScriptDiagnostic[]>([]);
const compileMessage = ref('');
const versionDrawerRef = ref<InstanceType<typeof ScriptVersionDrawer>>();

/** 新建态重置 */
function resetScript() {
  scriptText.value = '';
  scriptSaving.value = false;
  compileDiagnostics.value = [];
  compileMessage.value = '';
}

/** 详情加载/回滚后回填正文并清错 */
function applyScript(body: string | null | undefined) {
  scriptText.value = body ?? '';
  scriptSaving.value = false;
  compileDiagnostics.value = [];
  compileMessage.value = '';
}

/** 保存脚本：编译失败 success=false（诊断上行内标红+错误列表），不落库不弹全局错 */
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
      return;
    }
    compileMessage.value = '';
    compileDiagnostics.value = [];
    modal.msgSuccess(`脚本已保存发布（v${data.version}，物化字段 ${data.fieldCount ?? 0} 个），已全局热更`);
    emit('published', data, scriptText.value);
  } finally {
    scriptSaving.value = false;
  }
}

function openVersions() {
  if (props.form.id == null) {
    return;
  }
  versionDrawerRef.value?.open(props.form.id, props.form.version);
}

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

.cf-script-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;

  &__spacer {
    flex: 1;
  }
}

.cf-diag {
  margin-top: 10px;
  border: 1px solid var(--el-color-danger-light-5, #fab6b6);
  border-radius: 8px;
  background: var(--el-color-danger-light-9, #fef0f0);
  padding: 10px 12px;
  max-height: 200px;
  overflow-y: auto;

  &__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--el-color-danger, #f56c6c);
    margin-bottom: 6px;
  }

  &__row {
    display: flex;
    gap: 8px;
    font-size: 12px;
    line-height: 1.7;
    color: var(--el-text-color-regular, #363b41);
  }

  &__loc {
    flex-shrink: 0;
    font-family: 'JetBrains Mono', Consolas, monospace;
    color: var(--el-color-danger, #f56c6c);
    font-weight: 600;
  }
}

/* 矮屏兜底：calc 视口高不足时保底 480px，抽屉 body 自身滚动 */
.cf-script-editor :deep(.java-code-editor__core) {
  min-height: 480px;
}
</style>
