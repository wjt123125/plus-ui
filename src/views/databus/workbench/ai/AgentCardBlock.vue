<!--
  通用交互卡片：确认卡是折叠块，选择卡固定摊开（不允许折叠）。
  确认卡展开后是影响摘要 + 等宽原文块 + 右下角「取消 / 确认执行（带作用域菜单）」。
  选择卡是平铺选项 + 「其他」自由输入 + 左下取消（Esc）/ 右下提交（Enter）。
  ref 卡不是交互卡：整卡点开详情/审阅，草稿卡额外带播放钮开单节点预览链路，都交给宿主开 tab。
-->
<template>
  <div
    ref="rootRef"
    class="agent-card"
    :class="[`is-${status}`, `is-${card.kind}`, { 'is-open': open }]"
    :style="refTint"
    tabindex="-1"
    @keydown="onKeydown"
  >
    <!-- 资源卡：整卡即「打开详情」，不加多余文字提示；草稿卡右侧多一个播放钮开预览链路
         （不折叠，状态不影响可点） -->
    <div v-if="card.kind === DATABUS_CARD_KIND_REF" class="agent-card__ref">
      <button type="button" class="agent-card__ref-main" @click="emit('open')">
        <span class="agent-card__ref-head" :title="refMetaOf.label" :aria-label="refMetaOf.label">
          <SvgIcon :icon-class="refMetaOf.icon" />
        </span>
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
      <!-- 确认卡仍是折叠块（答完收起，点头部回看）；选择卡不许折叠，问题和选项一直摊开 -->
      <button v-if="collapsible" type="button" class="agent-card__head" @click="toggleOpen">
        <span class="agent-card__chip">确认</span>
        <span class="agent-card__title">{{ card.title }}</span>
        <span class="agent-card__state">{{ stateText }}</span>
        <span class="agent-card__chev" />
      </button>
      <div v-else class="agent-card__head is-static">
        <span class="agent-card__title">{{ card.title }}</span>
        <span v-if="stateText" class="agent-card__state">{{ stateText }}</span>
      </div>
      <div v-if="open" class="agent-card__panel">
        <p v-if="card.body" class="agent-card__body">{{ card.body }}</p>
        <!-- 原文块：把真正要执行的那次调用原样摆出来，等宽 + 可滚动 -->
        <pre v-if="card.detail" class="agent-card__detail">{{ card.detail }}</pre>

        <!-- 确认卡：左「取消」，右「确认执行」+ 箭头菜单（复用会话级审批档位） -->
        <div v-if="card.kind === DATABUS_CARD_KIND_CONFIRM" class="agent-card__actions">
          <button
            v-if="cancelOption"
            type="button"
            class="agent-card__cancel"
            :disabled="status !== 'pending'"
            :title="cancelOption.description"
            @click="emit('pick', cancelOption)"
          >
            <span>{{ cancelOption.label }}</span>
            <kbd class="agent-card__key">Esc</kbd>
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
              popper-class="agent-scope-popper"
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
                <div class="scope-head">如何批准这次操作？</div>
                <el-dropdown-menu>
                  <el-dropdown-item command="once" class="scope-item">
                    <span class="scope-item__icon"><SvgIcon icon-class="lucide:play" /></span>
                    <span class="scope-item__text">
                      <span class="scope-item__label">仅本次执行</span>
                      <span class="scope-item__desc">只放行这一次，会话设置不变</span>
                    </span>
                  </el-dropdown-item>
                  <el-dropdown-item command="session-auto" class="scope-item">
                    <span class="scope-item__icon"><SvgIcon icon-class="lucide:repeat-2" /></span>
                    <span class="scope-item__text">
                      <span class="scope-item__label">本会话改为自动审批</span>
                      <span class="scope-item__desc">本会话后续试跑不再逐次确认</span>
                    </span>
                    <SvgIcon
                      v-if="checkedScope === 'session-auto'"
                      icon-class="lucide:check"
                      class="scope-item__check"
                    />
                  </el-dropdown-item>
                  <el-dropdown-item
                    command="session-full"
                    class="scope-item is-danger-scope"
                    :disabled="!allowFullAccess"
                  >
                    <span class="scope-item__icon"><SvgIcon icon-class="lucide:shield-check" /></span>
                    <span class="scope-item__text">
                      <span class="scope-item__label">本会话完全允许</span>
                      <span class="scope-item__desc">
                        {{
                          allowFullAccess
                            ? '本会话所有试跑不再询问'
                            : '当前部署未开放完全访问'
                        }}
                      </span>
                    </span>
                    <SvgIcon
                      v-if="checkedScope === 'session-full'"
                      icon-class="lucide:check"
                      class="scope-item__check"
                    />
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>

        <!-- 选择卡：参考 Trae 的平铺行——标题与说明同行，选中只染底色；多选勾完点右下「提交」 -->
        <div v-else class="agent-card__choices">
          <button
            v-for="option in card.options"
            :key="option.key"
            type="button"
            class="agent-card__option"
            :class="{ 'is-picked': isPicked(option.key) }"
            :disabled="status !== 'pending'"
            :title="option.description"
            @click="onOption(option)"
          >
            <!-- 多选直接给复选框：勾选态一眼可见，标题里不用再写「可多选」 -->
            <span
              v-if="card.multiSelect"
              class="agent-card__box"
              :class="{ 'is-on': isPicked(option.key) }"
              aria-hidden="true"
            />
            <span class="agent-card__option-label">{{ option.label }}</span>
            <span v-if="option.description" class="agent-card__option-desc">{{ option.description }}</span>
            <!-- 单选没有复选框，用右侧勾标回显历史选择 -->
            <SvgIcon
              v-if="!card.multiSelect && isPicked(option.key)"
              icon-class="lucide:check"
              class="agent-card__option-mark"
            />
          </button>

          <!-- 自由输入：Trae 的「其他」行，下划线输入 + 字数计数；自动换行撑高 -->
          <label v-if="card.allowFreeText" class="agent-card__other">
            <span class="agent-card__other-label">其他</span>
            <textarea
              ref="textRef"
              v-model="freeText"
              class="agent-card__other-input"
              rows="1"
              placeholder="请输入"
              :maxlength="MAX_CARD_FREE_TEXT"
              :disabled="status !== 'pending'"
              @input="grow"
            />
            <span class="agent-card__other-count">{{ freeText.length }}/{{ MAX_CARD_FREE_TEXT }}</span>
          </label>

          <!-- 底部：左「取消」右「提交」；单选卡点一下即答，没有提交，只留取消 -->
          <div class="agent-card__footer">
            <button
              type="button"
              class="agent-card__cancel"
              :disabled="status !== 'pending'"
              @click="cancel"
            >
              <span>取消</span>
              <kbd class="agent-card__key">Esc</kbd>
            </button>
            <button
              v-if="needSubmit"
              type="button"
              class="agent-card__submit"
              :disabled="status !== 'pending' || !canSubmit"
              @click="submit"
            >
              <span>提交</span>
              <kbd class="agent-card__key">↵</kbd>
            </button>
          </div>
        </div>

        <p v-if="status === 'disabled'" class="agent-card__foot">本轮已结束，如需执行请重新发起。</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { AgentCard, AgentCardOption } from '@/api/databus/agent/types';
import {
  DATABUS_CARD_ACTION_CANCEL,
  DATABUS_CARD_KIND_CHOICE,
  DATABUS_CARD_KIND_CONFIRM,
  DATABUS_CARD_KIND_REF,
  DATABUS_RESOURCE_TYPE_CHAIN,
  DATABUS_RESOURCE_TYPE_COMPONENT
} from '@/constants/databus-common';
import { refMeta } from './agentRefTypes';
import { AGENT_APPROVAL_MODE, type AgentApprovalMode } from '@/constants/databus';

/** 拆分按钮的作用域：本次 / 本会话切自动审批 / 本会话完全允许 */
type CardPickScope = 'once' | 'session-auto' | 'session-full';

/** 自由输入长度上限，与后端 MAX_CARD_FREE_TEXT 保持一致 */
const MAX_CARD_FREE_TEXT = 500;

const props = defineProps<{
  card: AgentCard;
  status: 'pending' | 'answered' | 'disabled';
  /** 已回执的动作键：单选一项，多选多项 */
  picked?: string[];
  /** 已回执的自由输入内容 */
  cardText?: string;
  /** 部署是否开放「完全访问」档，未开放则菜单项置灰 */
  allowFullAccess?: boolean;
  /** 会话当前审批模式：用来给菜单里对应档位打勾 */
  approvalMode?: AgentApprovalMode;
  /** 当前仍是草稿的组件编码：历史卡片没带 resource.draft，靠台账现算兜底 */
  draftCodes?: string[];
  /** 浮层里的卡：挂载即把焦点收进卡片，Enter / Esc 能直接用 */
  autoFocus?: boolean;
}>();

const emit = defineEmits<{
  pick: [option: AgentCardOption, scope?: CardPickScope];
  /** 多选 / 自由输入的统一提交：actions 为空表示只发了文字 */
  submit: [actions: string[], text: string | undefined, label: string];
  /** 放弃这张卡：一项都不选，回执一个保留动作让后端停手 */
  cancel: [];
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

/** 确认卡可折叠回看；选择卡待选时摊开，选完/失效只留一行结论 */
const collapsible = computed(() => props.card.kind === DATABUS_CARD_KIND_CONFIRM);
const isChoice = computed(() => props.card.kind === DATABUS_CARD_KIND_CHOICE);
const localOpen = ref(props.status === 'pending');
const open = computed(() => {
  if (collapsible.value) {
    return localOpen.value;
  }
  // 选择卡只有「待选」时摊开；选完 / 失效后只留一行结论，不再摆着可点的选项
  return props.status === 'pending';
});

function toggleOpen() {
  if (collapsible.value) {
    localOpen.value = !localOpen.value;
  }
}

/** 当前会话档位对应哪一项：只做打勾提示，「仅本次」不影响会话设置所以永不勾选 */
const checkedScope = computed(() => {
  if (props.approvalMode === AGENT_APPROVAL_MODE.AUTO) {
    return 'session-auto';
  }
  if (props.approvalMode === AGENT_APPROVAL_MODE.FULL) {
    return 'session-full';
  }
  return '';
});

/** 状态变化后收起：确认卡答完/失效就不再占版面，需要回看时点标题展开 */
watch(
  () => props.status,
  (value) => {
    localOpen.value = value === 'pending';
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

/** 资源卡类型标记：图标与中文标签只从 agentRefTypes 注册表取，卡片内不再写死 */
const refMetaOf = computed(() =>
  refMeta(props.card.resource?.type ?? DATABUS_RESOURCE_TYPE_COMPONENT)
);

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

/** 多选勾选态：单选仍然点一下即答，只有多选需要本地暂存 */
const selected = ref<string[]>([]);
const freeText = ref('');

const rootRef = ref<HTMLElement>();
const textRef = ref<HTMLTextAreaElement>();

/** 自由输入最多撑到 6 行左右，再多就内部滚动，避免卡片顶跑消息流 */
const FREE_TEXT_MAX_HEIGHT = 132;

/** textarea 没有 autosize：先归零再按 scrollHeight 撑开（与评论框同一套做法） */
function grow() {
  const el = textRef.value;
  if (!el) {
    return;
  }
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, FREE_TEXT_MAX_HEIGHT)}px`;
  el.style.overflowY = el.scrollHeight > FREE_TEXT_MAX_HEIGHT ? 'auto' : 'hidden';
}

/** 浮层里的卡自动接管焦点：有输入框给输入框，没有就给卡片根，Esc 才有落点 */
function focusCard() {
  if (props.status !== 'pending') {
    return;
  }
  nextTick(() => {
    (textRef.value ?? rootRef.value)?.focus();
  });
}

onMounted(() => {
  nextTick(grow);
  if (props.autoFocus) {
    focusCard();
  }
});

watch(
  () => props.card.cardId,
  () => {
    nextTick(grow);
    if (props.autoFocus) {
      focusCard();
    }
  }
);

watch(
  [() => props.picked, () => props.cardText],
  () => {
    selected.value = props.picked ? [...props.picked] : [];
    freeText.value = props.cardText ?? '';
    nextTick(grow);
  },
  { immediate: true }
);

/** 单选卡点一下即答，不需要提交；多选或带自由输入才给提交钮 */
const needSubmit = computed(
  () => isChoice.value && (!!props.card.multiSelect || !!props.card.allowFreeText)
);

const canSubmit = computed(
  () => props.status === 'pending' && (selected.value.length > 0 || !!freeText.value.trim())
);

/** 选中态：已回执的 key 常亮；待选时叠加本地勾选 */
function isPicked(key: string): boolean {
  return (props.picked ?? []).includes(key) || selected.value.includes(key);
}

/** 选项点击：多选只切换勾选，单选沿用点一下即答 */
function onOption(option: AgentCardOption) {
  if (props.status !== 'pending') {
    return;
  }
  if (!props.card.multiSelect) {
    emit('pick', option);
    return;
  }
  const index = selected.value.indexOf(option.key);
  if (index >= 0) {
    selected.value.splice(index, 1);
  } else {
    selected.value.push(option.key);
  }
}

/** 点选瞬间的乐观文案：服务端返回 display 后会被覆盖，这里只负责点完立刻有反馈 */
function answerLabel(actions: string[], text?: string): string {
  const labels = actions.map(
    (key) => props.card.options.find((option) => option.key === key)?.label ?? key
  );
  const parts: string[] = [];
  if (labels.length) {
    parts.push(`已选「${labels.join('、')}」`);
  }
  if (text) {
    parts.push(text);
  }
  return parts.join('；') || props.card.title;
}

/** 提交多选 / 自由输入：只点选项不填字时 actions 照样带出去 */
function submit() {
  if (!canSubmit.value) {
    return;
  }
  const actions = props.card.multiSelect ? [...selected.value] : [];
  const text = props.card.allowFreeText ? freeText.value.trim() || undefined : undefined;
  emit('submit', actions, text, answerLabel(actions, text));
}

/** 取消：一项都不选，回执一个保留动作，让后端知道用户放弃了这张卡 */
function cancel() {
  if (props.status === 'pending') {
    emit('cancel');
  }
}

/** 卡片内快捷键：Esc 取消整张卡（确认卡等同点「取消」）；Enter 在选择卡输入框里提交 */
function onKeydown(event: KeyboardEvent) {
  if (props.status !== 'pending') {
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    if (isChoice.value) {
      cancel();
    } else if (open.value && cancelOption.value) {
      emit('pick', cancelOption.value);
    }
    return;
  }
  if (!isChoice.value) {
    return;
  }
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) {
    return;
  }
  // 选项按钮自己会响应 Enter，别再跟着提交一次
  if (event.target !== textRef.value) {
    return;
  }
  event.preventDefault();
  submit();
}

const pickedLabel = computed(() =>
  (props.picked ?? [])
    .filter((key) => key !== DATABUS_CARD_ACTION_CANCEL)
    .map((key) => props.card.options.find((option) => option.key === key)?.label ?? key)
    .join('、')
);

/** 标题行右侧状态：确认卡看待办/已答复；选择卡待选时什么都不说（选项本身就是答案） */
const stateText = computed(() => {
  if (props.status === 'pending') {
    return props.card.kind === DATABUS_CARD_KIND_CONFIRM ? '待确认' : '';
  }
  if (props.status === 'answered') {
    if ((props.picked ?? []).includes(DATABUS_CARD_ACTION_CANCEL)) {
      return '已取消';
    }
    const parts: string[] = [];
    if (pickedLabel.value) {
      parts.push(`已选「${pickedLabel.value}」`);
    }
    if (props.cardText) {
      const brief = props.cardText.length > 12 ? `${props.cardText.slice(0, 12)}…` : props.cardText;
      parts.push(`已输入「${brief}」`);
    }
    return parts.join('，') || '已答复';
  }
  return '已失效';
});
</script>

<style scoped lang="scss">
.agent-card {
  box-sizing: border-box;
  width: 100%;
  margin: 8px 0;
  outline: none;
}

/* 资源卡：容器承载 tint，主体是内部按钮（避免按钮嵌套），草稿卡右侧挂「▶」
   （与输入区 .agent-chat__ref 同一套口径，不用主色描边）。
   左端图标是整卡高的卡片「头」，图标在其中居中 */
.agent-card__ref {
  display: flex;
  align-items: stretch;
  gap: 4px;
  width: 100%;
  max-width: 100%;
  padding: 0 10px 0 0;
  overflow: hidden;
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
  align-items: stretch;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

/* 卡片头：与正文同高，宽度固定，图标在色块内水平垂直居中 */
.agent-card__ref-head {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  font-size: 18px;
  color: var(--card-ink, var(--db-ink-muted, #6e6e73));
  background: color-mix(in srgb, var(--card-ink, var(--db-ink-muted, #6e6e73)) 12%, transparent);
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

.agent-card__ref .agent-card__title {
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
}

.agent-card__ref-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 8px 0 8px 10px;
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
  padding: 2px 0;
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

/* 选择卡不折叠：头部是一段静态文字，问题可以换行完整露出 */
.agent-card__head.is-static {
  align-items: flex-start;
  cursor: default;
}

.agent-card__head.is-static:hover {
  color: var(--db-ink-secondary, #3a3a3c);
}

/* 选择卡的问题就是主角：黑色加粗，允许换行完整露出 */
.agent-card.is-choice .agent-card__title {
  overflow: visible;
  color: var(--db-ink, #1c1c1e);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.55;
  white-space: normal;
  word-break: break-word;
}

/* 已失效的历史卡：只留问题和「已失效」，整体压暗，读起来是记录而不是待办 */
.agent-card.is-choice.is-disabled .agent-card__head.is-static {
  opacity: 0.55;
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
  margin-top: 4px;
}

.agent-card__body {
  margin: 0;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 12.5px;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 原文块：等宽灰底，占满卡片内容宽度（左右只留卡片自身的 margin），限高后可横竖滚动 */
.agent-card__detail {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
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
  border-radius: 8px 0 0 8px;
}

.agent-card__split .agent-card__btn.is-arrow {
  width: 24px;
  padding: 0;
  /* currentColor 画分割线：主段墨黑、禁用态灰字都能自动跟着变 */
  border-left: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 0 8px 8px 0;
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

/* 确认卡的主按钮底座：取消单独用 .agent-card__cancel，这里只服务「确认执行」拆分段 */
.agent-card__btn {
  height: 28px;
  padding: 0 14px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--db-ink-secondary, #3a3a3c);
  font-size: 12.5px;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}

.agent-card__btn:hover:not(:disabled) {
  background: var(--db-bg-hover, rgba(120, 120, 128, 0.08));
  color: var(--db-ink, #1c1c1e);
}

/* 主动作（确认执行 / 提交）：墨黑实心，与会话发送按钮同一套语言 */
.agent-card__btn.is-primary {
  background: var(--db-ink, #1c1c1e);
  color: var(--db-bg-solid, #fff);
  font-weight: 500;
}

.agent-card__btn.is-primary:hover:not(:disabled) {
  background: var(--db-ink-secondary, #3a3a3c);
  color: var(--db-bg-solid, #fff);
}

.agent-card__btn:disabled {
  opacity: 0.5;
  cursor: default;
}

/* 选择卡：不画盒子，靠行距与 hover 底区分（参考 Trae 的选项列表） */
.agent-card__choices {
  display: flex;
  flex-direction: column;
  margin-top: 4px;
}

.agent-card__option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 9px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--db-ink-primary, #1d1d1f);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.agent-card__option:hover:not(:disabled) {
  background: var(--db-bg-hover, rgba(120, 120, 128, 0.08));
}

.agent-card__option:disabled {
  cursor: default;
}

/* 选中态染底并把标签加粗；勾选形态由复选框（多选）或右侧勾标（单选回显）表达 */
.agent-card__option.is-picked {
  background: var(--db-fill, rgba(60, 60, 67, 0.07));
}

.agent-card__option.is-picked .agent-card__option-label {
  font-weight: 600;
}

.agent-card__option-label {
  flex: none;
  max-width: 42%;
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.6;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 多选复选框：14px 方框，选中墨黑底 + 白勾，不额外占用说明的空间 */
.agent-card__box {
  position: relative;
  flex: none;
  width: 14px;
  height: 14px;
  border: 1.5px solid var(--db-rule-strong, rgba(60, 60, 67, 0.32));
  border-radius: 4px;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.agent-card__box.is-on {
  border-color: var(--db-ink, #1c1c1e);
  background: var(--db-ink, #1c1c1e);
}

/* 用两条边框拼勾，避免为一个 10px 图标引资源 */
.agent-card__box.is-on::after {
  content: '';
  position: absolute;
  top: 0.5px;
  left: 3px;
  width: 4px;
  height: 7px;
  border: solid var(--db-bg-solid, #fff);
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg);
}

/* 说明与标题同行，灰字省略；完整文案走 title 悬浮提示 */
.agent-card__option-desc {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 12px;
  line-height: 1.6;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.agent-card__option-mark {
  flex: none;
  color: var(--db-ink, #1c1c1e);
  font-size: 13px;
}

/* 「其他」行：下划线输入 + 右侧字数，和选项同一行节奏 */
.agent-card__other {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  cursor: text;
}

.agent-card__other-label {
  flex: none;
  color: var(--db-ink-primary, #1d1d1f);
  font-size: 13px;
  font-weight: 500;
  line-height: 22px;
}

.agent-card__other-input {
  display: block;
  flex: 1;
  min-width: 0;
  min-height: 22px;
  max-height: 132px;
  padding: 0 2px;
  overflow-y: hidden;
  border: 0;
  border-bottom: 1px solid var(--db-rule-strong, rgba(60, 60, 67, 0.24));
  border-radius: 0;
  background: transparent;
  color: var(--db-ink-primary, #1d1d1f);
  font-family: inherit;
  font-size: 13px;
  line-height: 22px;
  outline: none;
  resize: none;
  transition: border-color 0.15s;
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-card__other-input:focus {
  border-bottom-color: var(--db-ink-muted, #6e6e73);
}

.agent-card__other-input::placeholder {
  color: var(--db-ink-muted, #6e6e73);
}

.agent-card__other-input:disabled {
  cursor: default;
}

.agent-card__other-count {
  flex: none;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  line-height: 22px;
}

.agent-card__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

/* 取消：极浅灰底，与墨黑提交并排但明显次一级；Esc 键帽提示快捷键 */
.agent-card__cancel {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px 0 16px;
  border: 0;
  border-radius: 8px;
  background: var(--db-fill, rgba(60, 60, 67, 0.07));
  color: var(--db-ink-secondary, #3a3a3c);
  font-size: 12.5px;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}

.agent-card__cancel:hover:not(:disabled) {
  background: var(--db-bg-hover, rgba(120, 120, 128, 0.14));
  color: var(--db-ink, #1c1c1e);
}

.agent-card__cancel:disabled {
  opacity: 0.4;
  cursor: default;
}

/* 提交按钮对齐 Trae 的「下一步」：墨黑实心、细长、右侧带回车键帽 */
.agent-card__submit {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 28px;
  padding: 0 8px 0 17px;
  border: 0;
  border-radius: 8px;
  background: var(--db-ink, #1c1c1e);
  color: var(--db-bg-solid, #fff);
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.15s,
    opacity 0.15s;
}

.agent-card__submit:hover:not(:disabled) {
  background: var(--db-ink-secondary, #3a3a3c);
}

.agent-card__submit:disabled {
  opacity: 0.4;
  cursor: default;
}

/* 键帽：半透明白底，跟按钮同色系；Esc / Enter 各挂一颗 */
.agent-card__key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border: 0;
  border-radius: 5px;
  background: color-mix(in srgb, currentColor 18%, transparent);
  color: inherit;
  font-family: inherit;
  font-size: 10.5px;
  line-height: 1;
}

.agent-card__foot {
  margin: 8px 0 0;
  color: var(--db-ink-muted, #6e6e73);
  font-size: 11.5px;
  line-height: 1.6;
}
</style>

<style lang="scss">
/*
 * 审批范围菜单（Teleport 到 body，只能用非 scoped 块）。
 *
 * 与 db-menu-popper 的定位不同：那是右键式紧凑动作列表，这里是一次「做决定」，
 * 所以按 Trae 的样式做成一页小面板：标题 + 两行选项（主文案 + 灰说明）+ 当前档位打勾，
 * 高危项整项染橙。行高不锁 30px，靠内边距和 14px 圆角撑出呼吸。
 */
.el-dropdown__popper.agent-scope-popper {
  min-width: 236px;
  padding: 6px;
  border-radius: 14px;

  /* 浮层自成一卡，不画指向箭头 */
  .el-popper__arrow {
    display: none;
  }

  .scope-head {
    padding: 8px 10px 4px;
    color: var(--db-ink, #1c1c1e);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
  }

  .el-dropdown-menu {
    padding: 0;
    border: 0;
    background: transparent;
  }

  .el-dropdown-menu__item {
    align-items: flex-start;
    gap: 10px;
    height: auto;
    min-height: 0;
    margin: 0;
    padding: 8px 10px;
    border-radius: 10px;
    color: var(--db-ink, #1c1c1e);
    font-size: 13px;
    line-height: 1.4;

    &:not(.is-disabled):hover,
    &:not(.is-disabled):focus {
      background: var(--db-bg-hover, rgba(120, 120, 128, 0.08));
      color: var(--db-ink, #1c1c1e);
    }
  }

  .scope-item__icon {
    flex: none;
    display: inline-flex;
    margin-top: 2px;
    color: var(--db-ink-muted, #6e6e73);

    .svg-icon {
      width: 16px;
      height: 16px;
    }
  }

  .scope-item__text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    /* Element 的菜单项默认 nowrap，说明文字要允许折行 */
    white-space: normal;
  }

  .scope-item__label {
    font-weight: 500;
  }

  .scope-item__desc {
    color: var(--db-ink-muted, #6e6e73);
    font-size: 11.5px;
    font-weight: 400;
    line-height: 1.5;
  }

  /* 当前档位用主题蓝打勾：与会话里「已选」的语义色保持一致 */
  .scope-item__check {
    flex: none;
    margin-top: 2px;
    color: var(--db-blue, #007aff);
    font-size: 15px;
  }

  /* 权限升级项整项染橙：图标、标题、说明一起走，禁用时降透明度 */
  .el-dropdown-menu__item.is-danger-scope {
    color: var(--el-color-warning, #e6a23c);

    .scope-item__icon,
    .scope-item__desc {
      color: inherit;
    }

    .scope-item__desc {
      opacity: 0.82;
    }

    &:not(.is-disabled):hover,
    &:not(.is-disabled):focus {
      background: var(--el-color-warning-light-9, #fdf6ec);
      color: var(--el-color-warning, #e6a23c);
    }

    &.is-disabled {
      color: var(--el-color-warning, #e6a23c);
      opacity: 0.55;
    }
  }
}
</style>