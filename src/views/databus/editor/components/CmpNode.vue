<!-- 组件节点：仅渲染业务卡与虚拟起止节点；算子网关走 GatewayNode.vue

  默认态视觉层次（2026-09-20 拍板）：
  ┌────────────────┐
  │ [icon] 类型名   │  顶行：data.label（粗体冷灰，永远显）
  │        业务标题 │  次行：data.title（品牌色压深，空或与 label 相同则隐藏）
  └────────────────┘
  数据空间 cmpId 为技术标识，不占默认态版面，仅在 hover 浮层 / 属性面板 / 步骤表可见。
  品牌色统一由根节点 --brand 变量驱动（图标 tint 底、图标色、标题色同源）。
  hover 浮层只补画布缺失信息（被截断的 title + 数据空间），画布上完整显示的标题不重复；
用 el-tooltip 浅色卡片浮层（250ms 延迟防闪烁），开始/结束圆点无补充信息则不出浮层。
  卡片尺寸 150×56 保持不变。
-->
<template>
  <el-tooltip
    placement="top"
    effect="light"
    :show-after="250"
    :disabled="dragging || !tipVisible"
    popper-class="cmp-node-popper"
  >
    <div
      class="cmp-node"
      :class="{ 'is-selected': selected, 'is-virtual': data.virtual, 'has-title': showTitle }"
      :style="rootStyle"
      @mouseenter="hover = true"
      @mouseleave="hover = false"
    >
      <CmpContextPad v-if="!data.junctionOf && !data.placeholderOf" :node-id="id" :hover="hover" :selected="selected" />
      <Handle v-if="data.defType !== 'start'" type="target" :position="Position.Left" />
      <div class="cmp-node__icon">
        <SvgIcon :icon-class="iconName" />
      </div>
      <div class="cmp-node__body">
        <div class="cmp-node__label">{{ data.label }}</div>
        <div v-if="showTitle" ref="titleRef" class="cmp-node__title">{{ data.title }}</div>
      </div>
      <Handle v-if="data.defType !== 'end'" type="source" :position="Position.Right" />
    </div>
    <template #content>
      <div class="cmp-tip">
        <div v-if="showTipTitle" class="cmp-tip__title">{{ data.title }}</div>
        <div v-if="!data.virtual && data.cmpId" class="cmp-tip__space" :class="{ 'is-first': !showTipTitle }">
          <span class="cmp-tip__space-k">数据空间</span>
          {{ data.cmpId }}
        </div>
      </div>
    </template>
  </el-tooltip>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { Handle, Position, type NodeProps } from '@vue-flow/core';
import type { CmpNodeData } from '../composables/useElTreeModel';
import { getDef } from '../cmp-defs';
import CmpContextPad from './CmpContextPad.vue';

const props = defineProps<NodeProps<CmpNodeData>>();

const hover = ref(false);

const iconName = computed(() => getDef(props.data.defType)?.icon ?? '');

/**
 * 品牌色单一来源：根节点挂 --brand（业务卡）/ --node-color（虚拟起止圆点），
 * 图标 tint 底、图标色、业务标题色全部在 CSS 里引用同一变量，避免内联/样式双来源。
 */
const rootStyle = computed<Record<string, string>>(() => ({
  [props.data.virtual ? '--node-color' : '--brand']: props.data.color ?? '#909399'
}));

/** 次行业务标题显隐：空串/空白/与类型名相同（如 response 默认 title「流程响应」= label）则隐藏 */
const showTitle = computed(() => {
  const t = props.data.title?.trim();
  if (!t) return false;
  if (t === props.data.label?.trim()) return false;
  return true;
});

/** 画布标题元素引用，用于检测是否被省略号截断 */
const titleRef = ref<HTMLElement | null>(null);
const isTitleTruncated = ref(false);

/** 检测画布标题是否溢出被截断（scrollWidth > clientWidth 即文字比可见区域宽） */
const checkTruncation = () => {
  const el = titleRef.value;
  isTitleTruncated.value = !!el && el.scrollWidth > el.clientWidth;
};

watch([showTitle, () => props.data.title], () => nextTick(checkTruncation));
onMounted(() => nextTick(checkTruncation));

/** 浮层中是否显示标题：仅当画布上被截断时才补全，避免与画布重复 */
const showTipTitle = computed(() => showTitle.value && isTitleTruncated.value);

/** 浮层显隐：有截断标题需补全 或 有数据空间需展示；两者皆无则不出浮层 */
const tipVisible = computed(() => showTipTitle.value || (!props.data.virtual && !!props.data.cmpId));
</script>

<style scoped>
.cmp-node {
  position: relative;
  display: flex;
  align-items: center;
  width: 150px;
  height: 56px;
  padding: 6px 8px;
  background-color: #fff;
  border: 1px solid rgba(15, 23, 42, 8%);
  border-radius: 8px;
  box-shadow:
    0 1px 2px rgba(16, 24, 40, 4%),
    0 1px 3px rgba(16, 24, 40, 6%);
  transition:
    transform 0.15s ease-out,
    border-color 0.15s ease-out,
    box-shadow 0.15s ease-out;
}

/* hover：轻微上浮 + 阴影分层加深（动效白名单：仅 1px 位移） */
.cmp-node:hover {
  transform: translateY(-1px);
  border-color: rgba(15, 23, 42, 12%);
  box-shadow:
    0 2px 4px rgba(16, 24, 40, 5%),
    0 4px 10px rgba(16, 24, 40, 8%);
}

.cmp-node.is-selected {
  border-color: var(--el-color-primary);
  box-shadow:
    0 0 0 3px var(--el-color-primary-light-8),
    0 2px 6px rgba(16, 24, 40, 8%);
}

.cmp-node.is-selected:hover {
  transform: none;
}

.cmp-node.is-virtual {
  width: 56px;
  height: 56px;
  padding: 0;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background-color: var(--node-color);
  border: none;
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(16, 24, 40, 16%);
  color: #fff;
}

.cmp-node.is-virtual:hover {
  transform: translateY(-1px);
  border-color: transparent;
  box-shadow: 0 4px 12px rgba(16, 24, 40, 20%);
}

.cmp-node.is-virtual.is-selected {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--node-color) 30%, transparent), 0 2px 8px rgba(16, 24, 40, 16%);
}

.cmp-node.is-virtual .cmp-node__icon {
  width: 22px;
  height: 22px;
  margin-right: 0;
  font-size: 16px;
  color: #fff;
  background: transparent;
  border-radius: 0;
}

.cmp-node.is-virtual .cmp-node__body {
  flex: none;
  text-align: center;
  min-width: auto;
}

.cmp-node.is-virtual .cmp-node__label {
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  margin-top: 2px;
  line-height: 1;
  letter-spacing: 0;
}

.cmp-node.is-virtual .cmp-node__title {
  display: none;
}

.cmp-node__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  margin-right: 8px;
  font-size: 16px;
  border-radius: 8px;
  /* tint 模式：品牌色 18% 浅彩底 + 同色图标（SvgIcon 走 currentColor） */
  background-color: color-mix(in srgb, var(--brand, #909399) 18%, #ffffff);
  color: var(--brand, #909399);
}

.cmp-node__body {
  min-width: 0;
  flex: 1;
  overflow: hidden;
}

/* 顶行：组件类型名，永远显。冷灰 #1f2937 + 微收字距，标题感更强 */
.cmp-node__label {
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  line-height: 16px;
  color: #1f2937;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 次行：业务标题，品牌色压深（70% 品牌 + 30% 深灰保证 11px 小字对比度），
   与图标颜色呼应，让每张卡有类型色彩记忆点 */
.cmp-node__title {
  margin-top: 3px;
  overflow: hidden;
  font-size: 11px;
  font-weight: 500;
  line-height: 14px;
  color: color-mix(in srgb, var(--brand, #6b7280) 72%, #1f2937);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 连接点热区与视觉反馈 */
.vue-flow__handle::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: transparent;
}

.vue-flow__handle-left::before {
  transform: translate(calc(-50% - 4px), -50%);
}

.vue-flow__handle-right::before {
  transform: translate(calc(-50% + 4px), -50%);
}

.vue-flow__handle::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 14px;
  height: 14px;
  border: 1.5px solid color-mix(in srgb, var(--el-color-primary) 55%, transparent);
  border-radius: 50%;
  background: transparent;
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.6);
  transition: opacity 0.12s ease, transform 0.12s ease;
  pointer-events: none;
}

.vue-flow__handle:hover::after {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}

.vue-flow__handle:hover,
.vue-flow__handle.connecting {
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary);
}

.vue-flow__handle.valid,
.vue-flow__handle.vue-flow__handle-valid {
  border-color: var(--el-color-success);
  background-color: var(--el-color-success);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--el-color-success) 25%, transparent);
}
</style>

<!-- 非 scoped：tooltip 浮层 teleport 到 body，scoped 选择器命中不了。
     仅用 .cmp-node-popper 类名限定，不污染全局 el-tooltip。
     Stripe/Notion/macOS 风浅色卡片浮层：白底 + 浅边框 + 柔影 + 品牌色小图标。 -->
<style>
.cmp-node-popper.el-popper.is-light {
  padding: 0;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 10%);
  border-radius: 10px;
  box-shadow:
    0 8px 24px rgba(16, 24, 40, 12%),
    0 2px 6px rgba(16, 24, 40, 6%);
}

/* 箭头与卡片同底同边，消除默认灰边感 */
.cmp-node-popper.el-popper.is-light .el-popper__arrow::before {
  background: #ffffff;
  border-color: rgba(15, 23, 42, 10%);
}

.cmp-tip {
  max-width: 320px;
  padding: 9px 11px;
}

/* 完整业务标题：浮层主信息，画布截断处在此看全。
   显式声明全部防截断属性，避免 .el-popper 默认 word-break:normal
   在某些 CSS 加载顺序下覆盖 .cmp-tip__title 的 break-all 导致超长无空格串溢出被裁。 */
.cmp-tip__title {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.45;
  color: #1f2937;
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  word-break: break-all;
  overflow-wrap: anywhere;
}

/* 数据空间：有 title 时在分隔线下方；无 title 时（is-first）直接显，不画线 */
.cmp-tip__space {
  display: flex;
  gap: 6px;
  align-items: baseline;
  margin-top: 7px;
  padding-top: 7px;
  border-top: 1px solid rgba(15, 23, 42, 6%);
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.4;
  color: #4b5563;
}

.cmp-tip__space.is-first {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.cmp-tip__space-k {
  flex-shrink: 0;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #6b7280;
}
</style>
