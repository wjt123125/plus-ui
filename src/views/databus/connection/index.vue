<template>
  <div class="page-container">
    <div class="page-inner">
      <!-- 顶部标题栏 -->
      <div class="page-header">
        <div class="page-title-wrap">
          <h2 class="page-title">连接管理</h2>
          <p class="page-subtitle">共 {{ total }} 个连接实例，组件通过连接ID引用此处维护的连接。</p>
        </div>
        <button v-hasPermi="['databus:connection:add']" class="add-btn" @click="handleAdd">
          <el-icon><Plus /></el-icon>
          <span>新增连接</span>
        </button>
      </div>

      <!-- 搜索框 -->
      <div class="search-form">
        <div class="search-input-wrapper">
          <el-icon class="search-input-icon"><Search /></el-icon>
          <el-input
            v-model="queryParams.connectionName"
            class="search-input"
            placeholder="搜索连接名称..."
            clearable
            @keyup.enter="handleQuery"
            @clear="handleQuery"
          />
          <button type="button" class="search-submit-btn" @click="handleQuery">搜索</button>
        </div>
      </div>

      <!-- 类型筛选 -->
      <div class="filter-bar">
        <div class="filter-tabs">
          <button
            class="filter-tab"
            :class="{ active: !queryParams.connectorType }"
            @click="changeConnectorType('')"
          >
            全部类型
          </button>
          <button
            v-for="item in CONNECTOR_OPTIONS"
            :key="item.value"
            class="filter-tab"
            :class="{ active: queryParams.connectorType === item.value }"
            @click="changeConnectorType(item.value)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <!-- 状态筛选 -->
      <div class="status-bar">
        <button
          class="filter-tab status-tab"
          :class="{ active: !queryParams.enabled }"
          @click="changeEnabled('')"
        >
          全部状态
        </button>
        <button
          class="filter-tab status-tab"
          :class="{ active: queryParams.enabled === 'Y' }"
          @click="changeEnabled('Y')"
        >
          启用
        </button>
        <button
          class="filter-tab status-tab"
          :class="{ active: queryParams.enabled === 'N' }"
          @click="changeEnabled('N')"
        >
          禁用
        </button>
      </div>

      <!-- 小卡片网格 -->
      <div v-loading="loading" class="card-grid">
        <div
          v-for="row in connectionList"
          :key="row.id"
          class="mt-card"
          @click="handleUpdate(row)"
        >
          <!-- 头部：图标 + 标题 + 开关 -->
          <div class="mt-card-head">
            <div class="mt-icon">
              <el-icon :size="22"><Link /></el-icon>
            </div>
            <div class="mt-title-area">
              <div class="mt-title">{{ row.connectionName }}</div>
              <div class="mt-component">
                <span class="mt-component-id">#{{ row.connectionId }}</span>
                <button
                  class="copy-id-btn"
                  title="复制连接ID"
                  @click.stop="copyConnectionId(row)"
                >
                  <el-icon><CopyDocument /></el-icon>
                </button>
              </div>
            </div>
            <div class="mt-switch-wrap">
              <span
                class="status-dot"
                :class="statusDotClass(row)"
                :title="row.enabled === 'Y' ? '已启用' : '已禁用'"
              />
              <el-switch
                v-model="row.enabled"
                active-value="Y"
                inactive-value="N"
                size="small"
                :loading="togglingId === row.id"
                @click.stop
                @change="() => toggleEnabled(row)"
              />
            </div>
          </div>

          <!-- 元信息：徽标 + tag + 范围提示 -->
          <div class="mt-meta">
            <span class="mt-badge">{{ connectorTypeLabel(row.connectorType) }}</span>
            <el-tag size="small" effect="plain" type="info">{{ row.connectorType || '-' }}</el-tag>
            <span class="mt-range">{{ formatTimeout(row.timeout) }} · {{ row.retryCount ?? 0 }}次重试</span>
          </div>
          <div class="mt-meta mt-meta-secondary">
            <span class="mt-meta-item">
              <el-icon><Link /></el-icon>{{ row.endpoint || '未配置地址' }}
            </span>
            <span class="mt-meta-item">
              <el-icon><Key /></el-icon>{{ row.accessKey || '未配置 AccessKey' }}
            </span>
          </div>

          <!-- 底部操作（link 按钮，全程可见） -->
          <div class="mt-actions" @click.stop>
            <el-button
              v-hasPermi="['databus:connection:test']"
              link
              type="success"
              size="small"
              :loading="testingId === row.id"
              @click="handleTest(row)"
            >
              <el-icon><Connection /></el-icon>测试
            </el-button>
            <el-button
              v-hasPermi="['databus:connection:edit']"
              link
              type="primary"
              size="small"
              @click="handleUpdate(row)"
            >
              <el-icon><Edit /></el-icon>编辑
            </el-button>
            <el-button
              v-hasPermi="['databus:connection:remove']"
              link
              type="danger"
              size="small"
              @click="handleDelete(row)"
            >
              <el-icon><Delete /></el-icon>删除
            </el-button>
          </div>
        </div>
        <el-empty v-if="!loading && connectionList.length === 0" description="暂无连接数据" />
      </div>

      <pagination
        v-show="total > 0"
        v-model:page="queryParams.pageNum"
        v-model:limit="queryParams.pageSize"
        :total="total"
        @pagination="getList"
      />
    </div>

    <ConnectionForm ref="connectionFormRef" @success="getList" />
  </div>
</template>

<script setup name="DatabusConnection" lang="ts">
import { Plus, Search, Edit, Delete, Link, Key, CopyDocument, Connection } from '@element-plus/icons-vue';
import {
  CONNECTOR_OPTIONS,
  delConnection,
  listConnection,
  testConnection,
  updateConnection
} from '@/api/databus/connection';
import type {
  SysDatabusConnectionBo,
  SysDatabusConnectionQuery,
  SysDatabusConnectionVo
} from '@/api/databus/connection/types';
import { ElMessage } from 'element-plus';
import { useLoading } from '@/hooks/async/useLoading';
import modal from '@/plugins/modal';
import ConnectionForm from './ConnectionForm.vue';

/**
 * 连接管理页（Style-B 小卡片网格风格）。
 * - 单一自适应网格（auto-fill minmax 300px）
 * - 状态用彩色圆点（不用文字标签）
 * - 启用/禁用开关直接外露在卡片头部
 * - 测试/编辑/删除 link 按钮在卡片底部全程可见
 * - 复制 connectionId 入口就近放在 ID 文本旁
 * - 点击卡片主体 = 打开编辑弹窗
 */

const connectionList = ref<SysDatabusConnectionVo[]>([]);
const { loading, withLoading } = useLoading(true);
const total = ref(0);
const togglingId = ref<number | undefined>();
const testingId = ref<number | undefined>();

const connectionFormRef = ref<InstanceType<typeof ConnectionForm>>();

const queryParams = ref<SysDatabusConnectionQuery>({
  pageNum: 1,
  pageSize: 10,
  connectionId: '',
  connectionName: '',
  connectorType: '',
  enabled: ''
});

/** 连接器类型值转展示文案，未知类型原样显示 */
const connectorTypeLabel = (value?: string) => {
  if (!value) {
    return '-';
  }
  return CONNECTOR_OPTIONS.find(item => item.value === value)?.label ?? value;
};

/** 超时毫秒值 → 人类可读文案 */
const formatTimeout = (ms?: number) => {
  if (!ms || ms <= 0) {
    return '默认超时';
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
  }
  const min = Math.floor(ms / 60000);
  const sec = (ms % 60000) / 1000;
  return sec ? `${min}min${sec}s` : `${min}min`;
};

/** enabled → 状态圆点 class（绿=启用 / 灰=禁用） */
const statusDotClass = (row: SysDatabusConnectionVo) =>
  row.enabled === 'Y' ? 'status-online' : 'status-offline';

/** 查询连接分页列表 */
const getList = async () => {
  await withLoading(async () => {
    const res = await listConnection(queryParams.value);
    connectionList.value = res.data?.rows ?? [];
    total.value = res.data?.total ?? 0;
  });
};

/** 搜索按钮操作 */
const handleQuery = () => {
  queryParams.value.pageNum = 1;
  getList();
};

/** 切换 connector 类型筛选 */
const changeConnectorType = (value: string) => {
  queryParams.value.connectorType = value;
  handleQuery();
};

/** 切换启用状态筛选 */
const changeEnabled = (value: string) => {
  queryParams.value.enabled = value;
  handleQuery();
};

/** 新增按钮操作 */
const handleAdd = () => {
  connectionFormRef.value?.openDialog();
};

/** 修改按钮操作（弹窗内按 id 重新拉详情回显） */
const handleUpdate = (row: Partial<SysDatabusConnectionVo>) => {
  connectionFormRef.value?.openDialog(row.id);
};

/**
 * 启用/禁用切换：el-switch v-model 已先把 row.enabled 翻转，
 * 这里发请求，失败则回滚到上一状态。
 */
const toggleEnabled = async (row: SysDatabusConnectionVo) => {
  if (!row.id || togglingId.value === row.id) {
    return;
  }
  const nextEnabled = row.enabled;
  const prevEnabled = nextEnabled === 'Y' ? 'N' : 'Y';
  togglingId.value = row.id;
  try {
    const bo: SysDatabusConnectionBo = { ...row, enabled: nextEnabled };
    await updateConnection(bo);
    modal.msgSuccess(nextEnabled === 'Y' ? '已启用' : '已禁用');
  } catch (e) {
    row.enabled = prevEnabled;
    throw e;
  } finally {
    togglingId.value = undefined;
  }
};

/** 删除按钮操作（单行） */
const handleDelete = async (row: Partial<SysDatabusConnectionVo>) => {
  const targetId = row.id;
  const targetName = row.connectionName ?? String(targetId);
  await modal.confirm('是否确认删除连接"' + targetName + '"？');
  await delConnection(targetId as number);
  await getList();
  modal.msgSuccess('删除成功');
};

/**
 * 测试连接：直传当前列表行数据（无敏感字段二次确认需求，列表行已含全量字段），
 * 后端按 BO 实测，成功 R.data 为"BPM 连接测试成功: ..."说明文本。
 * 失败由 request 拦截器统一弹错误提示，这里 catch 静默避免重复弹窗。
 */
const handleTest = async (row: SysDatabusConnectionVo) => {
  if (!row.id || testingId.value === row.id) {
    return;
  }
  if (!row.endpoint) {
    ElMessage.warning('该连接未配置连接地址，无法测试');
    return;
  }
  testingId.value = row.id;
  try {
    const bo: SysDatabusConnectionBo = { ...row };
    const { data } = await testConnection(bo);
    ElMessage.success(data || '测试成功');
  } catch {
    // 错误提示由 request 拦截器统一处理，此处不重复弹窗
  } finally {
    testingId.value = undefined;
  }
};

/**
 * 复制连接ID：组件层引用此值，复制到剪贴板方便粘贴到组件配置。
 * 使用 navigator.clipboard 标准 API（与项目其他模块一致）。
 */
const copyConnectionId = async (row: SysDatabusConnectionVo) => {
  if (!row.connectionId) {
    return;
  }
  try {
    await navigator.clipboard.writeText(row.connectionId);
    ElMessage.success(`已复制连接ID：${row.connectionId}`);
  } catch {
    ElMessage.warning('复制失败，请手动选择文本复制');
  }
};

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

/* 搜索框 */
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

.search-submit-btn {
  border: none;
  background: var(--el-color-primary);
  color: #fff;
  padding: 8px 22px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover {
    background: var(--el-color-primary-light-3);
  }
}

/* 筛选条 */
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

  &.status-tab.active {
    background-color: var(--el-color-success);
    border-color: var(--el-color-success);
  }
}

.status-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* 小卡片网格 */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
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
  gap: 12px;
  cursor: pointer;
  transition: all 0.25s ease;

  &:hover {
    box-shadow: 0 12px 28px rgba(var(--el-color-primary-rgb, 22, 104, 220), 0.18);
    border-color: var(--el-color-primary);
    transform: translateY(-2px);
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
  background: linear-gradient(
    135deg,
    rgba(var(--el-color-primary-rgb, 22, 104, 220), 0.12) 0%,
    rgba(var(--el-color-primary-rgb, 22, 104, 220), 0.22) 100%
  );
  color: var(--el-color-primary);
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

  /* 父卡片 hover 时才显现，常态隐藏避免视觉噪音 */
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

/* 状态彩色圆点（不用文字标签） */
.status-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.8);
  transition: transform 0.15s ease;
  cursor: help;

  &:hover {
    transform: scale(1.3);
  }

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
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.mt-meta-secondary {
  border-top: 1px dashed var(--el-border-color-lighter, #ebeef5);
  padding-top: 10px;
}

.mt-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  min-width: 0;

  .el-icon {
    font-size: 13px;
    flex-shrink: 0;
  }

  > span:not(.el-icon) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.mt-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(var(--el-color-primary-rgb, 22, 104, 220), 0.1);
  color: var(--el-color-primary);
}

.mt-range {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: 'JetBrains Mono', Consolas, monospace;
}

.mt-actions {
  display: flex;
  gap: 4px;
  border-top: 1px solid var(--el-border-color-lighter, #ebeef5);
  padding-top: 10px;
}
</style>
