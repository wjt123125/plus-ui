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

    <!-- 失败原因 / EL 校验未通过：一条左竖线提示；成功态不出现 -->
    <p v-if="issue" class="pr__issue">{{ issue }}</p>

    <details class="pr__card" open>
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

    <!-- 出参：结果页的主角，同款卡片，标题给键数 -->
    <details v-if="outputText" class="pr__card" open>
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

    <!-- 多步：步骤列表；每行点开抽屉看该组件跑完的上下文快照 -->
    <details v-if="steps.length > 1" class="pr__card" open>
      <summary class="pr__card-head">
        <span class="pr__card-title">执行过程</span>
        <span class="pr__card-meta">{{ steps.length }} 步</span>
        <el-icon class="pr__fold-caret"><ArrowRight /></el-icon>
      </summary>
      <ol class="pr__steps">
        <li
          v-for="(row, i) in steps"
          :key="`${row.nodeId}-${i}`"
          class="pr__step"
          :class="{ 'is-fail': !row.success }"
          :style="{ paddingLeft: depthPx(row) }"
          @click="emit('openStep', row)"
        >
          <span class="pr__step-dot" :class="{ 'is-fail': !row.success }" />
          <span class="pr__step-main">
            <span class="pr__step-title">{{ resolveStepTitle(row) }}</span>
            <span v-if="row.tag" class="pr__step-chip">{{ row.tag }}</span>
          </span>
          <span class="pr__step-result" :class="{ 'is-error': !row.success }" :title="stepResultText(row)">
            {{ stepResultText(row) }}
          </span>
          <span class="pr__step-time">{{ row.timeSpent }} ms</span>
        </li>
      </ol>
    </details>

    <!-- 上下文：运行结束时的完整数据空间，附录位，默认收起 -->
    <details v-if="prettyContext" class="pr__card pr__card--appendix">
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
import { computed } from 'vue';
import { ArrowRight, CircleCheckFilled, CircleCloseFilled, RemoveFilled } from '@element-plus/icons-vue';
import type { NodeStep, PreviewRunVo } from '@/api/databus/el/types';
import JsonCodeEditor from '@/views/databus/editor/components/common/JsonCodeEditor.vue';

const props = defineProps<{
  result: PreviewRunVo | null;
  /** 步骤标题推断：画布宿主注入实时推断，结果 tab 注入运行时的标题快照 */
  resolveStepTitle: (row: NodeStep) => string;
  /** 本次实际发出的入参文本（由运行时刻随结果一起带过来） */
  requestJson?: string;
  /** 运行时刻（并入结论行，避免页头与正文重复同一条信息） */
  time?: string;
}>();

const emit = defineEmits<{
  openStep: [row: NodeStep];
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

/** 出参原文：单步看本节点数据空间快照，多步看 $.response；取不到 JSON 时退回组件自报摘要 */
const outputRaw = computed<unknown>(() => {
  if (singleStep.value) {
    return singleStep.value.detailJson || singleStep.value.summary || '';
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
  border-radius: var(--app-radius-lg, 12px);
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

/* ---------- 失败提示 ---------- */
.pr__issue {
  margin: 0;
  padding: 8px 10px;
  border-left: 2px solid var(--el-color-danger);
  border-radius: 0 var(--app-radius-md, 10px) var(--app-radius-md, 10px) 0;
  background: var(--el-color-danger-light-9, #fef0f0);
  color: var(--el-color-danger, #f56c6c);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
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
  border-radius: var(--app-radius-lg, 12px);
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
  border-radius: var(--app-radius-md, 10px);
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
  grid-template-columns: 6px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  min-height: 34px;
  padding-right: 8px;
  border-radius: var(--app-radius-sm, 6px);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

/* 行间细分隔线：靠内阴影画，不增加盒子边框 */
.pr__step + .pr__step {
  box-shadow: inset 0 1px 0 var(--el-border-color-lighter, #ebeef5);
}

.pr__step:hover {
  background: var(--el-fill-color-lighter, #fafafa);
}

.pr__step.is-fail {
  background: var(--el-color-danger-light-9, #fef0f0);
}

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
</style>
