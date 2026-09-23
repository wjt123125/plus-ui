<!--
  链路切换器 — 编辑器工具栏标题位置，点击展开面板切换链路。
  面板功能：
    - 顶部搜索框（按 chainName/chainCode 模糊匹配）+ 搜索历史（localStorage 持久化）
    - Tab：最近使用 / 全部 / 草稿 / 已发布 / 已下线
    - 列表项：状态圆点 + 链路名 + chainCode + 更新时间
    - 点击列表项 emit('select', row)，由父组件执行 loadChainToEditor
  最近使用：localStorage 存最近 5 条链路 id，切到「最近使用」tab 时从全量列表中过滤。
  数据源复用 listChain 接口，不新增接口。
-->
<template>
  <el-popover
    v-model:visible="popoverVisible"
    placement="bottom-start"
    :width="420"
    trigger="click"
    popper-class="chain-switcher__popper"
    @show="onShow"
  >
    <template #reference>
      <button type="button" class="chain-switcher__trigger" :title="currentName || '选择链路'">
        <el-icon class="chain-switcher__caret"><CaretBottom /></el-icon>
        <span class="chain-switcher__name">{{ currentName || '选择链路' }}</span>
      </button>
    </template>

    <div class="chain-switcher">
      <!-- 搜索框 + 搜索历史 -->
      <div class="chain-switcher__search">
        <el-input
          v-model="keyword"
          placeholder="搜索链路名称 / 编码"
          clearable
          :prefix-icon="Search"
          @keyup.enter="doSearch"
          @clear="doSearch"
        >
          <template #append>
            <el-button @click="doSearch">搜索</el-button>
          </template>
        </el-input>
      </div>

      <div v-if="searchHistory.length > 0" class="chain-switcher__history">
        <span class="chain-switcher__history-label">搜索历史</span>
        <el-tag
          v-for="(h, idx) in searchHistory"
          :key="idx"
          size="small"
          effect="plain"
          class="chain-switcher__history-tag"
          @click="applyHistory(h)"
        >
          {{ h }}
        </el-tag>
        <el-button text size="small" class="chain-switcher__history-clear" @click="clearHistory">清空</el-button>
      </div>

      <!-- Tab 切换 -->
      <el-tabs v-model="activeTab" class="chain-switcher__tabs" @tab-change="onTabChange">
        <el-tab-pane label="最近使用" name="recent" />
        <el-tab-pane label="全部" name="all" />
        <el-tab-pane label="草稿" name="draft" />
        <el-tab-pane label="已发布" name="published" />
        <el-tab-pane label="已下线" name="offline" />
      </el-tabs>

      <!-- 列表 -->
      <div v-loading="loading" class="chain-switcher__list">
        <template v-if="displayList.length > 0">
          <div
            v-for="row in displayList"
            :key="row.id"
            class="chain-switcher__item"
            :class="{ 'is-active': String(row.id) === String(currentId) }"
            @click="selectChain(row)"
          >
            <span class="chain-switcher__status-dot" :class="dotClass(row.status)" />
            <div class="chain-switcher__item-main">
              <div class="chain-switcher__item-name">{{ row.chainName }}</div>
              <div class="chain-switcher__item-code">#{{ row.chainCode }}</div>
            </div>
            <div class="chain-switcher__item-time">{{ formatTime(row.updateTime) }}</div>
          </div>
        </template>
        <el-empty v-else description="暂无链路" :image-size="60" />
      </div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { CaretBottom, Search } from '@element-plus/icons-vue';
import { listChain } from '@/api/databus/chain';
import type { DatabusChainVo } from '@/api/databus/chain/types';

const STATUS_DRAFT = '0';
const STATUS_PUBLISHED = '1';
const STATUS_OFFLINE = '2';

const RECENT_KEY = 'databus.editor.recentChains';
const HISTORY_KEY = 'databus.editor.searchHistory';
const RECENT_LIMIT = 5;
const HISTORY_LIMIT = 8;

const props = defineProps<{
  currentId?: number | string | null;
  currentName?: string;
}>();

const emit = defineEmits<{
  (e: 'select', row: DatabusChainVo): void;
}>();

const popoverVisible = ref(false);
const loading = ref(false);
const keyword = ref('');
const activeTab = ref<'recent' | 'all' | 'draft' | 'published' | 'offline'>('recent');
const allChains = ref<DatabusChainVo[]>([]);
const searchHistory = ref<string[]>(loadHistory());

/** 最近使用 id 列表（localStorage） */
const recentIds = computed<string[]>(() => {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
});

const displayList = computed<DatabusChainVo[]>(() => {
  let list = allChains.value;
  if (activeTab.value === 'recent') {
    const ids = recentIds.value;
    list = list.filter((c) => ids.includes(String(c.id)));
    // 按最近使用顺序排序（已展开复制，不修改原数组）
    // oxlint-disable-next-line unicorn/no-array-sort
    list = [...list].sort((a, b) => ids.indexOf(String(a.id)) - ids.indexOf(String(b.id)));
  } else if (activeTab.value === 'draft') {
    list = list.filter((c) => c.status === STATUS_DRAFT);
  } else if (activeTab.value === 'published') {
    list = list.filter((c) => c.status === STATUS_PUBLISHED);
  } else if (activeTab.value === 'offline') {
    list = list.filter((c) => c.status === STATUS_OFFLINE);
  }
  if (keyword.value.trim()) {
    const kw = keyword.value.trim().toLowerCase();
    list = list.filter(
      (c) =>
        c.chainName.toLowerCase().includes(kw) ||
        (c.chainCode || '').toLowerCase().includes(kw)
    );
  }
  return list;
});

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: string[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_LIMIT)));
}

function pushHistory(kw: string) {
  const trimmed = kw.trim();
  if (!trimmed) return;
  const next = [trimmed, ...searchHistory.value.filter((h) => h !== trimmed)].slice(0, HISTORY_LIMIT);
  searchHistory.value = next;
  saveHistory(next);
}

function clearHistory() {
  searchHistory.value = [];
  localStorage.removeItem(HISTORY_KEY);
}

function applyHistory(kw: string) {
  keyword.value = kw;
  doSearch();
}

function doSearch() {
  if (keyword.value.trim()) {
    pushHistory(keyword.value);
  }
}

function onTabChange() {
  // 切换 tab 不清空搜索词，允许叠加筛选
}

async function loadChains() {
  loading.value = true;
  try {
    const res = await listChain({ pageNum: 1, pageSize: 1000 });
    allChains.value = res.data?.rows ?? [];
  } finally {
    loading.value = false;
  }
}

function onShow() {
  loadChains();
}

function selectChain(row: DatabusChainVo) {
  // 写入最近使用
  const ids = recentIds.value.filter((id) => id !== String(row.id));
  ids.unshift(String(row.id));
  localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, RECENT_LIMIT)));
  popoverVisible.value = false;
  emit('select', row);
}

function dotClass(status?: string) {
  if (status === STATUS_PUBLISHED) return 'status-online';
  if (status === STATUS_DRAFT) return 'status-draft';
  return 'status-offline';
}

function formatTime(t?: string) {
  return t ? t.replace('T', ' ').slice(0, 16) : '';
}
</script>

<style lang="scss" scoped>
.chain-switcher__trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-primary);
  font-size: 12px;
  font-weight: 400;
  cursor: pointer;
  transition: all 0.2s ease;
  flex: 1;
  min-width: 0;

  &:hover {
    border-color: var(--el-border-color, #e8eaec);
    background: var(--el-fill-color-light, #f5f7fa);
  }
}

.chain-switcher__caret {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  transition: transform 0.2s ease;
}

.chain-switcher__name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chain-switcher {
  display: flex;
  flex-direction: column;
  max-height: 70vh;
}

.chain-switcher__search {
  padding-bottom: 8px;
}

.chain-switcher__history {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding-bottom: 8px;
}

.chain-switcher__history-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.chain-switcher__history-tag {
  cursor: pointer;
}

.chain-switcher__history-clear {
  margin-left: auto;
}

.chain-switcher__tabs {
  :deep(.el-tabs__header) {
    margin: 0;
  }
  :deep(.el-tabs__nav-wrap::after) {
    height: 1px;
  }
  :deep(.el-tabs__item) {
    height: 30px;
    padding: 0 10px;
    font-size: 12px;
    line-height: 30px;
  }
}

.chain-switcher__list {
  flex: 1;
  overflow-y: auto;
  min-height: 120px;
}

.chain-switcher__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: var(--el-fill-color-light, #f5f7fa);
  }

  &.is-active {
    background: rgba(var(--el-color-primary-rgb, 22, 104, 220), 0.08);

    .chain-switcher__item-name {
      color: var(--el-color-primary);
    }
  }
}

.chain-switcher__status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;

  &.status-online {
    background: var(--el-color-success, #10b981);
  }
  &.status-draft {
    background: var(--el-color-warning, #f59e0b);
  }
  &.status-offline {
    background: var(--el-color-info, #9ca3af);
  }
}

.chain-switcher__item-main {
  flex: 1;
  min-width: 0;
}

.chain-switcher__item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chain-switcher__item-code {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: 'JetBrains Mono', Consolas, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chain-switcher__item-time {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}
</style>
