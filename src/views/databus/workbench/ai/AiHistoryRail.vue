<template>
  <div v-if="!collapsed" class="ai-hist-rail" :style="{ width: `${width}px` }">
    <!--
      会话历史栏（databus 工作台共享件）：AI 助手栏左边的**兄弟栏**。
      结构对齐大厂会话侧栏的通行做法——顶部整行「新建」是永久第一落点，
      标题行只放搜索与视图切换，列表两行卡片（标题 + 状态/时间），操作收进 hover 三点菜单。
      数据由宿主（useAgentChat）喂入，组件只渲染与上抛意图，不碰接口。
    -->
    <div class="ai-hist-rail__newbar">
      <button type="button" class="ai-hist-rail__new db-float" @click="emit('new')">
        <SvgIcon icon-class="lucide:plus" />
        <span>新建会话</span>
        <kbd class="ai-hist-rail__kbd">Ctrl+Alt+N</kbd>
      </button>
    </div>

    <div class="ai-hist-rail__head">
      <!-- 搜索框与放大镜同一行：点开后在放大镜左侧展开，不另起一行挤掉列表高度 -->
      <el-input
        v-if="searchOpen"
        ref="searchInputRef"
        v-model="keyword"
        class="ai-hist-rail__search-input"
        size="small"
        clearable
        placeholder="搜索标题或对话内容"
        @input="onSearchInput"
        @clear="onSearchInput"
      />
      <el-tooltip :content="searchOpen ? '收起搜索' : '搜索会话'" placement="bottom">
        <button
          type="button"
          class="ai-hist-rail__head-btn"
          :class="{ 'is-on': searchOpen }"
          @click="toggleSearch"
        >
          <SvgIcon icon-class="lucide:search" />
        </button>
      </el-tooltip>
      <el-tooltip :content="view === 'group' ? '切换为列表视图' : '切换为分组视图'" placement="bottom">
        <button type="button" class="ai-hist-rail__head-btn" @click="toggleView">
          <SvgIcon :icon-class="view === 'group' ? 'lucide:layout-list' : 'lucide:list-tree'" />
        </button>
      </el-tooltip>
    </div>

    <div class="ai-hist-rail__body db-scroll">
      <div v-if="!sessions.length && !keyword" class="db-empty db-empty--compact ai-hist-rail__empty">
        <span class="db-empty__icon"><SvgIcon icon-class="lucide:message-square-more" /></span>
        <p class="db-empty__title">还没有会话</p>
      </div>
      <p v-else-if="!sessions.length" class="ai-hist-rail__empty">
        没有匹配「{{ keyword }}」的会话
      </p>

      <section v-for="group in displayGroups" :key="group.key" class="ai-hist-rail__group">
        <!-- 分组头与物料管理的分组标题同规格：13px + chevron + 计数 + 底部发丝线，整条可点折叠 -->
        <button
          v-if="view === 'group'"
          type="button"
          class="ai-hist-rail__group-head"
          :class="{ 'is-collapsed': isCollapsed(group.key) }"
          @click="toggleGroup(group.key)"
        >
          <SvgIcon class="ai-hist-rail__group-chevron" icon-class="lucide:chevron-down" />
          <span class="ai-hist-rail__group-name">{{ group.name }}</span>
          <span class="ai-hist-rail__group-count">{{ group.sessions.length }}</span>
        </button>

        <!-- 会话行复用 .db-row 基元：行间不画线，靠行间距分开 -->
        <ul v-if="!isCollapsed(group.key)" class="db-list db-list--compact">
          <li
            v-for="s in group.sessions"
            :key="s.id"
            class="db-row db-float is-clickable"
            :class="{ 'is-active': s.id === activeId }"
            :title="s.title"
            @click="emit('open', s)"
          >
            <div class="db-row__meta">
              <!-- 首行：圆点 + 标题（圆点与标题同一水平线）；圆点常驻，状态词只在 hover 时提示 -->
              <div class="db-row__line ai-hist-rail__title-line">
                <StatusDot
                  :tone="s.running ? 'success' : 'info'"
                  :label="s.running ? '运行中' : '已完成'"
                />
                <span class="db-row__name">{{ s.title }}</span>
                <SvgIcon v-if="s.pinned" icon-class="lucide:pin" class="ai-hist-rail__pin" />
              </div>
              <!-- 次行：时间在左，运行中才补状态词；完成态不再重复写「已完成」 -->
              <div class="ai-hist-rail__state">
                <template v-if="s.time">
                  <span class="ai-hist-rail__time db-num">{{ s.time }}</span>
                  <span v-if="s.running" class="ai-hist-rail__sep" aria-hidden="true" />
                </template>
                <span v-if="s.running">运行中</span>
              </div>
            </div>
            <DbConfirmBubble
              :ref="(el: unknown) => setDeleteBubble(s.id, el)"
              trigger="manual"
              content="删除后会话从列表移除，历史消息仍保留。"
              confirm-text="删除"
              danger
              @confirm="emit('delete', s)"
            >
              <SessionMoreMenu
                class="db-row__more ai-hist-rail__more"
                :items="moreItems(s)"
                aria-label="会话操作"
                @command="(cmd: string) => onMore(s, cmd)"
              />
            </DbConfirmBubble>
          </li>
        </ul>
      </section>
    </div>

    <!-- 栏底插槽（n8n 式用户区位）：宿主注入 WorkbenchUserBar，栏自身保持零业务依赖 -->
    <div v-if="$slots.footer" class="ai-hist-rail__footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 会话历史栏 —— 与 AiAssistantRail 平级的最左栏。
 *
 * 折叠态与宽度在 useAiSessionHistory（模块级单例），两个工作台共用同一份；
 * 本组件只消费状态、渲染列表：
 * - open   切换会话（宿主切桶并恢复历史）
 * - new    新建会话
 * - rename/pin/delete  会话操作（宿主调状态层接口）
 * - search 搜索关键字（空串=退出搜索）
 * 视图偏好（分组/列表）是纯前端偏好，就地存 localStorage，不惊动宿主。
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { ElMessageBox } from 'element-plus';
import DbConfirmBubble from '@/views/databus/components/DbConfirmBubble.vue';
import { usePersisted } from '../composables/usePersisted';
import type { AiSession, AiSessionGroup } from './ai.types';
import SessionMoreMenu from '../components/SessionMoreMenu.vue';
import StatusDot from '../../workspace/components/StatusDot.vue';

const props = withDefaults(
  defineProps<{
    /** 收起时整栏不渲染（宽度归零），开合由宿主 header 控制 */
    collapsed: boolean;
    width: number;
    /** 平铺会话列表（useAgentChat.sessionList），列表视图直接用 */
    sessions?: AiSession[];
    /** 按工作区分好组的会话（useAgentChat.sessionGroups），分组视图直接用 */
    groups?: AiSessionGroup[];
    /** 当前激活会话 id，用于高亮当前项 */
    activeId?: string;
  }>(),
  { sessions: () => [], groups: () => [], activeId: '' }
);

const emit = defineEmits<{
  /** 点了历史里的某条会话，宿主负责切换并载入上下文 */
  (e: 'open', session: AiSession): void;
  /** 点了「新建会话」，宿主负责建新会话并切过去 */
  (e: 'new'): void;
  /** 重命名，宿主调接口后刷新列表 */
  (e: 'rename', session: AiSession, title: string): void;
  /** 置顶 / 取消置顶 */
  (e: 'pin', session: AiSession, pinned: boolean): void;
  /** 删除（软删，历史消息保留） */
  (e: 'delete', session: AiSession): void;
  /** 搜索关键字，空串表示退出搜索 */
  (e: 'search', keyword: string): void;
}>();

/**
 * 全局快捷键 Ctrl+Alt+N 新建会话。
 * 不用 Ctrl+Shift+N：那是浏览器的无痕窗口快捷键，会被拦掉拿不到事件。
 * 栏收起时组件仍在，但此时不该响应，直接跳过。
 */
function onNewShortcut(event: KeyboardEvent) {
  if (props.collapsed || event.shiftKey || !event.ctrlKey || !event.altKey) {
    return;
  }
  if (event.key.toLowerCase() !== 'n') {
    return;
  }
  event.preventDefault();
  emit('new');
}

onMounted(() => window.addEventListener('keydown', onNewShortcut));
onUnmounted(() => window.removeEventListener('keydown', onNewShortcut));

/** 分组/列表视图偏好：同一浏览器记住上次选择 */
const view = usePersisted<'group' | 'list'>('databus.ai.history.view', 'group');

/** 分组折叠状态：按工作区分键记在同一份偏好里，切回来仍是上次的折叠形态 */
const collapsedGroups = usePersisted<Record<string, boolean>>('databus.ai.history.collapsed', {});

/** 列表视图没有分组头，永远展开 */
function isCollapsed(key: string) {
  return view.value === 'group' && Boolean(collapsedGroups.value[key]);
}

function toggleGroup(key: string) {
  collapsedGroups.value[key] = !collapsedGroups.value[key];
}

const searchOpen = ref(false);
const keyword = ref('');
const searchInputRef = ref<{ focus: () => void }>();
let searchTimer: ReturnType<typeof setTimeout> | undefined;

const displayGroups = computed<AiSessionGroup[]>(() => {
  if (view.value === 'list') {
    return [{ key: 'all', name: '', sessions: props.sessions }];
  }
  return props.groups;
});

function toggleSearch() {
  searchOpen.value = !searchOpen.value;
  if (searchOpen.value) {
    nextTick(() => searchInputRef.value?.focus());
    return;
  }
  keyword.value = '';
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  emit('search', '');
}

/** 输入即搜：250ms 防抖，避免每敲一个字都打后端 */
function onSearchInput() {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => emit('search', keyword.value.trim()), 250);
}

function toggleView() {
  view.value = view.value === 'group' ? 'list' : 'group';
}

/** 三点菜单项：置顶项文案随当前状态翻转，删除与其它项之间加分隔线 */
function moreItems(session: AiSession) {
  return [
    { command: 'rename', label: '重命名', icon: 'lucide:pencil', tone: 'primary' as const },
    {
      command: 'pin',
      label: session.pinned ? '取消置顶' : '置顶',
      icon: session.pinned ? 'lucide:pin-off' : 'lucide:pin'
    },
    { command: 'delete', label: '删除', icon: 'lucide:trash', tone: 'danger' as const, divided: true }
  ];
}

/** 每条会话的删除气泡实例：菜单命令触发后用 open() 把气泡挂在对应会话行上 */
const deleteBubbles = new Map<string, InstanceType<typeof DbConfirmBubble>>();

function setDeleteBubble(id: string, el: unknown) {
  if (el) {
    deleteBubbles.set(id, el as InstanceType<typeof DbConfirmBubble>);
  } else {
    deleteBubbles.delete(id);
  }
}

async function onMore(session: AiSession, command: string) {
  if (command === 'rename') {
    try {
      const { value } = await ElMessageBox.prompt('输入新的会话标题', '重命名会话', {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputValue: session.title,
        inputValidator: (v: string) => (v && v.trim() ? true : '标题不能为空')
      });
      emit('rename', session, value.trim());
    } catch {
      /* 用户取消 */
    }
    return;
  }
  if (command === 'pin') {
    emit('pin', session, !session.pinned);
    return;
  }
  if (command === 'delete') {
    // 下拉菜单点完即关，气泡改挂到该会话行的三点按钮上（箭头仍指向操作处）
    deleteBubbles.get(session.id)?.open();
  }
}
</script>

<style lang="scss" scoped>
.ai-hist-rail {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  /* 与工作台画布、输入井同色（--db-bg-sunken）：左栏无缝融进工作台，不再像一张独立灰卡 */
  background: var(--db-bg-sunken, #f4f4f5);
  /* 同心圆角：画布圆角 14px - 画布 8px 内衬 = 6px，左栏拐角与画布拐角同心，接缝不露 */
  border-radius: calc(var(--db-r-card) - 8px);
  /* 分区靠浮岛留白，不再画结构竖线 */

  /* 会话行正文统一色：标题 / 状态词 / 时间共用一个令牌，
     不随激活或 hover 变化，后续调色只改这一处 */
  --ai-hist-ink: var(--db-ink, #1c1c1e);

  /* 顶部新建：整行按钮，进门第一落点，不跟列表项抢视觉。
     左右 16px = body 的 8px + .db-list--compact 的 8px，与下方会话行同一条边线 */
  &__newbar {
    flex-shrink: 0;
    padding: 8px 16px 2px;
  }

  &__new {
    /* 整行按钮：文案靠左，快捷键提示贴右。
       常态就是会话行的「激活」底（输入框未激活灰）；hover 反馈与下方会话行同一套
       （.db-float 的上移 + 大阴影 + 顶边补光），底色不加深，保持统一色 */
    --db-lift: -1px;
    --db-zoom: 1;

    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    height: 30px;
    padding: 0 8px 0 10px;
    border: 0;
    border-radius: var(--db-r-control);
    background: var(--db-bg-hover, rgba(120, 120, 128, 0.08));
    color: var(--ai-hist-ink);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;

    &:hover,
    &:active {
      background: var(--db-bg-hover, rgba(120, 120, 128, 0.08));
    }

    /* 新建会话的加号与右侧文字同高，图标略放大一档更饱满 */
    :deep(.svg-icon) {
      font-size: 14px;
    }
  }

  /* 快捷键提示：贴按钮右侧，字号与字重都弱于主文案，不抢「新建会话」。
     常态隐藏，hover 按钮时才淡入，避免一直占位抢注意力 */
  &__kbd {
    margin-left: auto;
    flex-shrink: 0;
    font-family: inherit;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.2px;
    color: var(--el-text-color-placeholder);
    font-variant-numeric: tabular-nums;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  &__new:hover &__kbd,
  &__new:focus-visible &__kbd {
    opacity: 1;
  }

  /* 工具行：搜索框（展开时）+ 搜索 / 视图切换两个按钮，整体右对齐。
     左右 16px 与新建按钮、会话行同一条边线；34px 与各栏头同线 */
  &__head {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    flex-shrink: 0;
    height: 34px;
    padding: 0 16px;
  }

  /* 展开的搜索框占掉按钮左侧的剩余宽度：按钮不缩，输入框自己收窄 */
  &__search-input {
    flex: 1;
    min-width: 0;
    width: auto;

    :deep(.el-input__wrapper) {
      border-radius: var(--db-r-tag);
      /* 与新建按钮 / 会话行同一灰底，输入框未聚焦时不再另起一档浅色 */
      background: var(--db-bg-hover, rgba(120, 120, 128, 0.08));
      box-shadow: none;
    }

    :deep(.el-input__inner) {
      font-size: 12px;
    }
  }

  &__head-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: var(--db-r-tag);
    background: none;
    color: var(--db-ink-secondary);
    font-size: 14px;
    cursor: pointer;
    transition:
      background 0.2s,
      color 0.2s;

    /* 悬停 / 展开态都用输入框未激活的灰底，与新建按钮、会话行同一套反馈；
       只有「搜索已展开」这种持续态才额外染主色，纯 hover 不换字色 */
    &:hover,
    &.is-on {
      background: var(--db-bg-hover, rgba(120, 120, 128, 0.08));
    }

    &.is-on {
      color: var(--el-color-primary);
    }
  }

  /* 整栏高度都归列表 */
  &__body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    /* 左右 8px：行列表再叠加 .db-list--compact 的 8px 内部留白，
       与顶部「新建会话」按钮、分组头同为 16px 边线 */
    padding: 2px 8px 8px;
  }

  &__empty {
    margin: 10px 6px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--el-text-color-placeholder, #a8abb2);
  }

  &__group + &__group {
    margin-top: 6px;
  }

  /* 分组头：与物料管理分组标题同规格——13px / 600 / 20px 行高、悬停浅底 + 圆角，
     计数紧跟组名而不是浮到最右；不加分割线，组与组之间靠留白分隔。
     左右 8px = .db-list--compact 的留白，宽度与会话行对齐（上面窄下面宽会显得歪） */
  &__group-head {
    display: flex;
    align-items: center;
    gap: 4px;
    /* 按钮 width:auto 不撑满（表单控件按内容宽），显式扣掉左右 8px 外边距 */
    width: calc(100% - 16px);
    margin: 4px 8px 6px;
    padding: 3px 8px 3px 4px;
    border: 0;
    border-radius: var(--db-r-tag);
    background: transparent;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    line-height: 20px;
    color: var(--el-text-color-primary);
    text-align: left;
    cursor: pointer;
    transition: background-color var(--db-dur-fast) var(--db-ease);

    &:hover {
      background: var(--el-fill-color-lighter);
    }

    &:active {
      background: var(--el-fill-color-light);
    }

    &:focus-visible {
      outline: 2px solid var(--el-color-primary-light-5);
      outline-offset: 1px;
    }
  }

  &__group-chevron {
    flex-shrink: 0;
    font-size: 13px;
    color: var(--el-text-color-placeholder);
    transition:
      transform var(--db-dur-normal) var(--db-ease),
      color var(--db-dur-fast) var(--db-ease);
  }

  &__group-head:hover &__group-chevron {
    color: var(--el-text-color-secondary);
  }

  &__group-head.is-collapsed &__group-chevron {
    transform: rotate(-90deg);
  }

  &__group-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__group-count {
    flex-shrink: 0;
    margin-left: 4px;
    padding: 0 6px;
    border-radius: 8px;
    background: var(--el-fill-color, #f0f2f5);
    font-size: 11px;
    font-weight: 400;
    line-height: 16px;
    color: var(--el-text-color-secondary);
    font-variant-numeric: tabular-nums;
    vertical-align: 1px;
  }

  /* 行间不画分割线：界线交给行间距，整个列表更轻 */
  &__body :deep(.db-row) {
    border: 0;
    /* 比紧凑基元的 12px 上下留白再放 2px，两行文字（标题 + 时间·状态）不显挤 */
    padding: 14px 10px;
  }

  /* 行间距 2px：行间不画线，界线交给留白 */
  &__body :deep(.db-row + .db-row) {
    margin-top: 2px;
  }

  /* 选中 = 白色卡片浮在画布色侧栏上；不做任何竖条/边框。
     卡片只有 4% 的一层浅投影 + 圆角，和 hover 的「半透明白」拉开层级 */
  &__body :deep(.db-row.is-active) {
    background-color: var(--db-surface);
    border-radius: var(--db-r-control);
    box-shadow: var(--db-shadow-xs);
  }

  /* hover 只留半透明白底与圆角：不位移、不投影、不画上下线 */
  &__body :deep(.db-row.db-float:hover) {
    background-color: color-mix(in srgb, var(--db-surface) 55%, transparent);
    border: 0;
    border-radius: var(--db-r-control);
    outline: none;
    box-shadow: none;
    transform: none;
  }

  /* 悬停选中行时保持白卡（hover 规则特异性更高，需显式补回） */
  &__body :deep(.db-row.is-active.db-float:hover) {
    background-color: var(--db-surface);
    box-shadow: var(--db-shadow-xs);
  }

  /* 首行给右上角三点让位：预留一整段呼吸空间，标题与三点不贴着（不做渐变遮罩） */
  &__title-line {
    padding-right: 60px;
  }

  /* 标题用正文色、常规字重：蓝标题 + 600 会把会话名抬成按钮，和聊天正文对不上 */
  &__title-line .db-row__name {
    font-weight: 400;
    color: var(--ai-hist-ink);
  }

  /* 次行：时间 · 状态同一条水平线；左内缩 = 圆点 8px + 行内 gap 8px，与标题文字左对齐 */
  &__state {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    padding-left: 16px;
    font-size: 12px;
    line-height: 16px;
    color: var(--ai-hist-ink);
    white-space: nowrap;
  }

  &__time {
    color: var(--ai-hist-ink);
    font-variant-numeric: tabular-nums;
  }

  /* 分隔圆点：用实心圆而不是「·」字符，字号再小也能保持可见的直径 */
  &__sep {
    flex-shrink: 0;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--el-text-color-placeholder, #a8abb2);
  }

  &__pin {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--el-color-primary);
  }

  /* 右上角三点在窄栏里用 22px 紧凑按钮；定位与显隐由 .db-row__more 统一提供。
     top 对齐标题行中线（行内上内边距 14px + 标题行高 19.5px 的中心），不是贴近行顶。 */
  &__more {
    top: 13px;
  }

  &__more :deep(.el-button) {
    width: 22px;
    height: 22px;
    min-height: 22px;
    padding: 0;
    margin: 0;
  }

  /* 栏底用户区：不加顶边线，靠列表自身留白分隔 */
  &__footer {
    flex-shrink: 0;
    padding: 6px;
  }
}


</style>