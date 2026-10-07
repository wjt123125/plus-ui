<!--
  组件配置 schema 只读树（Stripe 文档式渐进披露，2026-10-07 重构）：
  - 根层顶部摘要：总数 / 必填数 / 条件显示数
  - 必填参数常显且默认展开；可选参数为手风琴行：收起态只占一行
    （名称 + 控件类型灰字 + 等宽技术名），点开看完整说明、候选、示例
  - showWhen 条件字段不平级排列：挂到它依赖的同层字段下，以「联动字段」呈现，
    条件值尽量翻译成触发字段候选的中文 label（如 = raw → 原文）
  - OBJECT / OBJECT_ROWS 子字段按同样规则递归；KEY_VALUE_MAP 展示键/值控件声明
  - 元数据降噪：控件类型改灰字、expr 角色弱化为带 tooltip 的小徽标、
    候选 label=value 只显示一个、placeholder 以代码示例样式呈现
-->
<template>
  <div class="sft" :class="{ 'sft--nested': mode !== 'root' }">
    <!-- 根层摘要 -->
    <p v-if="mode === 'root' && fields.length" class="sft-summary">
      共 {{ fields.length }} 个参数 · 必填 {{ requiredCount }} 个<template v-if="conditionalCount">
        · {{ conditionalCount }} 个按条件显示</template>
    </p>

    <div v-for="group in groups" :key="group.key" class="sft-group">
      <div v-if="mode !== 'dependent'" class="sft-group-title">
        {{ group.title }}
        <span class="sft-count">{{ group.rows.length }}</span>
      </div>

      <div
        v-for="f in group.rows"
        :key="f.name"
        class="sft-item"
        :class="{ 'is-open': openNames.has(f.name) }"
      >
        <!-- 标题行（整行点击展开） -->
        <button type="button" class="sft-head" @click="toggleName(f.name)">
          <em v-if="f.required" class="sft-required">*</em>
          <span v-else class="sft-required-holder" />
          <span class="sft-label">{{ f.label || f.name }}</span>
          <span class="sft-widget">{{ widgetLabel(f.widget) }}</span>
          <code class="sft-name">{{ f.name }}</code>
          <el-tooltip
            v-if="f.exprRole === 'DATA' || f.exprRole === 'TARGET'"
            :content="f.exprRole === 'DATA' ? '可填写 {{ $.路径 }} 表达式，运行时引用上游数据' : '填写数据写入路径，运行时把结果写到该路径'"
            placement="top"
            :show-after="200"
          >
            <span class="sft-role" :class="f.exprRole === 'DATA' ? 'is-data' : 'is-target'">
              {{ f.exprRole === 'DATA' ? '数据引用' : '写入路径' }}
            </span>
          </el-tooltip>
          <span class="sft-spacer" />
          <span v-if="f.showWhen?.length" class="sft-when">{{ conditionText(f.showWhen[0]) }}</span>
          <span class="sft-caret" :class="{ 'is-open': openNames.has(f.name) }">⌄</span>
        </button>

        <!-- 展开体 -->
        <div v-if="openNames.has(f.name)" class="sft-body">
          <p v-if="f.description" class="sft-desc">{{ f.description }}</p>

          <div v-if="f.options?.length" class="sft-line">
            <span class="sft-line-label">可选值</span>
            <span class="sft-options">
              <el-tag
                v-for="opt in f.options"
                :key="opt.value"
                size="small"
                effect="plain"
                type="info"
                class="sft-option"
              >
                {{ opt.label === opt.value ? opt.value : `${opt.label}（${opt.value}）` }}
              </el-tag>
            </span>
          </div>

          <div v-if="f.placeholder" class="sft-line">
            <span class="sft-line-label">示例</span>
            <code class="sft-example">{{ f.placeholder }}</code>
          </div>

          <div v-if="f.widget === 'KEY_VALUE_MAP'" class="sft-line">
            <span class="sft-line-label">结构</span>
            <span class="sft-kv">
              键：{{ widgetLabel(f.keyWidget) }} · 值：{{ widgetLabel(f.valueWidget) }}
              <span v-if="f.valueExprRole === 'DATA'" class="sft-kv-role">（值可引用上游数据）</span>
            </span>
          </div>

          <!-- 嵌套对象字段（同规则递归） -->
          <div v-if="f.fields?.length" class="sft-children">
            <div class="sft-children-title">
              {{ nestedTitle(f.widget) }}
              <span class="sft-children-meta">
                {{ f.fields.length }} 个<template v-if="childRequiredCount(f)"> · 必填 {{ childRequiredCount(f) }} 个</template>
              </span>
            </div>
            <SchemaFieldTree :fields="f.fields" mode="nested" />
          </div>

          <!-- 联动字段：showWhen 挂在当前字段上的同层字段 -->
          <div v-if="attachedMap.get(f.name)?.length" class="sft-dep">
            <div class="sft-dep-title">联动字段 · 满足条件时才出现</div>
            <SchemaFieldTree
              :fields="attachedMap.get(f.name)!"
              mode="dependent"
              :parent="f"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { widgetLabel } from '../model/labels';
import type { PropSchema, PropShowWhen, WidgetKind } from '@/api/databus/component/types';

// SFC 按文件名在模板内递归自引用（script setup 原生支持，无需自导入）
defineOptions({ name: 'SchemaFieldTree' });

const props = withDefaults(
  defineProps<{
    fields?: PropSchema[] | null;
    /** root=根层（摘要 + 分区标题）；nested=对象子字段；dependent=联动字段嵌入层 */
    mode?: 'root' | 'nested' | 'dependent';
    /** dependent 层的触发字段，用于把条件值翻译成候选 label */
    parent?: PropSchema | null;
  }>(),
  { fields: () => [], mode: 'root', parent: null }
);

/** 同层字段按 showWhen 挂到触发字段下；找不到父级的条件字段作为孤立行平级展示 */
function organize(list: PropSchema[]) {
  const roots = list.filter((f) => !f.showWhen?.length);
  const attached = new Map<string, PropSchema[]>();
  const orphans: PropSchema[] = [];
  for (const f of list.filter((x) => x.showWhen?.length)) {
    const refName = f.showWhen![0].field;
    const key = refName.includes('.') ? refName.split('.').pop()! : refName;
    const trigger = roots.find((r) => r.name === refName || r.name === key);
    if (trigger) {
      const bucket = attached.get(trigger.name) ?? [];
      bucket.push(f);
      attached.set(trigger.name, bucket);
    } else {
      orphans.push(f);
    }
  }
  return { roots, attached, orphans };
}

const organized = computed(() => organize(props.fields));
const attachedMap = computed(() => organized.value.attached);

/** 展示行：原序 roots 在前，找不到父级的条件字段追加在后 */
const flatRows = computed(() => [...organized.value.roots, ...organized.value.orphans]);

const requiredRows = computed(() => flatRows.value.filter((f) => f.required));
const optionalRows = computed(() => flatRows.value.filter((f) => !f.required));

const groups = computed(() =>
  [
    { key: 'required', title: '必填参数', rows: requiredRows.value },
    { key: 'optional', title: '可选参数', rows: optionalRows.value }
  ].filter((g) => g.rows.length)
);

const requiredCount = computed(() => props.fields.filter((f) => f.required).length);
const conditionalCount = computed(() => props.fields.filter((f) => f.showWhen?.length).length);

function childRequiredCount(f: PropSchema): number {
  return f.fields?.filter((c) => c.required).length ?? 0;
}

/** 每层独立维护展开集合；必填默认展开（每次重挂载随抽屉 destroy 复位） */
const openNames = ref<Set<string>>(new Set(requiredRows.value.map((f) => f.name)));

function toggleName(name: string) {
  const next = new Set(openNames.value);
  if (next.has(name)) {
    next.delete(name);
  } else {
    next.add(name);
  }
  openNames.value = next;
}

/** 条件文案：eq 值优先翻译成父字段候选 label（= raw → = 原文） */
function conditionText(cond: PropShowWhen): string {
  const refName = cond.field.includes('.') ? cond.field.split('.').pop()! : cond.field;
  const resolve = (v: string) =>
    props.parent?.options?.find((o) => o.value === v)?.label ?? v;
  if (cond.eq != null) {
    return `${refName} = ${resolve(String(cond.eq))}`;
  }
  if (cond.ne != null) {
    return `${refName} ≠ ${resolve(String(cond.ne))}`;
  }
  if (cond.in?.length) {
    return `${refName} 为 ${cond.in.map(resolve).join(' / ')}`;
  }
  if (cond.notIn?.length) {
    return `${refName} 不为 ${cond.notIn.map(resolve).join(' / ')}`;
  }
  return '按条件显示';
}

function nestedTitle(widget: WidgetKind): string {
  if (widget === 'OBJECT') {
    return '对象字段';
  }
  if (widget === 'OBJECT_ROWS') {
    return '每行包含字段';
  }
  return '子字段';
}
</script>

<style lang="scss" scoped>
/* ---- 容器与分区 ---- */
.sft-summary {
  margin: 0 0 10px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--el-fill-color-light, #f5f7fa);
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.sft--nested {
  margin-top: 6px;
  padding-left: 12px;
  border-left: 2px solid var(--el-border-color-lighter, #ebeef5);
}

.sft-group + .sft-group {
  margin-top: 12px;
}

.sft-group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.sft-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--el-fill-color, #f0f2f5);
  font-size: 11px;
  font-weight: 500;
}

/* ---- 单参数手风琴 ---- */
.sft-item {
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 8px;
  margin-bottom: 6px;
  background: var(--el-bg-color, #fff);
  transition: border-color 0.15s;
}

.sft-item.is-open {
  border-color: var(--el-border-color, #dcdfe6);
}

.sft-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.sft-head:hover {
  background: var(--el-fill-color-light, #f7f8fa);
  border-radius: 8px;
}

.sft-required,
.sft-required-holder {
  width: 8px;
  flex-shrink: 0;
  font-style: normal;
}

.sft-required {
  color: var(--el-color-danger, #f56c6c);
  font-weight: 700;
}

.sft-label {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary, #1d2129);
}

.sft-widget {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--el-text-color-placeholder, #a8abb2);
}

.sft-name {
  max-width: 180px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--el-fill-color-light, #f5f7fa);
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 11px;
  color: var(--el-text-color-placeholder, #a8abb2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sft-role {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  cursor: default;
}

.sft-role.is-data {
  color: var(--el-color-warning, #b88230);
  background: var(--el-color-warning-light-9, #fdf6ec);
}

.sft-role.is-target {
  color: var(--el-color-success, #5daf34);
  background: var(--el-color-success-light-9, #f0f9eb);
}

.sft-spacer {
  flex: 1;
}

.sft-when {
  flex-shrink: 1;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--el-color-warning-light-9, #fdf6ec);
  font-size: 11px;
  color: var(--el-color-warning, #b88230);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sft-caret {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--el-text-color-placeholder, #a8abb2);
  transition: transform 0.15s;
}

.sft-caret.is-open {
  transform: rotate(180deg);
}

/* ---- 展开体 ---- */
.sft-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 2px 10px 10px 26px;
}

.sft-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-regular, #606266);
}

.sft-line {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
}

.sft-line-label {
  flex-shrink: 0;
  width: 44px;
  color: var(--el-text-color-placeholder, #a8abb2);
}

.sft-options {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.sft-option {
  font-weight: 400;
}

.sft-example {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--el-color-primary-light-9, #ecf5ff);
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 11px;
  color: var(--el-color-primary, #409eff);
  white-space: pre-wrap;
  word-break: break-all;
}

.sft-kv,
.sft-kv-role {
  font-size: 12px;
  color: var(--el-text-color-regular, #606266);
}

.sft-kv-role {
  color: var(--el-text-color-placeholder, #a8abb2);
}

/* ---- 嵌套与联动 ---- */
.sft-children {
  margin-top: 2px;
}

.sft-children-title,
.sft-dep-title {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary, #909399);
}

.sft-children-meta {
  margin-left: 6px;
  font-weight: 400;
  color: var(--el-text-color-placeholder, #a8abb2);
}

.sft-dep {
  margin-top: 4px;
  padding: 8px;
  border-radius: 6px;
  background: var(--el-fill-color-light, #fafafa);
}

.sft-dep-title {
  margin-bottom: 6px;
}
</style>
