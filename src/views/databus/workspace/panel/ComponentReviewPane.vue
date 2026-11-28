<!--
  组件草稿审阅面板（工作台右栏 tab）：AI 只落 DRAFT，生效须人点采纳。
  两段：源码（只读，诊断标红）/ 编译产物。
  底部操作条仅草稿态出现。
-->
<template>
  <div class="review-pane">
    <div class="review">
      <div v-if="loading" class="review-loading">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>正在读取草稿…</span>
      </div>

      <el-empty v-else-if="!detail" description="草稿不存在或已被处理" :image-size="80" />

      <template v-else>
        <!-- 头部身份卡 -->
        <div class="review-head">
          <span class="review-icon">
            <el-icon><Document /></el-icon>
          </span>
          <div class="review-head-main">
            <div class="review-title-row">
              <div class="review-title">{{ detail.componentName }}</div>
              <el-tag v-if="isDraft" type="warning" size="small" effect="plain">草稿</el-tag>
              <el-tag v-else type="success" size="small" effect="plain">已生效</el-tag>
            </div>
            <div class="review-code">{{ detail.componentCode }}</div>
            <p v-if="detail.description" class="review-desc" :title="detail.description">
              {{ detail.description }}
            </p>
          </div>
        </div>

        <el-tabs v-model="activeTab" class="db-tabs">
          <!-- 源码：只读，编译诊断直接标红 -->
          <el-tab-pane label="源码" name="source">
            <div class="review-tab-pane">
              <JavaCodeEditor
                v-if="detail.scriptBody"
                :model-value="detail.scriptBody"
                :diagnostics="sourceDiagnostics"
                readonly
                height="520px"
              />
              <el-empty v-else description="该草稿没有脚本正文" :image-size="60" />
              <div v-if="sourceDiagnostics.length" class="review-diags">
                <div class="review-diags-title">编译诊断</div>
                <div v-for="(d, i) in sourceDiagnostics" :key="i" class="review-diags-row">
                  <span class="review-diags-pos">{{ d.line > 0 ? `第${d.line}行${d.column > 0 ? `第${d.column}列` : ''}` : '编译' }}</span>
                  <span>{{ d.message }}</span>
                </div>
              </div>
            </div>
          </el-tab-pane>

          <!-- 编译产物：编译期反射出来的契约（前端据此渲染配置表单） -->
          <el-tab-pane label="编译产物" name="artifact">
            <div class="review-tab-pane">
              <el-descriptions :column="2" border size="small" class="review-desc-table">
                <el-descriptions-item label="节点类型">{{ nodeTypeText }}</el-descriptions-item>
                <el-descriptions-item label="配置参数">{{ fieldCount }} 项</el-descriptions-item>
                <el-descriptions-item label="物料分组">{{ groupText }}</el-descriptions-item>
                <el-descriptions-item label="脚本版本">v{{ detail.version ?? 0 }}</el-descriptions-item>
              </el-descriptions>

              <div class="review-section">
                <div class="review-section-title">配置参数</div>
                <SchemaFieldTree v-if="fields.length" :fields="fields" />
                <el-empty v-else description="该组件没有可配置的参数" :image-size="60" />
              </div>

              <div v-if="example" class="review-section">
                <div class="review-section-title">配置示例</div>
                <JsonCodeEditor :model-value="example" readonly height="260px" />
              </div>
            </div>
          </el-tab-pane>

          </el-tabs>
      </template>
    </div>

    <!-- 底部操作条：仅草稿态出现，采纳后无操作。左拒绝、右采纳，各自就地气泡确认 -->
    <div v-if="detail && isDraft" class="review-footer">
      <DbConfirmBubble
        title="拒绝草稿"
        content="草稿将被删除，不可恢复。"
        confirm-text="拒绝"
        danger
        @confirm="onReject"
      >
        <el-button text class="review-btn review-btn--danger" :loading="rejecting">拒绝</el-button>
      </DbConfirmBubble>
      <div class="review-footer-spacer" />
      <DbConfirmBubble
        title="采纳草稿"
        content="立即编译注册并全平台生效，失败自动回滚。"
        confirm-text="采纳"
        @confirm="onAdopt"
      >
        <el-button
          v-hasPermi="['databus:component:edit']"
          text
          class="review-btn review-btn--solid"
          :loading="adopting"
        >
          采纳并生效
        </el-button>
      </DbConfirmBubble>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Document, Loading } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import JavaCodeEditor from '@/views/databus/component/form/JavaCodeEditor.vue';
import DbConfirmBubble from '@/views/databus/components/DbConfirmBubble.vue';
import SchemaFieldTree from '@/views/databus/component/detail/SchemaFieldTree.vue';
import JsonCodeEditor from '@/views/databus/editor/components/common/JsonCodeEditor.vue';
import { adoptScriptDraft, getComponent, rejectScriptDraft } from '@/api/databus/component';
import type { DatabusComponentVo, PropSchema, ScriptDiagnostic } from '@/api/databus/component/types';
import { COMPONENT_STATUS } from '@/constants/databus';
import { groupLabel, nodeTypeLabel, parseSchemaFields, prettyJson } from '@/views/databus/component/model/labels';
import { usePaneRefresh } from '../composables/usePaneRefresh';

defineOptions({ name: 'ComponentReviewPane' });

const props = defineProps<{
  /** 草稿组件主键（DRAFT 行）；雪花 id 可能是字符串，别转 Number */
  componentId: number | string;
  /** 宿主刷新令牌：同一草稿被重写时自增，触发静默重取 */
  refreshToken?: number;
}>();

const emit = defineEmits<{
  (e: 'adopted', payload: { id: number | string; componentCode: string; componentName: string; version?: number }): void;
  (e: 'rejected', payload: { id: number | string; componentCode: string }): void;
}>();

const loading = ref(false);
const detail = ref<DatabusComponentVo | null>(null);
const activeTab = ref<'source' | 'artifact'>('source');

/** 采纳失败时的编译诊断（同时推给源码编辑器标红） */
const adoptDiagnostics = ref<ScriptDiagnostic[]>([]);
const adopting = ref(false);
const rejecting = ref(false);

const isDraft = computed(() => detail.value?.status === COMPONENT_STATUS.DRAFT);
const fields = computed<PropSchema[]>(() => parseSchemaFields(detail.value?.paramSchema) ?? []);
const fieldCount = computed(() => fields.value.length);
const nodeTypeText = computed(() => nodeTypeLabel(detail.value?.nodeType));
const groupText = computed(() => groupLabel(detail.value?.groupName));
const example = computed(() => prettyJson(detail.value?.dataExample));

/** 源码标红诊断：仅采纳失败时带回（草稿入库前已过编译） */
const sourceDiagnostics = computed<ScriptDiagnostic[]>(() => adoptDiagnostics.value);

/**
 * 取草稿详情。
 * @param soft 令牌刷新走静默模式：保留当前子页、不清空 detail（避免闪白）；
 *             但采纳诊断必须清掉——源码已变，旧诊断不再代表当前版本。
 */
async function load(soft = false) {
  if (!soft) {
    loading.value = true;
    detail.value = null;
    activeTab.value = 'source';
  }
  adoptDiagnostics.value = [];
  try {
    const { data } = await getComponent(props.componentId);
    detail.value = data ?? null;
  } finally {
    if (!soft) {
      loading.value = false;
    }
  }
}

watch(
  () => props.componentId,
  () => {
    if (props.componentId != null) {
      void load();
    }
  },
  { immediate: true }
);

// 同 id 草稿被 AI 重写：tab 早已打开，只能靠令牌触发静默重取
usePaneRefresh(props, () => load(true), { immediate: false });

async function onAdopt() {
  if (!detail.value || !isDraft.value || adopting.value) {
    return;
  }
  adopting.value = true;
  try {
    const { data } = await adoptScriptDraft(props.componentId);
    if (!data.success) {
      adoptDiagnostics.value = data.diagnostics ?? [];
      activeTab.value = 'source';
      ElMessage.error(data.message || '采纳失败，请按诊断修正源码');
      return;
    }
    ElMessage.success('已采纳并生效');
    emit('adopted', {
      id: props.componentId,
      componentCode: detail.value.componentCode,
      componentName: detail.value.componentName,
      version: data.version
    });
  } finally {
    adopting.value = false;
  }
}

async function onReject() {
  if (!detail.value || !isDraft.value || rejecting.value) {
    return;
  }
  rejecting.value = true;
  try {
    await rejectScriptDraft(props.componentId);
    ElMessage.success('已拒绝，草稿已删除');
    emit('rejected', { id: props.componentId, componentCode: detail.value.componentCode });
  } finally {
    rejecting.value = false;
  }
}
</script>

<style lang="scss" scoped>
/* 面板占满右栏 tab 内容区：正文滚动，操作条常驻底部 */
.review-pane {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.review {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px 20px 20px;
}

.review-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 60px 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.review-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.review-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
  font-size: 22px;
  background: linear-gradient(135deg, #f0a020, #e6a23c);
}

.review-head-main {
  flex: 1;
  min-width: 0;
}

.review-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.review-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--el-text-color-primary, #1d2129);
}

.review-code {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.review-desc {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--el-text-color-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.review-tab-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.review-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.review-section-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--el-text-color-primary, #1d2129);
  padding-left: 8px;
  border-left: 3px solid var(--el-color-primary);
  line-height: 14px;
}

.review-desc-table {
  :deep(.el-descriptions__label) {
    width: 88px;
    color: var(--el-text-color-secondary);
    font-weight: 400;
  }
}

.review-diags {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.review-diags-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-danger);
}

.review-diags-row {
  display: flex;
  gap: 10px;
  font-family: Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}

.review-diags-pos {
  flex-shrink: 0;
  color: var(--el-color-danger);
}

.review-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-top: 1px solid var(--el-border-color-lighter, #ebeef5);
  background: var(--el-bg-color, #fff);
}

.review-footer-spacer {
  flex: 1;
}

/* ---------------- 按钮：工作台口径（发丝线 + 淡 tint，不用 EP 默认胶囊与投影） ---------------- */
.review-btn.el-button {
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  box-shadow: inset 0 0 0 0.5px var(--db-rule-strong, rgba(60, 60, 67, 0.24));
  color: var(--db-ink-secondary, #3a3a3c);
  font-size: 12.5px;
  font-weight: 500;
  transition:
    background-color 0.15s,
    box-shadow 0.15s,
    color 0.15s;
}

.review-btn.el-button :deep(.el-icon) {
  font-size: 12px;
}

.review-btn.el-button:not(.is-disabled):hover {
  background: var(--db-bg-hover, rgba(120, 120, 128, 0.08));
  box-shadow: inset 0 0 0 0.5px var(--db-rule-strong, rgba(60, 60, 67, 0.24));
  color: var(--db-ink, #1c1c1e);
}

/* 拒绝：常态中性，悬停才转危险色，避免一进来就一团红 */
.review-btn--danger.el-button:not(.is-disabled):hover {
  background: color-mix(in srgb, var(--el-color-danger, #ff3b30) 8%, transparent);
  box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--el-color-danger, #ff3b30) 24%, transparent);
  color: var(--el-color-danger, #ff3b30);
}

/* 采纳：全面板唯一实心按钮，无投影 */
.review-btn--solid.el-button {
  background: var(--db-accent, #1c1c1e);
  box-shadow: none;
  color: var(--db-on-accent, #fff);
}

.review-btn--solid.el-button:not(.is-disabled):hover {
  background: var(--db-accent-hover, #3a3a3c);
  box-shadow: none;
  color: var(--db-on-accent, #fff);
}
</style>