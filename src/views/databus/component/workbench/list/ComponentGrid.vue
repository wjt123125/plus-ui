<!--
  组件卡片网格（工作面板「组件库」tab 的内容）：顶部工具条（仅搜索）+ 扫图卡片网格。
  接收已按组件树 scope 过滤的行，内部再做关键字过滤；面板宽度由左右可拖栏间接决定，网格流式自适应。
  「新增组件」入口不在这里——收敛到组件树目录节点的右键菜单（自带 group/domain 上下文）。
-->
<template>
  <section class="cmp-grid">
    <div class="cmp-grid__bar">
      <div class="cmp-grid__search">
        <el-icon class="cmp-grid__search-icon"><Search /></el-icon>
        <el-input
          v-model="keyword"
          class="cmp-grid__search-input"
          placeholder="搜索名称 / 短名 / 编码 / 标签 / 描述..."
          clearable
        />
      </div>
    </div>

    <div class="cmp-grid__meta">
      <span>{{ scopeTitle }}</span>
      <span class="cmp-grid__meta-count">{{ filteredRows.length }} 个组件</span>
      <slot name="meta" />
    </div>

    <!-- 库存脚本件启动期注册失败警示条 -->
    <el-alert
      v-if="unhealthy?.length"
      type="error"
      :closable="false"
      show-icon
      class="cmp-grid__health"
    >
      <template #title>
        <span>{{ unhealthy.length }} 个库存脚本件启动期编译/注册失败，相关链路执行将报错：</span>
      </template>
      <div class="cmp-grid__health-list">
        <div v-for="h in unhealthy" :key="h.componentId" class="cmp-grid__health-item">
          <el-tag size="small" type="danger" effect="dark">{{ h.componentCode }}</el-tag>
          <span class="cmp-grid__health-msg">{{ h.error }}</span>
        </div>
      </div>
    </el-alert>

    <div v-loading="loading" class="cmp-grid__scroll">
      <div class="card-grid">
        <div
          v-for="row in filteredRows"
          :key="row.source + ':' + row.code"
          class="mt-card"
          :class="{ 'mt-card--off': row.db && row.disabled, 'mt-card--active': row.code === activeCode }"
          @click="emit('open', row)"
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
                @change="(val) => emit('toggle', row, val as boolean)"
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
              @click="emit('open', row)"
            >
              <el-icon><View /></el-icon>详情
            </el-button>
            <template v-if="row.db">
              <el-button
                v-hasPermi="['databus:component:edit']"
                link
                type="primary"
                size="small"
                @click="emit('edit', row)"
              >
                <el-icon><Edit /></el-icon>编辑
              </el-button>
              <el-button
                v-hasPermi="['databus:component:remove']"
                link
                type="danger"
                size="small"
                @click="emit('delete', row)"
              >
                <el-icon><Delete /></el-icon>删除
              </el-button>
            </template>
          </div>
        </div>
        <el-empty v-if="!loading && filteredRows.length === 0" description="没有符合条件的组件" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Box, CopyDocument, Delete, Edit, Search, View } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { computed, ref } from 'vue';
import type { ComponentSource, NodeTypeKind, ScriptRuntime } from '@/api/databus/component/types';
import { paletteGroups } from '../../../editor/cmp-defs';
import { useComponentTaxonomy } from '../../../editor/composables/useComponentTaxonomy';
import { groupLabel, nodeTypeLabel } from '../../model/labels';
import type { ComponentRegistryRow } from '../../model/registry';
import type { TreeScope } from '../workbench.types';

defineOptions({ name: 'ComponentGrid' });

const { domains } = useComponentTaxonomy();

const props = defineProps<{
  rows: ComponentRegistryRow[];
  scope: TreeScope;
  /** 启动期注册失败的库存脚本件，非空时列表顶部出红条 */
  unhealthy?: ScriptRuntime[];
  loading?: boolean;
  togglingCode?: string;
  activeCode?: string;
}>();

const emit = defineEmits<{
  (e: 'open', row: ComponentRegistryRow): void;
  (e: 'edit', row: ComponentRegistryRow): void;
  (e: 'delete', row: ComponentRegistryRow): void;
  (e: 'toggle', row: ComponentRegistryRow, val: boolean): void;
}>();

const keyword = ref('');

const scopeTitle = computed(() => {
  switch (props.scope.kind) {
    case 'unhealthy':
      return '异常件';
    case 'recent':
      return '最近访问';
    case 'group': {
      // props.scope 是 getter，联合类型的窄化不会延续进回调，先落局部常量
      const scope = props.scope;
      if (scope.key === '__ungrouped') {
        return '未分组';
      }
      const label = paletteGroups.value.find((g) => g.key === scope.key)?.label ?? scope.key;
      return `分组 · ${label}`;
    }
    case 'domain': {
      const scope = props.scope;
      const label = domains.value.find((d) => d.key === scope.key)?.label ?? scope.key;
      return `业务域 · ${label}`;
    }
    case 'code':
      return `组件 · ${props.scope.code}`;
    default:
      return '全部组件';
  }
});

const filteredRows = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) {
    return props.rows;
  }
  return props.rows.filter((r) =>
    [r.name, r.shortName, r.code, r.option?.description, r.db?.description, ...(r.tags ?? [])].some((s) =>
      s?.toLowerCase().includes(kw)
    )
  );
});

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

function rowNodeType(row: ComponentRegistryRow): NodeTypeKind | null {
  return (row.option?.nodeType as NodeTypeKind | null | undefined) ?? row.db?.nodeType ?? null;
}

function iconTileStyle(row: ComponentRegistryRow) {
  return {
    backgroundColor: row.color || 'var(--el-color-primary)',
    color: '#fff'
  };
}

function dotClass(row: ComponentRegistryRow) {
  return row.disabled ? 'status-offline' : 'status-online';
}

async function copyCode(row: ComponentRegistryRow) {
  try {
    await navigator.clipboard.writeText(row.code);
    ElMessage.success(`已复制组件编码：${row.code}`);
  } catch {
    ElMessage.warning('复制失败，请手动选择文本复制');
  }
}
</script>

<style lang="scss" scoped>
.cmp-grid {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--el-fill-color-light, #f5f7fa);
}

.cmp-grid__bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px 8px;
  flex-shrink: 0;
}

.cmp-grid__search {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--el-border-color, #e8eaec);
  border-radius: 10px;
  padding: 2px 6px 2px 12px;
  transition: border-color 0.2s ease;

  &:focus-within {
    border-color: var(--el-color-primary);
  }
}

.cmp-grid__search-icon {
  color: var(--el-text-color-secondary);
  font-size: 15px;
}

.cmp-grid__search-input {
  flex: 1;

  :deep(.el-input__wrapper) {
    box-shadow: none !important;
    background: transparent !important;
    padding: 0;
  }
}

.cmp-grid__meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 0 16px 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.cmp-grid__meta-count {
  color: var(--el-text-color-placeholder);
}

.cmp-grid__health {
  flex-shrink: 0;
  align-items: flex-start;
  margin: 0 16px 10px;
  padding: 8px 12px;
}

.cmp-grid__health-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}

.cmp-grid__health-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.cmp-grid__health-msg {
  color: var(--el-text-color-regular, #363b41);
  word-break: break-all;
}

.cmp-grid__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 16px 20px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
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
  transition: box-shadow 0.2s ease, border-color 0.2s ease;

  &:hover {
    box-shadow: 0 12px 28px rgba(var(--el-color-primary-rgb, 22, 104, 220), 0.16);
    border-color: var(--el-color-primary);
  }

  &--off {
    opacity: 0.72;
  }

  &--active {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 1px var(--el-color-primary);
  }
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
