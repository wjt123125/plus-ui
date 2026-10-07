<template>
  <div class="page-container">
    <div class="page-inner">
      <!-- 顶部标题栏 -->
      <div class="page-header">
        <div class="page-title-wrap">
          <h2 class="page-title">组件管理</h2>
          <p class="page-subtitle">
            共 {{ rows.length }} 个组件（内置 {{ builtinCount }} · 治理覆盖 {{ overlayCount }} · 库存脚本件
            {{ customCount }}）。库存件逻辑存 DB、保存即热更，治理覆盖只改外观契约仍取内置。
          </p>
        </div>
        <button
          v-hasPermi="['databus:component:add']"
          class="add-btn"
          @click="handleAdd"
        >
          <el-icon><Plus /></el-icon>
          <span>新增自定义组件</span>
        </button>
      </div>

      <!-- 搜索框 -->
      <div class="search-form">
        <div class="search-input-wrapper">
          <el-icon class="search-input-icon"><Search /></el-icon>
          <el-input
            v-model="keyword"
            class="search-input"
            placeholder="搜索名称 / 短名 / 编码 / 标签 / 描述..."
            clearable
          />
        </div>
      </div>

      <!-- 来源 + 分组筛选 -->
      <div class="filter-bar">
        <div class="filter-tabs">
          <button class="filter-tab" :class="{ active: !sourceFilter }" @click="sourceFilter = ''">
            全部来源
          </button>
          <button
            class="filter-tab"
            :class="{ active: sourceFilter === 'SYSTEM' }"
            @click="sourceFilter = 'SYSTEM'"
          >
            内置
          </button>
          <button
            class="filter-tab"
            :class="{ active: sourceFilter === 'OVERLAY' }"
            @click="sourceFilter = 'OVERLAY'"
          >
            治理覆盖
          </button>
          <button
            class="filter-tab"
            :class="{ active: sourceFilter === 'CUSTOM' }"
            @click="sourceFilter = 'CUSTOM'"
          >
            库存脚本件
          </button>
        </div>
        <div class="filter-divider" />
        <div class="filter-tabs">
          <button class="filter-tab" :class="{ active: !groupFilter }" @click="groupFilter = ''">
            全部分组
          </button>
          <button
            v-for="g in groupOptions"
            :key="g.key"
            class="filter-tab"
            :class="{ active: groupFilter === g.key }"
            @click="groupFilter = g.key"
          >
            {{ g.label }}
          </button>
        </div>
      </div>

      <!-- 库存脚本件启动期注册失败警示条 -->
      <el-alert
        v-if="unhealthy.length"
        type="error"
        :closable="false"
        show-icon
        class="health-banner"
      >
        <template #title>
          <span>{{ unhealthy.length }} 个库存脚本件启动期编译/注册失败，相关链路执行将报错：</span>
        </template>
        <div class="health-banner__list">
          <div v-for="h in unhealthy" :key="h.componentId" class="health-banner__item">
            <el-tag size="small" type="danger" effect="dark">{{ h.componentCode }}</el-tag>
            <span class="health-banner__msg">{{ h.error }}</span>
          </div>
        </div>
      </el-alert>

      <!-- 卡片网格 -->
      <div v-loading="loading" class="card-grid">
        <div
          v-for="row in filteredRows"
          :key="row.source + ':' + row.code"
          class="mt-card"
          :class="{ 'mt-card--off': row.db && row.disabled }"
          @click="openDetail(row)"
        >
          <div class="mt-card-head">
            <div class="mt-icon" :style="iconTileStyle(row)">
              <SvgIcon v-if="row.icon" :icon-class="row.icon" />
              <el-icon v-else><Box /></el-icon>
            </div>
            <div class="mt-title-area">
              <div class="mt-title">{{ row.name }}</div>
              <div class="mt-component">
                <span class="mt-component-id">{{ row.code }}</span>
                <button class="copy-id-btn" title="复制组件编码" @click.stop="copyCode(row)">
                  <el-icon><CopyDocument /></el-icon>
                </button>
              </div>
            </div>
            <div v-if="row.db" class="mt-switch-wrap" @click.stop>
              <el-tooltip :content="row.disabled ? '已停用' : '已启用'" placement="top" :show-after="200">
                <span class="status-dot" :class="dotClass(row)" />
              </el-tooltip>
              <el-switch
                :model-value="row.db.status === '0'"
                size="small"
                :loading="togglingCode === row.code"
                @change="(val) => toggleEnabled(row, val as boolean)"
              />
            </div>
          </div>

          <div class="mt-meta">
            <span class="mt-badge" :class="sourceBadgeClass(row.source)">{{ sourceLabel(row.source) }}</span>
            <el-tag size="small" effect="plain" type="info">{{ groupLabel(row.group) }}</el-tag>
            <el-tag v-if="rowNodeType(row)" size="small" effect="plain">
              {{ nodeTypeLabel(rowNodeType(row)!) }}
            </el-tag>
            <el-tooltip
              v-if="row.scripted"
              content="脚本库存件：逻辑存 DB，保存即编译热更"
              placement="top"
            >
              <el-tag size="small" type="success" effect="plain">
                脚本{{ row.db?.version != null ? ` v${row.db.version}` : '' }}
              </el-tag>
            </el-tooltip>
            <el-tooltip
              v-if="row.deprecated"
              :content="row.deprecateNote || '该组件已废弃，不建议在新链路使用'"
              placement="top"
            >
              <el-tag size="small" type="warning" effect="dark">废弃</el-tag>
            </el-tooltip>
            <el-tag v-if="row.disabled" size="small" type="info" effect="plain">已停用</el-tag>
          </div>
          <div v-if="row.tags?.length" class="mt-tags">
            <el-tag
              v-for="t in row.tags.slice(0, 4)"
              :key="t"
              size="small"
              effect="plain"
              class="mt-tag-chip"
            >
              # {{ t }}
            </el-tag>
            <span v-if="row.tags.length > 4" class="mt-tags-more">+{{ row.tags.length - 4 }}</span>
          </div>
          <div v-if="row.option?.description || row.db?.description" class="mt-desc">
            {{ row.option?.description || row.db?.description }}
          </div>

          <div class="mt-actions" @click.stop>
            <el-button
              v-hasPermi="['databus:component:query']"
              link
              type="primary"
              size="small"
              @click="openDetail(row)"
            >
              <el-icon><View /></el-icon>详情
            </el-button>
            <template v-if="row.db">
              <el-button
                v-hasPermi="['databus:component:edit']"
                link
                type="primary"
                size="small"
                @click="handleEdit(row)"
              >
                <el-icon><Edit /></el-icon>编辑
              </el-button>
              <el-button
                v-hasPermi="['databus:component:remove']"
                link
                type="danger"
                size="small"
                @click="handleDelete(row)"
              >
                <el-icon><Delete /></el-icon>删除
              </el-button>
            </template>
          </div>
        </div>
        <el-empty v-if="!loading && filteredRows.length === 0" description="没有符合条件的组件" />
      </div>
    </div>

    <ComponentDetailDrawer ref="detailDrawerRef" @edit="handleEdit" @delete="handleDelete" />
    <ComponentForm ref="componentFormRef" @success="getList" />
  </div>
</template>

<script setup name="DatabusComponent" lang="ts">
import { Box, CopyDocument, Delete, Edit, Plus, Search, View } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import {
  delComponent,
  listComponent,
  listComponentOptions,
  listScriptRuntime,
  updateComponent
} from '@/api/databus/component';
import type { ComponentSource, NodeTypeKind, ScriptRuntime } from '@/api/databus/component/types';
import { useLoading } from '@/hooks/async/useLoading';
import modal from '@/plugins/modal';
import { PALETTE_GROUPS } from '../editor/cmp-defs';
import ComponentDetailDrawer from './detail/ComponentDetailDrawer.vue';
import ComponentForm from './form/ComponentForm.vue';
import { groupLabel, nodeTypeLabel } from './model/labels';
import { buildRegistry } from './model/registry';
import type { ComponentRegistryRow, DefMeta } from './model/registry';

/**
 * 组件管理台账页（Style-B 小卡片网格，与连接管理同范式）。
 * 列表是 /options（内置+启用自定义富 schema）与 /list（全部 DB 行）的合流；
 * 面板分组/色值等展示元数据同样取自 /options（物料唯一数据源），
 * 停用件只在 /list 里露出。
 */

const rows = ref<ComponentRegistryRow[]>([]);
/** 库存脚本件运行时健康（启动期失败件用于页顶红条） */
const runtimeHealth = ref<ScriptRuntime[]>([]);
const { loading, withLoading } = useLoading(true);
const keyword = ref('');
const sourceFilter = ref<'' | ComponentSource>('');
const groupFilter = ref<'' | string>('');
const togglingCode = ref<string>();

const detailDrawerRef = ref<InstanceType<typeof ComponentDetailDrawer>>();
const componentFormRef = ref<InstanceType<typeof ComponentForm>>();

const builtinCount = computed(() => rows.value.filter((r) => r.source === 'SYSTEM').length);
const overlayCount = computed(() => rows.value.filter((r) => r.source === 'OVERLAY').length);
const customCount = computed(() => rows.value.filter((r) => r.source === 'CUSTOM').length);
const unhealthy = computed(() => runtimeHealth.value.filter((h) => !h.healthy));

/** 三态徽标文案/配色 */
function sourceLabel(source: ComponentSource): string {
  if (source === 'SYSTEM') {
    return '内置';
  }
  return source === 'OVERLAY' ? '治理覆盖' : '库存脚本件';
}

function sourceBadgeClass(source: ComponentSource): string {
  if (source === 'SYSTEM') {
    return 'mt-badge--sys';
  }
  return source === 'OVERLAY' ? 'mt-badge--overlay' : 'mt-badge--custom';
}

/** 分组胶囊：按面板七组顺序，只列存在的组，尾部补未分组 */
const groupOptions = computed(() => {
  const present = new Set(rows.value.map((r) => r.group));
  const list: { key: string; label: string }[] = PALETTE_GROUPS.filter((g) => present.has(g.key)).map(
    (g) => ({
      key: g.key,
      label: g.label
    })
  );
  if (present.has('')) {
    list.push({ key: '__ungrouped', label: '未分组' });
  }
  return list;
});

const filteredRows = computed(() => {
  let list = rows.value;
  if (sourceFilter.value) {
    list = list.filter((r) => r.source === sourceFilter.value);
  }
  if (groupFilter.value) {
    const key = groupFilter.value === '__ungrouped' ? '' : groupFilter.value;
    list = list.filter((r) => (r.group || '') === key);
  }
  const kw = keyword.value.trim().toLowerCase();
  if (kw) {
    list = list.filter((r) =>
      [
        r.name,
        r.shortName,
        r.code,
        r.option?.description,
        r.db?.description,
        ...(r.tags ?? [])
      ].some((s) => s?.toLowerCase().includes(kw))
    );
  }
  return list;
});

/** 节点类型兜底：option 缓存 → db 契约列（停用行没有 option） */
function rowNodeType(row: ComponentRegistryRow): NodeTypeKind | null {
  return (row.option?.nodeType as NodeTypeKind | null | undefined) ?? row.db?.nodeType ?? null;
}

/** 标签建议池：台账已有标签去重，供新增/编辑表单自由创建时联想 */
const tagPool = computed(() => {
  const set = new Set<string>();
  for (const r of rows.value) {
    for (const t of r.tags ?? []) {
      if (t) {
        set.add(t);
      }
    }
  }
  return [...set];
});

/** 拉取双源合流 + 脚本运行健康；任一源失败不阻断其他源渲染 */
const getList = async () => {
  await withLoading(async () => {
    const [optRes, listRes, runtimeRes] = await Promise.allSettled([
      listComponentOptions(),
      listComponent({ pageNum: 1, pageSize: 999 }),
      listScriptRuntime()
    ]);
    const options = optRes.status === 'fulfilled' ? optRes.value.data?.components ?? [] : [];
    const dbRows = listRes.status === 'fulfilled' ? listRes.value.data?.rows ?? [] : [];
    runtimeHealth.value = runtimeRes.status === 'fulfilled' ? runtimeRes.value.data ?? [] : [];
    // 展示元数据从 /options 自身构建（同一次响应，无第二数据源）
    const optionMetaMap: ReadonlyMap<string, DefMeta> = new Map(
      options.map((o) => [
        o.code,
        {
          group: o.group ?? undefined,
          color: o.color ?? undefined,
          icon: o.icon ?? undefined,
          short: o.shortName ?? undefined
        }
      ])
    );
    rows.value = buildRegistry(options, dbRows, optionMetaMap);
  });
};

function iconTileStyle(row: ComponentRegistryRow) {
  return {
    backgroundColor: row.color || 'var(--el-color-primary)',
    color: '#fff'
  };
}

function dotClass(row: ComponentRegistryRow) {
  return row.disabled ? 'status-offline' : 'status-online';
}

function openDetail(row: ComponentRegistryRow) {
  detailDrawerRef.value?.open(row);
}

function handleAdd() {
  componentFormRef.value?.open(undefined, tagPool.value);
}

function handleEdit(row: ComponentRegistryRow) {
  if (row.db?.id != null) {
    componentFormRef.value?.open(row.db.id, tagPool.value);
  }
}

async function handleDelete(row: ComponentRegistryRow) {
  if (row.db?.id == null) {
    return;
  }
  await modal.confirm(`是否确认删除自定义组件"${row.name}"（${row.code}）？删除后不可恢复。`);
  await delComponent(row.db.id);
  modal.msgSuccess('删除成功');
  await getList();
}

/**
 * 卡片开关：val=true 启用（status 0）/ false 停用（status 1）。
 * 停用不硬拦：仅提示面板不可见、已发布链路继续跑（库存脚本件重启后不再注册，重启用恢复）。
 */
async function toggleEnabled(row: ComponentRegistryRow, val: boolean) {
  if (!row.db || togglingCode.value) {
    return;
  }
  if (!val) {
    await modal.confirm(
      `确认停用「${row.name}」？停用后编辑器面板不再露出；已发布链路仍继续运行` +
        (row.scripted ? '，但服务重启后该脚本件不会重新注册（重启用即恢复）。' : '。')
    );
  }
  togglingCode.value = row.code;
  try {
    await updateComponent({ ...row.db, status: val ? '0' : '1' });
    modal.msgSuccess(val ? '已启用' : '已停用');
    await getList();
  } finally {
    togglingCode.value = undefined;
  }
}

async function copyCode(row: ComponentRegistryRow) {
  try {
    await navigator.clipboard.writeText(row.code);
    ElMessage.success(`已复制组件编码：${row.code}`);
  } catch {
    ElMessage.warning('复制失败，请手动选择文本复制');
  }
}

onMounted(() => {
  getList();
});
</script>

<style lang="scss" scoped>
.page-container {
  padding: 24px 24px 32px;
  background: var(--el-fill-color-light, #f5f7fa);
  min-height: 100%;
}

.page-inner {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.page-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.page-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--el-text-color-primary, #1d2129);
}

.page-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border: none;
  border-radius: 9999px;
  background: linear-gradient(
    135deg,
    var(--el-color-primary) 0%,
    var(--el-color-primary-light-3) 100%
  );
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(var(--el-color-primary-rgb, 22, 104, 220), 0.3);
  transition: all 0.25s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(var(--el-color-primary-rgb, 22, 104, 220), 0.4);
  }
}

.search-form {
  width: 100%;
}

.search-input-wrapper {
  display: flex;
  align-items: center;
  gap: 0;
  background: var(--el-bg-color, #fff);
  border: 2px solid var(--el-border-color, #e8eaec);
  border-radius: 12px;
  padding: 4px 4px 4px 14px;
  transition: all 0.2s ease;

  &:focus-within {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 3px rgba(var(--el-color-primary-rgb, 22, 104, 220), 0.12);
  }
}

.search-input-icon {
  color: var(--el-text-color-secondary);
  font-size: 16px;
}

.search-input {
  flex: 1;

  :deep(.el-input__wrapper) {
    box-shadow: none !important;
    background: transparent !important;
    padding: 0 8px;
  }

  :deep(.el-input__inner) {
    border: none;
    outline: none;
    background: transparent;
    font-size: 14px;
    height: 32px;
  }
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-divider {
  width: 1px;
  align-self: stretch;
  background: var(--el-border-color, #e8eaec);
}

.filter-tab {
  padding: 6px 16px;
  border-radius: 9999px;
  border: 1px solid var(--el-border-color, #e8eaec);
  background: var(--el-bg-color, #fff);
  color: var(--el-text-color-regular, #363b41);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--el-color-primary);
    color: var(--el-color-primary);
    box-shadow: 0 2px 6px rgba(var(--el-color-primary-rgb, 22, 104, 220), 0.1);
  }

  &.active {
    background-color: var(--el-color-primary);
    border-color: var(--el-color-primary);
    color: #fff;
  }
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  min-height: 80px;
}

.mt-card {
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--el-border-color, #e2e8f0);
  border-radius: 14px;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: pointer;
  transition: all 0.25s ease;

  &:hover {
    box-shadow: 0 12px 28px rgba(var(--el-color-primary-rgb, 22, 104, 220), 0.18);
    border-color: var(--el-color-primary);
    transform: translateY(-2px);
  }
}

.mt-card--off {
  opacity: 0.72;
}

.mt-card-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mt-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 20px;
}

.mt-title-area {
  flex: 1;
  min-width: 0;
}

.mt-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary, #1d2129);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mt-component {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: 'JetBrains Mono', Consolas, monospace;
  min-width: 0;
}

.mt-component-id {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.copy-id-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s ease;
  flex-shrink: 0;

  .el-icon {
    font-size: 12px;
  }

  &:hover {
    background: rgba(var(--el-color-primary-rgb, 22, 104, 220), 0.1);
    color: var(--el-color-primary);
    opacity: 1;
  }

  .mt-card:hover & {
    opacity: 0.7;
  }
}

.mt-switch-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.status-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.8);

  &.status-online {
    background: var(--el-color-success, #10b981);
  }

  &.status-offline {
    background: var(--el-color-info, #9ca3af);
  }

  &.status-danger {
    background: var(--el-color-danger, #f56c6c);
  }
}

.mt-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.mt-desc {
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.mt-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
}

.mt-badge--sys {
  background: rgba(var(--el-color-primary-rgb, 22, 104, 220), 0.1);
  color: var(--el-color-primary);
}

.mt-badge--overlay {
  background: rgba(125, 76, 219, 0.12);
  color: #7d4cdb;
}

.mt-badge--custom {
  background: rgba(16, 185, 129, 0.14);
  color: #10b981;
}

.health-banner {
  align-items: flex-start;
}

.health-banner__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}

.health-banner__item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.health-banner__msg {
  color: var(--el-text-color-regular, #363b41);
  word-break: break-all;
}

.mt-tags {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.mt-tag-chip {
  border-style: dashed;
}

.mt-tags-more {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.mt-actions {
  display: flex;
  gap: 4px;
  border-top: 1px solid var(--el-border-color-lighter, #ebeef5);
  padding-top: 10px;
  margin-top: auto;
}
</style>
