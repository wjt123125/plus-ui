<!-- 组件节点：仅渲染业务卡与虚拟起止节点；算子网关走 GatewayNode.vue

  默认态视觉层次（2026-09-20 拍板）：
  ┌────────────────┐
  │ [icon] 类型名   │  顶行：data.label（粗体冷灰，永远显）
  │        业务标题 │  次行：data.title（品牌色压深，空或与 label 相同则隐藏）
  └────────────────┘
  数据空间 cmpId 为技术标识，不占默认态版面，仅在 hover 信息卡 / 属性面板 / 步骤表可见。
  品牌色统一由根节点 --brand 变量驱动（图标 tint 底、图标色、标题色同源）。
  可引用的业务节点（canDrill）hover 时出统一信息卡：名称 + #编码 + 复制/加入会话；
  这是节点唯一的 hover 浮层，不再额外挂 el-tooltip。
  卡片尺寸 150×56 保持不变。
-->
<template>
  <div class="cmp-node-host">
    <div
      class="cmp-node"
      :class="{ 'is-selected': selected, 'is-virtual': data.virtual, 'has-title': showTitle }"
      :style="rootStyle"
      @mouseenter="onNodeEnter"
      @mouseleave="onNodeLeave"
    >
      <CmpContextPad v-if="!data.junctionOf && !data.placeholderOf" :node-id="id" :hover="hover" :selected="selected" />
      <Handle v-if="data.defType !== 'start'" type="target" :position="Position.Left" />
      <div class="cmp-node__icon">
        <SvgIcon :icon-class="iconName" />
      </div>
      <div class="cmp-node__body">
        <div class="cmp-node__label">
          {{ data.label }}
          <span v-if="isChain" class="cmp-node__status-dot" :style="{ background: statusDotColor }" />
        </div>
        <div v-if="showTitleOverride" class="cmp-node__title">{{ displayTitle }}</div>
      </div>
      <Handle v-if="data.defType !== 'end'" type="source" :position="Position.Right" />
      <!-- ↗ 只作可下钻的视觉暗示；说明放进 hover 信息卡，避免再挂一层黑色原生 title -->
      <span v-if="canDrill && hover" class="cmp-node__open-hint" aria-hidden="true">↗</span>
    </div>

    <!-- 组件码 / 链路码 + 加入会话：与选中文字浮层同一套气泡，Teleport 到 body 避免被画布 transform 影响 -->
    <ResourceHoverBubble :controller="hoverActions" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Handle, Position, type NodeProps } from '@vue-flow/core';
import { CHAIN_STATUS } from '@/constants/databus';
import { DATABUS_CHAIN_DEF_TYPE } from '@/constants/databus-chain';
import { DATABUS_TEMPLATE_FLAG_NO } from '@/constants/databus-common';
import type { CmpNodeData } from '../../composables/useElTreeModel';
import { getDef, materialTick } from '../../cmp-defs';
import { useChainOptions } from '../../composables/useChainOptions';
import CmpContextPad from './CmpContextPad.vue';
import ResourceHoverBubble from '@/views/databus/workbench/ai/ResourceHoverBubble.vue';
import { useResourceHover } from '@/views/databus/workbench/ai/useResourceHover';
import type { HoverResourceAction } from '@/views/databus/workbench/ai/useResourceActions';

const props = defineProps<NodeProps<CmpNodeData>>();

const hover = ref(false);

// 依赖 materialTick：/options 合流改写 icon 后节点同步刷新
const iconName = computed(() => {
  materialTick.value;
  return getDef(props.data.defType)?.icon ?? '';
});

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

// ── CHAIN 子流程卡片专属：中文名 + 状态色点 ──
// cmpId 存的是子链 chainCode，从共享链路选项缓存解析出名称/状态；
// 列表未加载时降级显示 chainCode，加载后响应式刷新（无需主动 ensure，
// 链路树/ChainSelect 任意一处拉过即命中模块级缓存）。
const isChain = computed(() => props.data.defType === DATABUS_CHAIN_DEF_TYPE);
// ↗ 悬停暗示：可双击下钻的节点（CHAIN 跳子流程 / 业务组件跳详情；排除虚拟/操作符/锚点/占位）
const canDrill = computed(
  () =>
    !!props.data.defType &&
    !props.data.virtual &&
    !props.data.operator &&
    !props.data.junctionOf &&
    !props.data.placeholderOf
);
const chainOpts = useChainOptions(() => ({ pageNum: 1, pageSize: 1000, isTemplate: DATABUS_TEMPLATE_FLAG_NO }));
const chainInfo = computed(() => {
  if (!isChain.value) return null;
  const code = props.data.cmpId;
  if (!code) return null;
  return chainOpts.chains.value.find((c) => c.chainCode === code) ?? null;
});

/** 卡片次行：CHAIN 显示子链中文名（兜底编码），其他组件显示业务标题 */
const displayTitle = computed(() => {
  if (isChain.value) return chainInfo.value?.chainName || props.data.cmpId || '';
  return props.data.title?.trim() || '';
});

/* ---------------- hover 操作：复制编码 / 加入会话 ---------------- */

const hoverActions = useResourceHover();

/** 当前节点可引用的资源：CHAIN 节点是链路，其余业务组件按组件处理 */
function resourceActionOf(data: CmpNodeData): HoverResourceAction | null {
  if (!canDrill.value) {
    return null;
  }
  const title = displayTitle.value || data.label;
  if (isChain.value) {
    const code = data.cmpId?.trim();
    return code ? { type: 'chain', code, name: title, codeLabel: '链路码' } : null;
  }
  const code = data.defType?.trim();
  return code
    ? {
        type: 'component',
        code,
        name: data.title?.trim() || data.label,
        codeLabel: '组件码',
        // 卡片上展示数据空间；没有 cmpId 时退回组件类型码，避免信息区空着
        infoCode: data.cmpId?.trim() || code
      }
    : null;
}

function onNodeEnter(event: MouseEvent) {
  hover.value = true;
  hoverActions.enter(resourceActionOf(props.data), event);
}

function onNodeLeave() {
  hover.value = false;
  hoverActions.leave();
}

/** 状态色点色值：已发布绿、草稿灰、已下线橙；解析不到时灰色 */
const statusDotColor = computed(() => {
  if (!isChain.value) return '';
  switch (chainInfo.value?.status) {
    case CHAIN_STATUS.ENABLED:
      return 'var(--el-color-success)';
    case CHAIN_STATUS.DISABLED:
      return 'var(--el-color-warning)';
    default:
      return 'var(--el-text-color-placeholder)';
  }
});

/** showTitle 复用 displayTitle：CHAIN 只要选了子链就显中文名，未选时与 label 相同则隐藏 */
const showTitleOverride = computed(() => {
  if (!isChain.value) return showTitle.value;
  const t = displayTitle.value;
  if (!t) return false;
  if (t === props.data.label?.trim()) return false;
  return true;
});
</script>

<style scoped>
/* 节点组件必须有单一根节点（外层 transition 限制）；display:contents 让外壳不参与布局 */
.cmp-node-host {
  display: contents;
}

.cmp-node {
  position: relative;
  display: flex;
  align-items: center;
  width: 150px;
  height: 56px;
  padding: 6px 8px;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
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
  border-color: var(--el-border-color);
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

/* 顶行：组件类型名，永远显。冷灰主文本色 + 微收字距，标题感更强 */
.cmp-node__label {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  line-height: 16px;
  color: var(--el-text-color-primary);
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* CHAIN 子流程状态色点：绿=已发布 / 灰=草稿 / 橙=已下线，与 ChainSelect 徽标同色语义 */
.cmp-node__status-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

/* 双击暗示：CHAIN 卡片 hover 时右上角浮出 ↗，提示可下钻；pointer-events:none 不挡连线 */
.cmp-node__open-hint {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 11px;
  line-height: 1;
  color: var(--el-text-color-secondary);
  opacity: 0.7;
  pointer-events: none;
  user-select: none;
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

/* ── 暗色主题：白底彩块改为深底彩块，保证文字对比度 ───────────────────── */
html.dark .cmp-node {
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 30%),
    0 1px 3px rgba(0, 0, 0, 35%);
}

html.dark .cmp-node__icon {
  /* 深色上品牌色 26% 调亮，图标仍用纯品牌色 */
  background-color: color-mix(in srgb, var(--brand, #909399) 26%, var(--el-bg-color));
}

html.dark .cmp-node__title {
  /* 浅色基调混入品牌色：暗底上的浅彩字，与图标呼应 */
  color: color-mix(in srgb, var(--brand, #6b7280) 65%, #e5eaf3);
}
</style>
