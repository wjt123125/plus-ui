<template>
  <div class="cmp-palette">
    <div class="cmp-palette__header">
      <el-tooltip content="收起物料区" placement="top" :show-after="300">
        <button type="button" class="cmp-palette__fold" @click="emit('collapse')">
          <el-icon><Fold /></el-icon>
        </button>
      </el-tooltip>
      <el-input
        v-model="keyword"
        class="cmp-palette__search"
        placeholder="搜索组件"
        clearable
        size="small"
        :prefix-icon="Search"
      />
    </div>

    <template v-if="isSearching">
      <div class="cmp-palette__grid">
        <el-tooltip
          v-for="def in searchResults"
          :key="def.type"
          :content="`${def.label}（${def.type}）`"
          placement="right"
          :show-after="400"
        >
          <div
            class="cmp-palette__item"
            :class="{ 'is-virtual': def.virtual }"
            draggable="true"
            @dragstart="onDragStart($event, def.type)"
          >
            <span class="cmp-palette__icon" :style="{ backgroundColor: def.color }">
              <SvgIcon :icon-class="def.icon" />
            </span>
            <span class="cmp-palette__label">{{ def.short ?? def.label }}</span>
          </div>
        </el-tooltip>
      </div>
      <div v-if="searchResults.length === 0" class="cmp-palette__empty">无匹配组件</div>
    </template>

    <template v-else>
      <el-tabs v-model="activeTab" class="cmp-palette__tabs">
        <el-tab-pane label="编排算子" name="operator">
          <div v-for="group in operatorGroups" :key="group.key" class="cmp-palette__group">
            <div class="cmp-palette__group-title">
              <span class="cmp-palette__dot" :style="{ backgroundColor: group.color }" />
              <span>{{ group.label }}</span>
            </div>
            <div class="cmp-palette__grid">
              <el-tooltip
                v-for="def in group.defs"
                :key="def.type"
                :content="`${def.label}（${def.type}）`"
                placement="right"
                :show-after="400"
              >
                <div
                  class="cmp-palette__item"
                  :class="{ 'is-virtual': def.virtual }"
                  draggable="true"
                  @dragstart="onDragStart($event, def.type)"
                >
                  <span class="cmp-palette__icon" :style="{ backgroundColor: def.color }">
                    <SvgIcon :icon-class="def.icon" />
                  </span>
                  <span class="cmp-palette__label">{{ def.short ?? def.label }}</span>
                </div>
              </el-tooltip>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="业务组件" name="business">
          <div class="cmp-palette__grid">
            <el-tooltip
              v-for="def in businessDefs"
              :key="def.type"
              :content="`${def.label}（${def.type}）`"
              placement="right"
              :show-after="400"
            >
              <div
                class="cmp-palette__item"
                draggable="true"
                @dragstart="onDragStart($event, def.type)"
              >
                <span class="cmp-palette__icon" :style="{ backgroundColor: def.color }">
                  <SvgIcon :icon-class="def.icon" />
                </span>
                <span class="cmp-palette__label">{{ def.short ?? def.label }}</span>
              </div>
            </el-tooltip>
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Fold, Search } from '@element-plus/icons-vue';
import { CMP_DEFS, DND_MIME, PALETTE_GROUPS } from '../cmp-defs';

const emit = defineEmits<{
  (e: 'collapse'): void;
}>();

const keyword = ref('');
const isSearching = computed(() => keyword.value.trim().length > 0);

/** 所有已注册组件（含 virtual 系统节点 start/end，允许用户手动从物料区拖入） */
const realDefs = CMP_DEFS;

/** Tab 态：算子页按分组平铺（组头不可折叠） */
const operatorGroups = computed(() =>
  PALETTE_GROUPS.filter((g) => g.key !== 'business')
    .map((g) => ({ ...g, defs: realDefs.filter((d) => d.group === g.key) }))
    .filter((g) => g.defs.length > 0)
);

const businessDefs = computed(() => realDefs.filter((d) => d.group === 'business'));

/** 搜索态：无视 Tab 全局平铺命中结果 */
const searchResults = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return realDefs.filter((d) =>
    [d.label, d.short, d.desc, d.type].some((s) => s?.toLowerCase().includes(kw))
  );
});

const activeTab = ref<'operator' | 'business'>('operator');

function onDragStart(event: DragEvent, type: string) {
  if (!event.dataTransfer) {
    return;
  }
  event.dataTransfer.setData(DND_MIME, type);
  event.dataTransfer.effectAllowed = 'copy';
}
</script>

<style scoped>
.cmp-palette {
  padding: 10px 8px 14px;
}

.cmp-palette__header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

.cmp-palette__search {
  flex: 1;
  min-width: 0;
}

.cmp-palette__fold {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  background-color: transparent;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  transition: color 0.15s, border-color 0.15s;
}

.cmp-palette__fold:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
}

/* 页签紧凑化：12px 字号、30px 高、细底线，贴面板密度 */
.cmp-palette__tabs :deep(.el-tabs__header) {
  margin-bottom: 10px;
}

.cmp-palette__tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
}

.cmp-palette__tabs :deep(.el-tabs__item) {
  height: 30px;
  padding: 0 10px;
  font-size: 12px;
  line-height: 30px;
}

.cmp-palette__group {
  margin-bottom: 10px;
}

/* 组色点 + 标题 + 延伸分隔线，平铺不可折叠 */
.cmp-palette__group-title {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  user-select: none;
}

.cmp-palette__group-title::after {
  content: '';
  flex: 1;
  height: 1px;
  background-color: var(--el-border-color-lighter);
}

.cmp-palette__dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

/* 双列紧凑格：20px 图标 + 短标签单行 */
.cmp-palette__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.cmp-palette__item {
  display: flex;
  align-items: center;
  padding: 5px 6px;
  cursor: grab;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.cmp-palette__item:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 8px rgb(0 0 0 / 8%);
}

.cmp-palette__item:active {
  cursor: grabbing;
}

.cmp-palette__item.is-virtual {
  background-color: var(--el-fill-color-light);
  border-style: dashed;
}

.cmp-palette__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin-right: 6px;
  color: #fff;
  font-size: 12px;
  border-radius: 4px;
}

.cmp-palette__label {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  color: var(--el-text-color-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cmp-palette__empty {
  padding: 16px 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
}
</style>
