<!--
  领域通用控件：组件选择面板（画布 prepend / append / replace / insertEdge 四场景共用）。

  与 ChainSelect 同构的纯组件：props 进、emits 出，不依赖 useCanvasController——
  推荐数据直接由纯函数 getRecommendations(mode, anchorDefType, excludedTypes) 计算，
  调用方（当前是 CmpPickerPopover 薄外壳）只负责在哪弹、弹完拿 defType 干什么。

  交互（n8n / Dify 范式）：
  - 打开即聚焦搜索框；搜索态跨分类平铺命中（与左侧 CmpPalette 搜索行为一致）；
  - 非搜索态：推荐区（按 recommendCutoff 取前 6，3 列×2 行，无角标）+ el-tabs（编排算子/业务组件，
    默认 tab 跟锚点：锚点是算子默认算子页，其余默认业务页），算子页内按 PALETTE_GROUPS 分段，
    业务页内按 bizCategory / lfNodeType 分 BPM 平台、通用组件、条件组件三段；
  - 定宽 380、max-height 440，结果区独立滚动，tab 头 sticky；
  - 键盘：↑↓ 在「推荐 + 当前 tab」扁平序列上移动高亮，回车选中，Esc 关闭。
-->
<template>
  <div class="cmp-picker-panel" @keydown="onKeydown">
    <div class="cmp-picker-panel__header">
      <span class="cmp-picker-panel__title">{{ modeLabel[mode] }}</span>
      <button type="button" class="cmp-picker-panel__close" @click="emit('close')">
        <el-icon><Close /></el-icon>
      </button>
    </div>

    <div class="cmp-picker-panel__search">
      <el-input
        ref="searchRef"
        v-model="keyword"
        size="small"
        placeholder="搜索组件"
        clearable
        :prefix-icon="Search"
      />
    </div>

    <div ref="bodyRef" class="cmp-picker-panel__body">
      <!-- 搜索态：跨分类平铺，隐藏推荐与 tab -->
      <template v-if="isSearching">
        <div v-if="searchSection.items.length > 0" class="cmp-picker-panel__grid">
          <CmpPickerCard
            v-for="item in searchSection.items"
            :key="item.def.type"
            :def="item.def"
            :index="item.index"
            :score="scoreOf(item.def.type)"
            :active="item.index === activeIndex"
            @pick="emit('pick', item.def.type)"
            @hover="activeIndex = item.index"
          />
        </div>
        <div v-else class="cmp-picker-panel__empty">无匹配组件</div>
      </template>

      <template v-else>
        <!-- 推荐区：达 recommendCutoff 的前 6 -->
        <section v-if="recommendSection.items.length > 0" class="cmp-picker-panel__section">
          <div class="cmp-picker-panel__section-label is-recommend">推荐</div>
          <div class="cmp-picker-panel__grid">
            <CmpPickerCard
              v-for="item in recommendSection.items"
              :key="`rec-${item.def.type}`"
              :def="item.def"
              :index="item.index"
              :score="scoreOf(item.def.type)"
              recommended
              :active="item.index === activeIndex"
              @pick="emit('pick', item.def.type)"
              @hover="activeIndex = item.index"
            />
          </div>
        </section>

        <el-tabs v-model="activeTab" class="cmp-picker-panel__tabs">
          <el-tab-pane label="编排算子" name="operator">
            <section
              v-for="sec in operatorSections"
              :key="sec.key"
              class="cmp-picker-panel__section"
            >
              <div class="cmp-picker-panel__section-label">
                <span class="cmp-picker-panel__dot" :style="{ backgroundColor: sec.color }" />
                {{ sec.label }}
              </div>
              <div class="cmp-picker-panel__grid">
                <CmpPickerCard
                  v-for="item in sec.items"
                  :key="item.def.type"
                  :def="item.def"
                  :index="item.index"
                  :score="scoreOf(item.def.type)"
                  :active="item.index === activeIndex"
                  @pick="emit('pick', item.def.type)"
                  @hover="activeIndex = item.index"
                />
              </div>
            </section>
          </el-tab-pane>
          <el-tab-pane label="业务组件" name="business">
            <section
              v-for="sec in businessSections"
              :key="sec.key"
              class="cmp-picker-panel__section"
            >
              <div class="cmp-picker-panel__section-label">
                <span class="cmp-picker-panel__dot" :style="{ backgroundColor: sec.color }" />
                {{ sec.label }}
              </div>
              <div class="cmp-picker-panel__grid">
                <CmpPickerCard
                  v-for="item in sec.items"
                  :key="item.def.type"
                  :def="item.def"
                  :index="item.index"
                  :score="scoreOf(item.def.type)"
                  :active="item.index === activeIndex"
                  @pick="emit('pick', item.def.type)"
                  @hover="activeIndex = item.index"
                />
              </div>
            </section>
          </el-tab-pane>
        </el-tabs>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { Close, Search } from '@element-plus/icons-vue';
import { PALETTE_GROUPS, getDef, type CmpDef } from '../../cmp-defs';
import type { PickerMode } from '../../composables/useCanvasController';
import { useCmpRecommend } from '../../composables/useCmpRecommend';
import CmpPickerCard from './CmpPickerCard.vue';

defineOptions({ name: 'CmpPickerPanel' });

const props = withDefaults(
  defineProps<{
    mode: PickerMode;
    /** 锚点组件类型（def.type），推荐引擎据此打分；无锚点传 null */
    anchorDefType?: string | null;
    /** 需排除的类型（已存在的 singleton、replace 时的自身） */
    excludedTypes?: string[];
  }>(),
  {
    anchorDefType: null,
    excludedTypes: () => []
  }
);

const emit = defineEmits<{
  (e: 'pick', defType: string): void;
  (e: 'close'): void;
}>();

/** 模式中文名，用于标题（与旧弹层一致） */
const modeLabel: Record<PickerMode, string> = {
  prepend: '上方插入',
  append: '下方插入',
  replace: '替换节点',
  insertEdge: '线上插入'
};

/** 推荐区最多露 6 个；入选门槛由融合层按远程在线状态给（recommendCutoff） */
const RECOMMEND_TOP_N = 6;

// 推荐三路融合：本地结构规则（兜底全集）+ 后端种子/真账（覆盖排序）+ 个人频次（微调）
const { scoredAll, recommendCutoff } = useCmpRecommend(
  () => props.mode,
  () => props.anchorDefType,
  () => props.excludedTypes
);
const allDefs = computed(() => scoredAll.value.map((s) => s.def));

/** type → 融合分，供卡片 dev 调参露出 */
const scoreByType = computed(() =>
  Object.fromEntries(scoredAll.value.map((s) => [s.def.type, s.score]))
);
const scoreOf = (type: string) => scoreByType.value[type];

// ── 搜索 ────────────────────────────────────────────────────────────────
const keyword = ref('');
const isSearching = computed(() => keyword.value.trim().length > 0);
const searchResults = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return allDefs.value.filter((d) =>
    [d.label, d.short, d.desc, d.type].some((s) => s?.toLowerCase().includes(kw))
  );
});

// ── Tab：默认页跟锚点走（锚点是算子 → 算子页，其余 → 业务页） ───────────
const anchorDef = computed(() =>
  props.anchorDefType ? getDef(props.anchorDefType) : undefined
);
const activeTab = ref<'operator' | 'business'>(anchorDef.value?.operator ? 'operator' : 'business');

// ── 非搜索态分组（顺序与 PALETTE_GROUPS / CmpPalette 一致） ──────────────
const recommendedDefs = computed(() =>
  scoredAll.value
    .filter((s) => s.score >= recommendCutoff.value)
    .slice(0, RECOMMEND_TOP_N)
    .map((s) => s.def)
);

const operatorGroups = computed(() =>
  PALETTE_GROUPS.filter((g) => g.key !== 'business' && g.key !== 'flow')
    .map((g) => ({ ...g, defs: allDefs.value.filter((d) => d.group === g.key) }))
    .filter((g) => g.defs.length > 0)
);

/**
 * 业务页分段（依据物料自带元数据，不靠 label 猜）：
 * - 条件槽件（lfNodeType=NodeBoolean/For/Iterator/Switch）单列末段：它们是算子配件，
 *   与普通业务叶子混排会误导（推荐引擎同样对其降权）；
 * - bizCategory：bpm=BPM 平台集成，common=通用加工；未声明的新叶子兜底进通用段。
 */
const BUSINESS_SECTION_META = [
  { key: 'bpm', label: 'BPM 平台', color: '#7c3aed', match: (d: CmpDef) => d.bizCategory === 'bpm' },
  { key: 'common', label: '通用组件', color: '#67c23a', match: (d: CmpDef) => d.bizCategory !== 'bpm' },
  {
    key: 'slot',
    label: '条件组件',
    color: '#e6a23c',
    match: (d: CmpDef) => !!d.lfNodeType && d.lfNodeType !== 'NodeComponent'
  }
] as const;

const businessGroups = computed(() =>
  BUSINESS_SECTION_META.map((m) => ({
    ...m,
    defs: allDefs.value.filter((d) => d.group === 'business' && m.match(d))
  })).filter((g) => g.defs.length > 0)
);

/** 渲染模型：卡片携带扁平序列下标，推荐区与 tab 内的同类型卡片高亮互不串 */
interface IndexedItem {
  def: CmpDef;
  index: number;
}
interface IndexedSection {
  key: string;
  label: string | null;
  color?: string;
  items: IndexedItem[];
}

const recommendSection = computed<IndexedSection>(() => ({
  key: 'recommend',
  label: '推荐',
  items: recommendedDefs.value.map((def, index) => ({ def, index }))
}));

/** 算子页：各分组扁平下标从推荐区之后顺延 */
const operatorSections = computed<IndexedSection[]>(() => {
  let offset = recommendedDefs.value.length;
  return operatorGroups.value.map((g) => {
    const items = g.defs.map((def) => ({ def, index: offset++ }));
    return { key: g.key, label: g.label, color: g.color, items };
  });
});

/** 业务页：三段，扁平下标同样接在推荐区之后 */
const businessSections = computed<IndexedSection[]>(() => {
  let offset = recommendedDefs.value.length;
  return businessGroups.value.map((g) => {
    const items = g.defs.map((def) => ({ def, index: offset++ }));
    return { key: g.key, label: g.label, color: g.color, items };
  });
});

const searchSection = computed<IndexedSection>(() => ({
  key: 'search',
  label: null,
  items: searchResults.value.map((def, index) => ({ def, index }))
}));

/** 当前可见的扁平序列（键盘 ↑↓ / 回车的数据源） */
const visibleDefs = computed<CmpDef[]>(() => {
  if (isSearching.value) return searchResults.value;
  const tabSections =
    activeTab.value === 'operator' ? operatorSections.value : businessSections.value;
  const tabItems = tabSections.flatMap((s) => s.items.map((i) => i.def));
  return [...recommendedDefs.value, ...tabItems];
});

// ── 键盘交互 ─────────────────────────────────────────────────────────────
const activeIndex = ref(0);
const bodyRef = ref<HTMLElement>();
const searchRef = ref<{ focus: () => void }>();

watch([keyword, activeTab], () => {
  activeIndex.value = 0;
});

watch(activeIndex, async (i) => {
  await nextTick();
  bodyRef.value
    ?.querySelector(`[data-index="${i}"]`)
    ?.scrollIntoView({ block: 'nearest' });
});

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
    return;
  }
  const total = visibleDefs.value.length;
  if (total === 0) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    activeIndex.value = (activeIndex.value + 1) % total;
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeIndex.value = (activeIndex.value - 1 + total) % total;
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const def = visibleDefs.value[activeIndex.value];
    if (def) emit('pick', def.type);
  }
}

onMounted(() => searchRef.value?.focus());
</script>

<style scoped>
.cmp-picker-panel {
  display: flex;
  flex-direction: column;
  width: 380px;
  max-height: 440px;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  box-shadow: 0 6px 24px rgb(0 0 0 / 14%);
}

.cmp-picker-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 0;
}

.cmp-picker-panel__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.cmp-picker-panel__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  color: var(--el-text-color-placeholder);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 4px;
  transition: color 0.15s, background-color 0.15s;
}

.cmp-picker-panel__close:hover {
  color: var(--el-text-color-primary);
  background-color: var(--el-fill-color-light);
}

.cmp-picker-panel__search {
  padding: 8px 12px;
}

/* 结果区：唯一滚动容器，6px 细滚动条（对齐 liteflow-editor contextPad） */
.cmp-picker-panel__body {
  flex: 1;
  min-height: 0;
  padding: 0 12px 10px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.cmp-picker-panel__body::-webkit-scrollbar {
  width: 6px;
}

.cmp-picker-panel__body::-webkit-scrollbar-thumb {
  background-color: rgb(0 0 0 / 20%);
  border-radius: 3px;
}

.cmp-picker-panel__body::-webkit-scrollbar-track {
  background: transparent;
}

.cmp-picker-panel__section {
  margin-bottom: 8px;
}

.cmp-picker-panel__section-label {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 4px 0 6px;
  font-size: 11px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  user-select: none;
}

.cmp-picker-panel__section-label.is-recommend {
  font-weight: 600;
  color: var(--el-color-primary);
}

/* 暗色下默认主色蓝压在深底上对比度不足，标题提亮 */
html.dark .cmp-picker-panel__section-label.is-recommend {
  color: #60a5fa;
}

.cmp-picker-panel__dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.cmp-picker-panel__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.cmp-picker-panel__empty {
  padding: 16px 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
}

/* tab 头贴顶：长列表滚动时页签不消失，卡片从其下方穿过需底色遮挡。
   底边距 + 首段上间距共同给第一排卡片骑框角标（向上凸出 5px）留净空，
   否则角标贴住分隔线、滚动瞬间被 sticky 不透光头裁掉 */
.cmp-picker-panel__tabs :deep(.el-tabs__header) {
  position: sticky;
  top: 0;
  z-index: 1;
  margin: 2px 0 10px;
  background-color: var(--el-bg-color);
}

.cmp-picker-panel__tabs :deep(.el-tab-pane) > .cmp-picker-panel__section:first-child {
  margin-top: 4px;
}

.cmp-picker-panel__tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
}

.cmp-picker-panel__tabs :deep(.el-tabs__item) {
  height: 30px;
  padding: 0 10px;
  font-size: 12px;
  line-height: 30px;
}
</style>
