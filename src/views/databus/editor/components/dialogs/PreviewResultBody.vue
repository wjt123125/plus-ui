<!--
  试运行结果正文（不含外壳）：结果横幅 → 入参卡 → 出参卡 →（多步）执行过程卡 → 上下文卡。
  两处外壳共用：PreviewResultDialog（独立编辑器窗口）与 PreviewResultPane（工作区结果 tab）。
  视觉口径与「组件审阅」一致：白底细描边卡 + 无投影；JSON 走 JsonCodeEditor 的 plain 形态（无行号、无边框）。
  设计口径只回答三件事：我给了它什么 / 它吐了什么 / 它怎么走的。
-->
<template>
  <div v-if="result" class="pr">
    <!-- 结果横幅：页面唯一焦点。成败靠底色与图标，耗时用大号等宽数字承载 -->
    <header class="pr__banner" :class="bannerClass">
      <el-icon class="pr__banner-icon">
        <CircleCheckFilled v-if="isOk" />
        <CircleCloseFilled v-else-if="isBad" />
        <RemoveFilled v-else />
      </el-icon>
      <div class="pr__banner-main">
        <span class="pr__banner-title">{{ verdict }}</span>
        <span v-if="statText" class="pr__banner-meta">{{ statText }}</span>
      </div>
      <span class="pr__banner-cost">{{ costText }}</span>
    </header>

    <!-- 失败原因：执行过程里有失败步骤时不再出（原文只在步骤行出现一次）；EL 校验失败/整体异常无步骤时它是唯一出口 -->
    <div v-if="showIssueCard" class="pr__card">
      <div class="pr__error-head">
        <span class="pr__error-bar" aria-hidden="true" />
        <span class="pr__error-title">失败原因</span>
        <button type="button" class="pr__error-copy" @click="copyError(issue)">复制</button>
      </div>
      <pre class="pr__error-body" :class="{ 'is-folded': issueFolded }">{{ issue }}</pre>
      <button v-if="issueFoldable" type="button" class="pr__error-toggle" @click="issueExpanded = !issueExpanded">
        {{ issueExpanded ? '收起' : issueLines > 1 ? `展开（${issueLines} 行）` : '展开全文' }}
      </button>
    </div>

    <!-- 入参：空（null / 空串 / {} / []）不渲染，空态已由横幅副行的「入参 N 项」承载 -->
    <details v-if="!requestEmpty" class="pr__card" open>
      <summary class="pr__card-head">
        <span class="pr__card-title">入参</span>
        <span v-if="requestMeta" class="pr__card-meta">{{ requestMeta }}</span>
        <el-icon class="pr__fold-caret"><ArrowRight /></el-icon>
      </summary>
      <JsonCodeEditor
        :model-value="requestText"
        readonly
        plain
        :height="heightFor(requestText)"
      />
    </details>

    <!-- 出参：结果页的主角，同款卡片，标题给键数；空不渲染 -->
    <details v-if="!outputEmpty" class="pr__card" open>
      <summary class="pr__card-head">
        <span class="pr__card-title">出参</span>
        <span v-if="outputMeta" class="pr__card-meta">{{ outputMeta }}</span>
        <el-icon class="pr__fold-caret"><ArrowRight /></el-icon>
      </summary>
      <JsonCodeEditor
        v-if="outputIsJson"
        :model-value="outputText"
        readonly
        plain
        :height="heightFor(outputText)"
      />
      <pre v-else class="pr__plain">{{ outputText }}</pre>
    </details>

    <!-- 执行过程：多步必出；单步只在失败时出（失败时它是「哪个节点挂了」的唯一标识）。成功单步由出参卡承载，避免重复 -->
    <details v-if="steps.length > 1 || failedCount > 0" class="pr__card" open>
      <summary class="pr__card-head">
        <span class="pr__card-title">执行过程</span>
        <span class="pr__card-meta">{{ steps.length }} 步</span>
        <el-icon class="pr__fold-caret"><ArrowRight /></el-icon>
      </summary>
      <ol class="pr__steps">
        <li
          v-for="(row, i) in steps"
          :key="`${row.nodeId}-${i}`"
          class="pr__step-wrap"
          :style="{ paddingLeft: depthPx(row) }"
        >
          <div class="pr__step" :class="{ 'is-open': isStepOpen(i) }" @click="toggleStep(i)">
            <el-icon class="pr__step-caret"><ArrowRight /></el-icon>
            <span class="pr__step-dot" :class="{ 'is-fail': !row.success }" />
            <span class="pr__step-main">
              <span class="pr__step-title">{{ resolveStepTitle(row) }}</span>
              <span v-if="row.tag" class="pr__step-chip">{{ row.tag }}</span>
            </span>
            <span class="pr__step-result" :class="{ 'is-error': !row.success }" :title="stepResultText(row)">
              {{ stepResultText(row) }}
            </span>
            <span class="pr__step-tail">
              <span class="pr__step-time">{{ row.timeSpent }} ms</span>
              <!-- 失败行 hover 才浮现：复制完整原文（行内文本是省略号截断的） -->
              <button
                v-if="!row.success"
                type="button"
                class="pr__step-copy"
                title="复制错误原文"
                @click.stop="copyError(stepResultText(row))"
              >
                <el-icon><CopyDocument /></el-icon>
              </button>
            </span>
          </div>

          <!-- 步骤明细：就地展开在行下方，不再滑出抽屉；复制/加入会话收在右上角 -->
          <section
            v-if="isStepOpen(i)"
            class="pr__step-detail"
            :data-context-anchor="`preview-step-${row.nodeId}-${row.tag ?? ''}`"
          >
            <header class="pr__step-detail-head">
              <span class="pr__step-detail-title">步骤明细</span>
              <div class="pr__step-detail-actions">
                <button type="button" class="pr__step-action" title="复制明细" @click.stop="copyStepDetail(row)">
                  <el-icon><CopyDocument /></el-icon>
                </button>
                <button
                  v-if="chatEnabled"
                  type="button"
                  class="pr__step-action"
                  title="加入会话"
                  @click.stop="addStepToChat(row)"
                >
                  <SvgIcon icon-class="lucide:sparkles" />
                </button>
              </div>
            </header>

            <dl class="pr__step-meta">
              <div><dt>数据空间</dt><dd>{{ row.tag || '本步' }}</dd></div>
              <div><dt>组件</dt><dd>{{ row.nodeName || row.nodeId || '-' }}</dd></div>
              <div><dt>结果</dt><dd :class="{ 'is-error': !row.success }">{{ row.success ? '成功' : '失败' }}</dd></div>
              <div><dt>耗时</dt><dd>{{ row.timeSpent ?? '-' }} ms</dd></div>
              <div>
                <dt>开始</dt>
                <dd :title="row.startTime || ''">{{ formatStepTime(row.startTime) }}</dd>
              </div>
              <div>
                <dt>结束</dt>
                <dd :title="row.endTime || ''">{{ formatStepTime(row.endTime) }}</dd>
              </div>
            </dl>

            <div v-if="!row.success && row.errorMessage" class="pr__step-detail-error">
              <FoldableErrorText :text="row.errorMessage" />
            </div>

            <JsonCodeEditor
              v-if="stepDetailText(row)"
              :model-value="stepDetailText(row)"
              readonly
              plain
              height="240px"
            />
            <!-- 失败时错误就是全部信息，再补一句「没有明细」只会添噪 -->
            <p v-else-if="row.success" class="pr__step-detail-empty">本步未产出数据明细</p>
          </section>
        </li>
      </ol>
    </details>

    <!-- 上下文：运行结束时的完整数据空间，附录位，默认收起；空不渲染 -->
    <details v-if="!contextEmpty" class="pr__card pr__card--appendix">
      <summary class="pr__card-head">
        <span class="pr__card-title">上下文</span>
        <span class="pr__card-meta">{{ contextMeta }}</span>
        <el-icon class="pr__fold-caret"><ArrowRight /></el-icon>
      </summary>
      <JsonCodeEditor :model-value="prettyContext" readonly plain height="240px" />
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowRight, CircleCheckFilled, CircleCloseFilled, CopyDocument, RemoveFilled } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type { NodeStep, PreviewRunVo } from '@/api/databus/el/types';
import JsonCodeEditor from '@/views/databus/editor/components/common/JsonCodeEditor.vue';
import FoldableErrorText from '@/views/databus/components/FoldableErrorText.vue';
import { nextContextId, useAgentContext } from '@/views/databus/workbench/ai/useAgentContext';

const props = defineProps<{
  result: PreviewRunVo | null;
  /** 步骤标题推断：画布宿主注入实时推断，结果 tab 注入运行时的标题快照 */
  resolveStepTitle: (row: NodeStep) => string;
  /** 本次实际发出的入参文本（由运行时刻随结果一起带过来） */
  requestJson?: string;
  /** 运行时刻（并入结论行，避免页头与正文重复同一条信息） */
  time?: string;
  /** 步骤明细「加入会话」的来源资源（链路/组件）；缺失时只带步骤文本 */
  contextSource?: { assetType?: string; assetId?: number | string; assetName?: string };
  /** 宿主是否有 AI 会话面板：编辑器独立路由没有，传 false 不渲染按钮，避免点了无处可去 */
  chatEnabled?: boolean;
}>();

const steps = computed<NodeStep[]>(() => props.result?.steps ?? []);

const singleStep = computed<NodeStep | null>(() => (steps.value.length === 1 ? steps.value[0] : null));

const failedCount = computed(() => steps.value.filter((s) => !s.success).length);

const totalMs = computed(() => steps.value.reduce((sum, s) => sum + (s.timeSpent ?? 0), 0));

const isOk = computed(() => !!props.result?.executed && !!props.result.success);
const isBad = computed(() => !!props.result?.executed && !props.result.success);

const bannerClass = computed(() => (isOk.value ? 'is-ok' : isBad.value ? 'is-bad' : 'is-idle'));

const verdict = computed(() => {
  const r = props.result;
  if (!r) {
    return '';
  }
  if (r.executed) {
    return r.success ? '执行成功' : '执行失败';
  }
  return r.valid === false ? '未执行（EL 校验未通过）' : '未执行';
});

const costText = computed(() => (steps.value.length ? `${totalMs.value} ms` : '—'));

/** 横幅副行：时间 · 入参项数 · 出参键数 · 步数，缺的跳过 */
const statText = computed(() => {
  const parts: string[] = [];
  if (props.time) {
    parts.push(props.time);
  }
  if (requestMeta.value) {
    parts.push(requestMeta.value);
  }
  if (outputMeta.value) {
    parts.push(outputMeta.value);
  }
  if (steps.value.length) {
    parts.push(`${steps.value.length} 步`);
    if (failedCount.value) {
      parts.push(`失败 ${failedCount.value}`);
    }
  }
  return parts.join(' · ');
});

/** 失败原因只留一条，不再叠多个 alert */
const issue = computed(() => {
  const r = props.result;
  if (!r) {
    return '';
  }
  if (r.errorMessage) {
    return r.errorMessage;
  }
  return r.valid === false ? (r.message ?? '') : '';
});

/** 失败原因卡：有失败步骤时原文已由步骤行承载，不再重复一张卡 */
const showIssueCard = computed(() => !!issue.value && failedCount.value === 0);

/** 失败原因折叠：超 6 行或单行过长（驱动原文常常一行几百字）就收起，避免把入参/出参卡挤出屏 */
const ISSUE_FOLD_LINES = 6;

const ISSUE_FOLD_CHARS = 200;

const issueExpanded = ref(false);

const issueLines = computed(() => (issue.value ? issue.value.split('\n').length : 0));

const issueFoldable = computed(
  () => issueLines.value > ISSUE_FOLD_LINES || issue.value.length > ISSUE_FOLD_CHARS
);

const issueFolded = computed(() => issueFoldable.value && !issueExpanded.value);

/** 复制错误原文：失败原因卡与失败步骤行共用 */
async function copyError(text: string) {
  if (!text) {
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制错误原文');
  } catch {
    ElMessage.warning('复制失败，请手动选中复制');
  }
}

/** 展开中的步骤：键是列表下标（与 v-for 一致），允许多行同时展开 */
const openSteps = ref<Record<number, boolean>>({});

function isStepOpen(index: number): boolean {
  return !!openSteps.value[index];
}

function toggleStep(index: number): void {
  openSteps.value = { ...openSteps.value, [index]: !openSteps.value[index] };
}

/** 步骤时间：ISO 原文带时区毫秒，直接展示会被列宽截断，只留「MM-DD HH:mm:ss.SSS」 */
function formatStepTime(value?: string): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return (
    `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
  );
}

/** 步骤数据明细：2 空格缩进；不是合法 JSON 时原样展示 */
function stepDetailText(row: NodeStep): string {
  const raw = row.detailJson;
  if (!raw) {
    return '';
  }
  return prettyJson(raw) || raw;
}

/** 复制步骤明细：优先数据明细，没有则退回错误原文 */
async function copyStepDetail(row: NodeStep): Promise<void> {
  const text = stepDetailText(row) || row.errorMessage || '';
  if (!text) {
    ElMessage.warning('本步没有可复制的数据明细');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制步骤明细');
  } catch {
    ElMessage.warning('复制失败，请手动选中复制');
  }
}

const { addContext } = useAgentContext();

/** 附件正文：步骤标识与耗时在前、明细在后，模型才知道这段输出来自哪一步 */
function buildStepAttachmentText(row: NodeStep, body: string): string {
  const meta = [
    `数据空间：${row.tag || '本步'}`,
    `组件：${row.nodeName || row.nodeId || '-'}`,
    `结果：${row.success ? '成功' : '失败'}`,
    `耗时：${row.timeSpent ?? '-'} ms`,
    `开始：${row.startTime || '-'}`,
    `结束：${row.endTime || '-'}`
  ];
  return `${meta.join('\n')}\n\n${body}`;
}

/** 加入会话：本步明细作为「试跑结果明细」附件进输入区暂存，由现有引用卡 UI 渲染 */
function addStepToChat(row: NodeStep): void {
  const body = stepDetailText(row) || row.errorMessage || '';
  if (!body) {
    ElMessage.warning('本步没有可加入会话的数据明细');
    return;
  }
  const text = buildStepAttachmentText(row, body);
  const source = props.contextSource;
  const title = props.resolveStepTitle(row);
  addContext({
    id: nextContextId(),
    kind: 'excerpt',
    type: 'preview-result',
    // 状态写进标题：note 在服务端渲染成「我的评论」，自动填「失败」会冒充用户的话
    title: `步骤明细 · ${title}${row.success ? '' : '（失败）'}`,
    preview: text.replace(/\s+/g, ' ').trim().slice(0, 120),
    payload: { text },
    source: {
      assetType: source?.assetType,
      assetId: source?.assetId,
      assetName: source?.assetName,
      nodeName: title,
      anchor: `preview-step-${row.nodeId}-${row.tag ?? ''}`,
      capturedAt: new Date().toISOString()
    },
    fingerprint: `preview-result|${source?.assetId ?? source?.assetName ?? ''}|${row.nodeId}|${row.tag ?? ''}`
  });
  // 工作区默认收起 AI 栏：不展开的话暂存区里的新卡片看不见，会像「点了没反应」
  window.dispatchEvent(new Event('databus:reveal-ai'));
  ElMessage.success(`已加入会话：${title}`);
}

/** 入参：JSON 美化（缺省 {}） */
const requestText = computed(() => prettyJson(props.requestJson) || '{}');

/** 入参项数：请求体顶层键数，作为横幅副行的信息量提示 */
const requestMeta = computed(() => {
  const n = countKeys(props.requestJson);
  return n ? `入参 ${n} 项` : '';
});

/** 上下文快照解析为对象（后端给的是 JSON 字符串） */
const contextObj = computed<unknown>(() => {
  const raw = props.result?.contextJson;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

/** $.response 片段（response 组件固定写这里） */
const responsePart = computed<unknown>(() => {
  const obj = contextObj.value;
  if (obj && typeof obj === 'object' && 'response' in obj) {
    return (obj as Record<string, unknown>).response;
  }
  return null;
});

/** 出参原文：单步看本节点数据空间快照，多步看 $.response；快照为空时退回组件自报摘要 */
const outputRaw = computed<unknown>(() => {
  if (singleStep.value) {
    const detail = singleStep.value.detailJson;
    // detailJson 为空 JSON（如 "{}"）时不能挡住有内容的摘要
    return isEmptyValue(detail) ? singleStep.value.summary || detail || '' : detail;
  }
  return responsePart.value;
});

const outputText = computed(() => prettyJson(outputRaw.value) || String(outputRaw.value ?? '').trim());

/** 出参是否可交给 JSON 编辑器（组件自报摘要这类纯文本仍用普通代码块） */
const outputIsJson = computed(() => !!prettyJson(outputRaw.value));

/** 主卡标题右侧元信息：键数（数组按项数），非 JSON 不显示 */
const outputMeta = computed(() => {
  if (!outputIsJson.value) {
    return '';
  }
  const n = countKeys(outputRaw.value);
  if (!n) {
    return '';
  }
  return Array.isArray(outputRaw.value) ? `${n} 项` : `${n} 个键`;
});

/** 上下文键数：与另外两张卡同口径 */
const contextMeta = computed(() => {
  const n = countKeys(props.result?.contextJson);
  return n ? `${n} 个键` : '';
});

const prettyContext = computed(() => prettyJson(props.result?.contextJson));

/** 空态判定：三张数据卡共用。null / 空串 / {} / [] 算空；非 JSON 纯文本有内容即算有数据 */
function isEmptyValue(raw: unknown): boolean {
  if (raw === null || raw === undefined) {
    return true;
  }
  let val: unknown = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) {
      return true;
    }
    try {
      val = JSON.parse(raw);
    } catch {
      return false;
    }
  }
  if (Array.isArray(val)) {
    return val.length === 0;
  }
  if (val && typeof val === 'object') {
    return Object.keys(val as object).length === 0;
  }
  return false;
}

const requestEmpty = computed(() => isEmptyValue(props.requestJson));

const outputEmpty = computed(() => isEmptyValue(outputRaw.value));

const contextEmpty = computed(() => isEmptyValue(props.result?.contextJson));

/** JSON 美化：字符串先解析；非法/空返回空串 */
function prettyJson(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') {
    return '';
  }
  if (typeof raw === 'string') {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return '';
    }
  }
  return JSON.stringify(raw, null, 2);
}

/** 顶层键数：对象取键数、数组取长度，非 JSON 记 0 */
function countKeys(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') {
    return 0;
  }
  let val: unknown = raw;
  if (typeof raw === 'string') {
    try {
      val = JSON.parse(raw);
    } catch {
      return 0;
    }
  }
  if (Array.isArray(val)) {
    return val.length;
  }
  return val && typeof val === 'object' ? Object.keys(val as object).length : 0;
}

/** 编辑器高度跟行数走：短 JSON 不占一大块，长 JSON 最多 8 行后内部滚动 */
function heightFor(jsonText: string): string {
  const lines = Math.min(Math.max(jsonText.split('\n').length, 2), 8);
  return `${lines * 20 + 10}px`;
}

/** 步骤行「结果」文本：成功用组件自报摘要，未报兜底「完成」；失败显示错误信息 */
function stepResultText(row: NodeStep): string {
  if (!row.success) {
    return row.errorMessage || '执行失败';
  }
  return row.summary || '完成';
}

/** 步骤行缩进：主链 depth=0 不缩进，每深一层 +16px，上限 5 层防止列表被撑爆 */
function depthPx(row: NodeStep): string {
  const d = Math.min(row.depth ?? 0, 5);
  return d * 16 + 'px';
}
</script>

<style scoped>
/* 节奏：横幅→主卡 20，主卡→次级 20，次级之间 16，附录前 20 */
.pr {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ---------- 结果横幅：页面唯一焦点 ---------- */
.pr__banner {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  margin-bottom: 4px;
  padding: 10px 16px;
  border-radius: var(--db-r-control, 10px);
}

.pr__banner.is-ok {
  background: var(--el-color-success-light-9, #f0f9eb);
  color: var(--el-color-success, #67c23a);
}

.pr__banner.is-bad {
  background: var(--el-color-danger-light-9, #fef0f0);
  color: var(--el-color-danger, #f56c6c);
}

.pr__banner.is-idle {
  background: var(--el-fill-color-lighter, #fafafa);
  color: var(--db-ink-muted, #6e6e73);
}

.pr__banner-icon {
  flex: none;
  font-size: 28px;
}

.pr__banner-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pr__banner-title {
  color: var(--db-ink, #1c1c1e);
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
}

.pr__banner-meta {
  color: var(--db-ink-muted, #6e6e73);
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pr__banner-cost {
  margin-left: auto;
  color: var(--db-ink, #1c1c1e);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 24px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ---------- 失败原因卡：与入参/出参同构，红色只做竖条与标题点缀 ---------- */
.pr__error-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pr__error-bar {
  flex: none;
  width: 3px;
  height: 12px;
  border-radius: 2px;
  background: var(--el-color-danger, #f56c6c);
}

.pr__error-title {
  color: var(--el-color-danger, #f56c6c);
  font-size: 13px;
  font-weight: 700;
  line-height: 16px;
}

.pr__error-copy {
  margin-left: auto;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 12px;
  line-height: 16px;
  cursor: pointer;
}

.pr__error-copy:hover {
  color: var(--el-color-primary);
  text-decoration: underline;
}

.pr__error-body {
  margin: 0;
  overflow: auto;
  color: var(--db-ink-secondary, #3a3a3c);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* 6 行 × 12px × 1.55 ≈ 112px，超出收起 */
.pr__error-body.is-folded {
  max-height: 112px;
  overflow: hidden;
}

.pr__error-toggle {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 12px;
  line-height: 16px;
  cursor: pointer;
}

.pr__error-toggle:hover {
  color: var(--el-color-primary);
  text-decoration: underline;
}

.pr__fold-caret {
  font-size: 11px;
  color: var(--db-ink-muted, #6e6e73);
  transition: transform 0.18s ease;
}

.pr__card[open] .pr__fold-caret {
  transform: rotate(90deg);
}

/* 附录位（上下文）：与正文拉开距离 */
.pr__card--appendix {
  margin-top: 4px;
}

/* ---------- 区块卡片：白底 + 细描边 + 无投影（入参 / 出参 / 执行过程 / 上下文） ---------- */
.pr__card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: var(--db-r-control, 10px);
  background: var(--el-bg-color, #fff);
}

.pr__card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  list-style: none;
  cursor: pointer;
}

.pr__card-head::-webkit-details-marker {
  display: none;
}

.pr__card-title {
  color: var(--db-ink, #1c1c1e);
  font-size: 13px;
  font-weight: 700;
  line-height: 16px;
}

.pr__card-meta {
  color: var(--db-ink-muted, #6e6e73);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

/* ---------- 纯文本兜底（非 JSON 出参） ---------- */
.pr__plain {
  margin: 0;
  padding: 8px 10px;
  overflow: auto;
  max-height: 240px;
  border-radius: var(--db-r-control, 10px);
  background: var(--el-fill-color-lighter, #fafafa);
  color: var(--db-ink-secondary, #3a3a3c);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* ---------- 多步：步骤列表 ---------- */
.pr__steps {
  margin: 0;
  padding: 0;
  list-style: none;
}

.pr__step {
  display: grid;
  grid-template-columns: 12px 6px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  min-height: 34px;
  padding-right: 8px;
  border-radius: var(--db-r-tag, 7px);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

/* 行间细分隔线：靠内阴影画，不增加盒子边框 */
.pr__step-wrap + .pr__step-wrap {
  box-shadow: inset 0 1px 0 var(--el-border-color-lighter, #ebeef5);
}

.pr__step:hover,
.pr__step.is-open {
  background: var(--el-fill-color-lighter, #fafafa);
}

/* 展开箭头：收起时朝右，展开后转 90°，与卡片折叠同一节奏 */
.pr__step-caret {
  font-size: 11px;
  color: var(--db-ink-muted, #6e6e73);
  transition: transform 0.18s ease;
}

.pr__step.is-open .pr__step-caret {
  transform: rotate(90deg);
}

/* ---------- 步骤明细：行内展开，白底细描边，与正文卡片同口径 ---------- */
.pr__step-detail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0 8px 10px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: var(--db-r-control, 10px);
  background: var(--el-bg-color, #fff);
}

.pr__step-detail-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pr__step-detail-title {
  color: var(--db-ink, #1c1c1e);
  font-size: 12px;
  font-weight: 700;
  line-height: 16px;
}

.pr__step-detail-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
}

.pr__step-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--db-ink-secondary, #3a3a3c);
  font-size: 13px;
  cursor: pointer;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.pr__step-action:hover {
  background: var(--el-fill-color-light, #f5f7fa);
  color: var(--el-color-primary);
}

.pr__step-action :deep(svg) {
  width: 15px;
  height: 15px;
}

/* 元信息：按容器宽度自适应列数，窄面板自动落成两列，避免时间被截断 */
.pr__step-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 6px 16px;
  margin: 0;
  font-size: 11px;
  line-height: 16px;
}

.pr__step-meta div {
  display: flex;
  gap: 6px;
  min-width: 0;
}

.pr__step-meta dt {
  flex: none;
  color: var(--db-ink-muted, #6e6e73);
}

.pr__step-meta dd {
  margin: 0;
  overflow: hidden;
  color: var(--db-ink-secondary, #3a3a3c);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.pr__step-meta dd.is-error {
  color: var(--el-color-danger, #f56c6c);
}

/* 错误块：小号等宽字 + 细红边，读起来像「日志片段」而不是一条大红横幅 */
.pr__step-detail-error {
  padding: 8px 10px;
  border: 1px solid var(--el-color-danger-light-7, #fab6b6);
  border-radius: var(--db-r-tag, 7px);
  background: var(--el-color-danger-light-9, #fef0f0);
  color: var(--el-color-danger-dark-2, #c45656);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  line-height: 18px;
}

/* 折叠箭头跟随错误色，避免红块里出现一个蓝色图标 */
.pr__step-detail-error :deep(.fe__caret) {
  color: var(--el-color-danger, #f56c6c);
}

.pr__step-detail-empty {
  margin: 0;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 11px;
  line-height: 18px;
}

/* 失败行只靠红点 + 红字标识，不上底色（避免和错误卡抢焦点） */

.pr__step-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-color-success);
}

.pr__step-dot.is-fail {
  background: var(--el-color-danger);
}

.pr__step-main {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.pr__step-title {
  overflow: hidden;
  color: var(--db-ink, #1c1c1e);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pr__step-chip {
  flex: none;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--el-fill-color-light, #f5f7fa);
  color: var(--db-ink-secondary, #3a3a3c);
  font-size: 10px;
  line-height: 16px;
}

.pr__step-result {
  overflow: hidden;
  max-width: 320px;
  color: var(--db-ink-secondary, #3a3a3c);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pr__step-result.is-error {
  color: var(--el-color-danger, #f56c6c);
}

.pr__step-time {
  min-width: 52px;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

/* 行尾：耗时 + 复制位。成功行不出图标但保留宽度，保证各步耗时列不错位 */
.pr__step-tail {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 74px;
}

.pr__step-copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 12px;
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.pr__step:hover .pr__step-copy,
.pr__step-copy:focus-visible {
  opacity: 1;
}

.pr__step-copy:hover {
  color: var(--el-color-primary);
}
</style>
