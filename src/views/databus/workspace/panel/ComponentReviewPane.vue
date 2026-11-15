<!--
  组件草稿审阅面板（工作台右栏 tab 内容）：
  AI 只落 DRAFT（不注册、不投放），本面板是唯一「人点生效」入口。
  三段——「源码」（只读，编译诊断标红）/「编译产物」（节点类型 + 参数表单 + 配置示例 +
  AI 自查备注）/「试跑」（人自己用临时节点验一遍，跑完即摘，不落库）。
  底部常驻：拒绝（删草稿）/ 采纳（转启用 + 编译注册，全平台即时可用）。
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

        <el-alert
          v-if="isDraft"
          type="warning"
          :closable="false"
          show-icon
          title="草稿尚未生效"
          description="采纳前不进编辑器物料面板、不能被链路引用。采纳＝立即编译注册并全平台可用；拒绝＝删除该草稿。"
          class="review-alert"
        />
        <el-alert
          v-else
          type="success"
          :closable="false"
          show-icon
          title="已采纳生效"
          description="该组件已编译注册，可在编辑器物料面板拖入链路。源码如需修改，走「代码变更」保存新的正式版本。"
          class="review-alert"
        />

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
                <el-descriptions-item v-if="detail.remark" label="AI 自查" :span="2">
                  {{ detail.remark }}
                </el-descriptions-item>
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

          <!-- 试跑：临时节点即注即摘，不落库、不写执行记录 -->
          <el-tab-pane label="试跑" name="probe">
            <div class="review-tab-pane">
              <div class="review-section">
                <div class="review-section-title">上下文数据（可选）</div>
                <JsonCodeEditor v-model="probeInput" height="150px" placeholder="{ }" />
                <div class="review-hint">
                  填入的 JSON 会作为上下文根 $ 传给组件；组件内无画布配置，<code>cfg</code> 为空，脚本需容忍。
                </div>
              </div>

              <div class="review-probe-actions">
                <el-button type="primary" plain size="small" :icon="VideoPlay" :loading="probing" @click="runProbe">
                  试跑一次
                </el-button>
                <span class="review-hint">临时注册一个节点跑完即摘，不落库、不占执行记录。</span>
              </div>

              <template v-if="probeResult">
                <el-alert
                  :type="probeResult.success ? 'success' : 'error'"
                  :closable="false"
                  show-icon
                  :title="probeResult.success ? `试跑通过（${probeResult.costMs ?? 0} ms）` : '试跑失败'"
                  :description="probeResult.success ? '单节点无画布配置，只验证编译与执行路径。' : probeResult.message || ''"
                />
                <div v-if="probeResult.nodeErrors?.length" class="review-section">
                  <div class="review-section-title">节点错误</div>
                  <div v-for="(err, i) in probeResult.nodeErrors" :key="i" class="review-probe-error">{{ err }}</div>
                </div>
                <div v-if="probeResult.risks?.length" class="review-section">
                  <div class="review-section-title">危险 API 提示</div>
                  <div v-for="(risk, i) in probeResult.risks" :key="i" class="review-probe-risk">{{ risk }}</div>
                </div>
                <div v-if="probeResult.output" class="review-section">
                  <div class="review-section-title">执行后上下文</div>
                  <JsonCodeEditor :model-value="prettyJson(probeResult.output)" readonly height="240px" />
                </div>
              </template>
            </div>
          </el-tab-pane>
        </el-tabs>
      </template>
    </div>

    <!-- 底部操作条：只有草稿态才给「拒绝 / 采纳」 -->
    <div v-if="detail" class="review-footer">
      <template v-if="isDraft">
        <el-button type="danger" plain size="small" :loading="rejecting" @click="onReject">拒绝</el-button>
      </template>
      <div class="review-footer-spacer" />
      <el-tag v-if="!isDraft" type="info" size="small" effect="plain">该组件已生效</el-tag>
      <el-button
        v-else
        v-hasPermi="['databus:component:edit']"
        type="primary"
        size="small"
        :loading="adopting"
        @click="onAdopt"
      >
        采纳并生效
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Document, Loading, VideoPlay } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import JavaCodeEditor from '@/views/databus/component/form/JavaCodeEditor.vue';
import SchemaFieldTree from '@/views/databus/component/detail/SchemaFieldTree.vue';
import JsonCodeEditor from '@/views/databus/editor/components/common/JsonCodeEditor.vue';
import { adoptScriptDraft, getComponent, probeScript, rejectScriptDraft } from '@/api/databus/component';
import type {
  DatabusComponentVo,
  PropSchema,
  ScriptDiagnostic,
  ScriptProbeResult
} from '@/api/databus/component/types';
import { COMPONENT_STATUS } from '@/constants/databus';
import { groupLabel, nodeTypeLabel, parseSchemaFields, prettyJson } from '@/views/databus/component/model/labels';

defineOptions({ name: 'ComponentReviewPane' });

const props = defineProps<{
  /** 草稿组件主键（DRAFT 行）；雪花 id 可能是字符串，别转 Number */
  componentId: number | string;
}>();

const emit = defineEmits<{
  (e: 'adopted', payload: { id: number | string; componentCode: string; componentName: string; version?: number }): void;
  (e: 'rejected', payload: { id: number | string; componentCode: string }): void;
}>();

const loading = ref(false);
const detail = ref<DatabusComponentVo | null>(null);
const activeTab = ref<'source' | 'artifact' | 'probe'>('source');

/** 试跑 */
const probeInput = ref('');
const probing = ref(false);
const probeResult = ref<ScriptProbeResult | null>(null);

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

/** 源码标红诊断：采纳失败优先，其次试跑编译失败 */
const sourceDiagnostics = computed<ScriptDiagnostic[]>(() =>
  adoptDiagnostics.value.length ? adoptDiagnostics.value : probeResult.value?.diagnostics ?? []
);

async function load() {
  loading.value = true;
  detail.value = null;
  probeResult.value = null;
  adoptDiagnostics.value = [];
  activeTab.value = 'source';
  try {
    const { data } = await getComponent(props.componentId);
    detail.value = data ?? null;
    // dataExample 是「配置示例」（cfg JSON），不是运行时上下文数据，不能预填进试跑框——
    // 预填会让人误以为组件该读这些键，实际组件读的是上下文里的业务字段
    probeInput.value = '';
  } finally {
    loading.value = false;
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

async function runProbe() {
  if (probing.value) {
    return;
  }
  if (!detail.value?.scriptBody) {
    ElMessage.warning('该草稿没有脚本正文，无法试跑');
    return;
  }
  probing.value = true;
  probeResult.value = null;
  adoptDiagnostics.value = [];
  try {
    const { data } = await probeScript({
      scriptBody: detail.value.scriptBody,
      requestData: probeInput.value.trim() || undefined
    });
    probeResult.value = data;
  } finally {
    probing.value = false;
  }
}

async function onAdopt() {
  if (!detail.value || !isDraft.value || adopting.value) {
    return;
  }
  try {
    await ElMessageBox.confirm(
      '采纳后立即编译注册，全平台即时可用；编译不过会整体回滚，草稿保持原样。',
      '采纳草稿',
      { type: 'warning', confirmButtonText: '采纳', cancelButtonText: '再看看' }
    );
  } catch {
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
  try {
    await ElMessageBox.confirm(
      '拒绝会直接删除该草稿，AI 只能重新生成。确认拒绝？',
      '拒绝草稿',
      { type: 'warning', confirmButtonText: '拒绝', cancelButtonText: '取消' }
    );
  } catch {
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

.review-alert {
  margin: 0;
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

.review-hint {
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);

  code {
    padding: 0 4px;
    border-radius: 3px;
    background: var(--el-fill-color-light);
  }
}

.review-probe-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.review-probe-error,
.review-probe-risk {
  font-family: Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  white-space: pre-wrap;
  word-break: break-all;
}

.review-probe-risk {
  color: var(--el-color-warning);
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
</style>