<!--
  通用交互卡片：折叠块（像思考块一样），标题行标识「确认」或「选择」+ 卡片标题 + 状态。
  确认卡展开后是影响摘要 + 等宽原文块 + 右下角「取消 / 确认执行（带作用域菜单）」。
  ref 卡不是交互卡：整卡点开详情/审阅，草稿卡额外带播放钮开单节点预览链路，都交给宿主开 tab。
  pending 默认展开等待操作；已选 / 已结束后自动收起，点标题可回看。
-->
<template>
  <div
    class="agent-card"
    :class="[`is-${status}`, `is-${card.kind}`, { 'is-open': open }]"
    :style="refTint"
  >
    <!-- 资源卡：整卡即「打开详情」，不加多余文字提示；草稿卡右侧多一个播放钮开预览链路
         （不折叠，状态不影响可点） -->
    <div v-if="card.kind === DATABUS_CARD_KIND_REF" class="agent-card__ref">
      <button type="button" class="agent-card__ref-main" @click="emit('open')">
        <span class="agent-card__chip">{{ card.resource?.type === DATABUS_RESOURCE_TYPE_CHAIN ? '链路' : '组件' }}</span>
        <span class="agent-card__ref-text">
          <span class="agent-card__title">{{ card.title }}</span>
          <span v-if="card.body" class="agent-card__ref-desc">{{ card.body }}</span>
        </span>
      </button>
      <button
        v-if="playable"
        type="button"
        class="agent-card__ref-play"
        title="试运行（打开预览链路）"
        @click="emit('preview')"
      >
        <SvgIcon icon-class="lucide:play" />
      </button>
    </div>
    <template v-else>
      <button type="button" class="agent-card__head" @click="open = !open">
        <span class="agent-card__chip">{{ card.kind === DATABUS_CARD_KIND_CONFIRM ? '确认' : '选择' }}</span>
        <span class="agent-card__title">{{ card.title }}</span>
        <span class="agent-card__state">{{ stateText }}</span>
        <span class="agent-card__chev" />
      </button>
      <div v-if="open" class="agent-card__panel">
        <p v-if="card.body" class="agent-card__body">{{ card.body }}</p>
        <!-- 原文块：把真正要执行的那次调用原样摆出来，等宽 + 可滚动 -->
        <pre v-if="card.detail" class="agent-card__detail">{{ card.detail }}</pre>

        <!-- 确认卡：左「取消」，右「确认执行」+ 箭头菜单（复用会话级审批档位） -->
        <div v-if="card.kind === DATABUS_CARD_KIND_CONFIRM" class="agent-card__actions">
          <button
            v-if="cancelOption"
            type="button"
            class="agent-card__btn"
            :disabled="status !== 'pending'"
            :title="cancelOption.description"
            @click="emit('pick', cancelOption)"
          >
            {{ cancelOption.label }}
          </button>
          <div v-if="confirmOption" class="agent-card__split">
            <button
              type="button"
              class="agent-card__btn is-primary is-main"
              :disabled="status !== 'pending'"
              :title="confirmOption.description"
              @click="emit('pick', confirmOption)"
            >
              {{ confirmOption.label }}
            </button>
            <el-dropdown
              trigger="click"
              placement="top-end"
              popper-class="db-menu-popper"
              :disabled="status !== 'pending'"
              @command="pickScoped"
            >
              <button
                type="button"
                class="agent-card__btn is-primary is-arrow"
                :disabled="status !== 'pending'"
                title="选择允许范围"
              >
                <span class="agent-card__caret" />
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="once">仅本次执行</el-dropdown-item>
                  <el-dropdown-item command="session-auto">本会话改为自动审批</el-dropdown-item>
                  <el-dropdown-item command="session-full" :disabled="!allowFullAccess">
                    本会话完全允许
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>

        <!-- 选择卡：选项必须带 description，仍以列表呈现 -->
        <div v-else class="agent-card__options">
          <button
            v-for="option in card.options"
            :key="option.key"
            type="button"
            class="agent-card__option"
            :class="{ 'is-picked': picked === option.key }"
            :disabled="status !== 'pending'"
            @click="emit('pick', option)"
          >
            <span class="agent-card__option-label">
              {{ option.label }}
              <span v-if="picked === option.key" class="agent-card__check">已选</span>
            </span>
            <span v-if="option.description" class="agent-card__option-desc">{{ option.description }}</span>
          </button>
        </div>

        <p v-if="status === 'disabled'" class="agent-card__foot">本轮已结束，如需执行请重新发起。</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { AgentCard, AgentCardOption } from '@/api/databus/agent/types';
import {
  DATABUS_CARD_KIND_CONFIRM,
  DATABUS_CARD_KIND_REF,
  DATABUS_RESOURCE_TYPE_CHAIN,
  DATABUS_RESOURCE_TYPE_COMPONENT
} from '@/constants/databus-common';

/** 拆分按钮的作用域：本次 / 本会话切自动审批 / 本会话完全允许 */
type CardPickScope = 'once' | 'session-auto' | 'session-full';

const props = defineProps<{
  card: AgentCard;
  status: 'pending' | 'answered' | 'disabled';
  picked?: string;
  /** 部署是否开放「完全访问」档，未开放则菜单项置灰 */
  allowFullAccess?: boolean;
  /** 当前仍是草稿的组件编码：历史卡片没带 resource.draft，靠台账现算兜底 */
  draftCodes?: string[];
}>();

const emit = defineEmits<{
  pick: [option: AgentCardOption, scope?: CardPickScope];
  /** ref 卡：只要求宿主开对应 tab，不回传消息 */
  open: [];
  /** ref 卡（草稿）：开单节点预览链路，同样不回传消息 */
  preview: [];
}>();

/**
 * 播放钮是否露出：卡片自带 draft 标记优先（新卡片），缺省则查当前草稿台账
 * （老消息落库时还没有该字段，不回查就永远看不到入口）。
 */
const playable = computed(() => {
  const resource = props.card.resource;
  if (props.card.kind !== DATABUS_CARD_KIND_REF) {
    return false;
  }
  if (!resource || resource.type !== DATABUS_RESOURCE_TYPE_COMPONENT) {
    return false;
  }
  if (resource.draft) {
    return true;
  }
  return !!resource.code && (props.draftCodes ?? []).includes(resource.code);
});

const open = ref(props.status === 'pending');

/** 状态变化后收起：选完/失效就不再占版面，需要回看时点标题展开 */
watch(
  () => props.status,
  (value) => {
    open.value = value === 'pending';
  }
);

/** ref 卡的类型色：只给极淡 tint 与文字着色，主体保持中性（与输入区引用卡同一套口径） */
const refTint = computed(() => {
  if (props.card.kind !== DATABUS_CARD_KIND_REF) {
    return undefined;
  }
  const chain = props.card.resource?.type === DATABUS_RESOURCE_TYPE_CHAIN;
  return {
    '--card-ink': chain ? 'var(--db-ref-chain, #5457d6)' : 'var(--db-ref-component, #0f8f6f)'
  };
});

/** 确认卡只认主次两个按钮：primary 是放行，另一个是取消 */
const confirmOption = computed(
  () => props.card.options.find((option) => option.style === 'primary') ?? props.card.options[0]
);
const cancelOption = computed(() =>
  props.card.options.find((option) => option.key !== confirmOption.value?.key)
);

/** 箭头菜单：作用域选完仍要回传 confirm，让后端照常认这次卡片回执 */
function pickScoped(command: string) {
  if (!confirmOption.value || props.status !== 'pending') {
    return;
  }
  emit('pick', confirmOption.value, command as CardPickScope);
}

const pickedLabel = computed(
  () => props.card.options.find((option) => option.key === props.picked)?.label ?? ''
);

/** 标题行右侧状态：不展开也能看出这张卡是待办、已选还是已失效 */
const stateText = computed(() => {
  if (props.status === 'pending') {
    return props.card.kind === DATABUS_CARD_KIND_CONFIRM ? '待确认' : '待选择';
  }
  if (props.status === 'answered') {
    return pickedLabel.value ? `已选「${pickedLabel.value}」` : '已选';
  }
  return '已结束';
});
</script>

<style scoped lang="scss">
.agent-card {
  margin: 2px 0 10px;
}

/* 资源卡：容器承载 tint，主体是内部按钮（避免按钮嵌套），草稿卡右侧挂「▶」
   （与输入区 .agent-chat__ref 同一套口径，不用主色描边） */
.agent-card__ref {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
  max-width: 100%;
  padding: 9px 12px;
  border: 0;
  border-radius: 10px;
  background: color-mix(in srgb, var(--card-ink, var(--db-ink-muted, #6e6e73)) 5%, transparent);
  box-shadow: inset 0 0 0 0.5px
    color-mix(in srgb, var(--card-ink, var(--db-ink-muted, #6e6e73)) 20%, transparent);
  color: inherit;
  transition:
    background 0.15s,
    box-shadow 0.15s;
}

.agent-card__ref-main {
  display: flex;
  flex: 1;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

/* 试运行入口：草稿卡才有；裸图标，不画按钮框，hover 才染类型色 */
.agent-card__ref-play {
  flex: none;
  align-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition: color 0.15s;
}

.agent-card__ref-play:hover {
  color: var(--card-ink, var(--db-ink-muted, #6e6e73));
}

.agent-card__ref:hover {
  background: color-mix(in srgb, var(--card-ink, var(--db-ink-muted, #6e6e73)) 9%, transparent);
  box-shadow: inset 0 0 0 0.5px
    color-mix(in srgb, var(--card-ink, var(--db-ink-muted, #6e6e73)) 32%, transparent);
}

/* 类型标签跟随资源类型色：只占一小块 tint，不与正文争主色 */
.agent-card .agent-card__ref .agent-card__chip {
  margin-top: 1px;
  background: color-mix(in srgb, var(--card-ink, var(--db-ink-muted, #6e6e73)) 12%, transparent);
  color: var(--card-ink, var(--db-ink-muted, #6e6e73));
  font-weight: 500;
}

.agent-card__ref .agent-card__title {
  font-size: 13px;
  font-weight: 600;
}

.agent-card__ref-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.agent-card__ref-desc {
  color: var(--db-ink-muted, #6e6e73);
  font-size: 11.5px;
  line-height: 1.6;
  word-break: break-word;
}

.agent-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 2px 6px 2px 0;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--db-ink-secondary, #3a3a3c);
  font-size: 12px;
  line-height: 1.6;
  text-align: left;
  cursor: pointer;
}

.agent-card__head:hover {
  color: var(--db-ink-primary, #1d1d1f);
}

.agent-card__chip {
  flex: none;
  padding: 0 6px;
  border-radius: 4px;
  background: var(--db-chip, rgba(60, 60, 67, 0.08));
  color: var(--db-ink-muted, #6e6e73);
  font-size: 11px;
  line-height: 18px;
}

/* 待办高亮只给确认/选择卡的头部；资源卡的标签用资源类型色，不跟主色 */
.agent-card.is-pending .agent-card__head .agent-card__chip {
  background: rgba(0, 122, 255, 0.08);
  color: var(--db-blue, #007aff);
}

.agent-card__title {
  overflow: hidden;
  min-width: 0;
  color: var(--db-ink-primary, #1d1d1f);
  font-size: 12.5px;
  font-weight: 500;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.agent-card__state {
  flex: none;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 11.5px;
}

.agent-card.is-disabled .agent-card__state,
.agent-card.is-disabled .agent-card__title {
  color: var(--db-ink-muted, #6e6e73);
}

/* 用边框画箭头，不引图标依赖（与思考块一致） */
.agent-card__chev {
  flex: none;
  width: 6px;
  height: 6px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg) translateY(-1px);
  transition: transform 0.15s;
}

.agent-card.is-open .agent-card__chev {
  transform: rotate(-135deg) translateY(-1px);
}

/* 展开后不再套外框：摘要就是一行灰字，操作收在右下角 */
.agent-card__panel {
  margin-top: 2px;
  padding-left: 1px;
}

.agent-card__body {
  margin: 0;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 12.5px;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 原文块：等宽灰底，限高后可横竖滚动，保证长 payload 不撑破侧栏 */
.agent-card__detail {
  max-height: 132px;
  margin: 8px 0 0;
  padding: 8px 10px;
  overflow: auto;
  border-radius: 8px;
  background: var(--db-fill, rgba(60, 60, 67, 0.06));
  color: var(--db-ink-secondary, #3a3a3c);
  font-family: var(--db-font-mono, ui-monospace, sfmono-regular, menlo, consolas, monospace);
  font-size: 11.5px;
  line-height: 1.65;
  white-space: pre;
}

.agent-card__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

/* 拆分按钮：主段放行、箭头段开作用域菜单，两段共用一颗主按钮的观感 */
.agent-card__split {
  display: inline-flex;
}

.agent-card__split .agent-card__btn.is-main {
  border-radius: 7px 0 0 7px;
}

.agent-card__split .agent-card__btn.is-arrow {
  width: 26px;
  padding: 0;
  border-left: 1px solid rgba(255, 255, 255, 0.32);
  border-radius: 0 7px 7px 0;
}

/* 用小三角画下拉指示，不引图标依赖 */
.agent-card__caret {
  display: inline-block;
  width: 0;
  height: 0;
  border-top: 4.5px solid currentColor;
  border-right: 3.5px solid transparent;
  border-left: 3.5px solid transparent;
  vertical-align: middle;
}

.agent-card__btn {
  height: 28px;
  padding: 0 14px;
  /* 次动作：灰字灰底，只借主色描边保留归属感 */
  border: 1px solid rgba(0, 122, 255, 0.28);
  border-radius: 7px;
  background: transparent;
  color: var(--db-ink-secondary, #3a3a3c);
  font-size: 12.5px;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}

.agent-card__btn:hover:not(:disabled) {
  border-color: var(--db-blue, #007aff);
  color: var(--db-blue, #007aff);
}

.agent-card__btn.is-primary {
  border-color: transparent;
  background: var(--db-blue, #007aff);
  color: #fff;
  font-weight: 500;
}

/* hover 只换底色，别用 filter：白字和白色分隔线会被一起压暗 */
.agent-card__btn.is-primary:hover:not(:disabled) {
  background: var(--db-blue-hover, #0068db);
  color: #fff;
}

.agent-card__btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.agent-card__options {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.agent-card__option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid var(--db-rule, rgba(60, 60, 67, 0.14));
  border-radius: 8px;
  background: transparent;
  color: var(--db-ink-primary, #1d1d1f);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.agent-card__option:hover:not(:disabled) {
  border-color: var(--db-ink-muted, #6e6e73);
}

.agent-card__option:disabled {
  cursor: default;
}

.agent-card__option.is-picked {
  border-color: var(--db-blue, #007aff);
  background: rgba(0, 122, 255, 0.08);
}

.agent-card__option-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.6;
}

.agent-card__check {
  padding: 0 4px;
  border-radius: 3px;
  background: rgba(0, 122, 255, 0.08);
  color: var(--db-blue, #007aff);
  font-size: 10px;
  font-weight: 400;
  line-height: 16px;
}

.agent-card__option-desc {
  color: var(--db-ink-muted, #6e6e73);
  font-size: 11.5px;
  font-weight: 400;
  line-height: 1.6;
  word-break: break-word;
}

.agent-card__foot {
  margin: 8px 0 0;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 11.5px;
  line-height: 1.6;
}
</style>