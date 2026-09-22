<template>
  <div class="page-container">
    <div class="page-inner">
      <!-- 顶部标题栏 -->
      <div class="page-header">
        <div class="page-title-wrap">
          <h2 class="page-title">链路管理</h2>
          <p class="page-subtitle">共 {{ total }} 条链路，编排原子组件形成数据加工管道，发布后可供调用。</p>
        </div>
        <button v-hasPermi="['databus:editor:add']" class="add-btn" @click="handleAdd">
          <el-icon><Plus /></el-icon>
          <span>新增链路</span>
        </button>
      </div>

      <!-- 搜索框 -->
      <div class="search-form">
        <div class="search-input-wrapper">
          <el-icon class="search-input-icon"><Search /></el-icon>
          <el-input
            v-model="queryParams.chainName"
            class="search-input"
            placeholder="搜索链路名称..."
            clearable
            @keyup.enter="handleQuery"
            @clear="handleQuery"
          />
          <button type="button" class="search-submit-btn" @click="handleQuery">搜索</button>
        </div>
      </div>

      <!-- 状态筛选 -->
      <div class="status-bar">
        <button class="filter-tab status-tab" :class="{ active: !queryParams.status }" @click="changeStatus('')">
          全部
        </button>
        <button
          v-for="item in STATUS_OPTIONS"
          :key="item.value"
          class="filter-tab status-tab"
          :class="[{ active: queryParams.status === item.value }, item.cls]"
          @click="changeStatus(item.value)"
        >
          {{ item.label }}
        </button>
      </div>

      <!-- 小卡片网格 -->
      <div v-loading="loading" class="card-grid">
        <div v-for="row in chainList" :key="row.id" class="mt-card" @click="handleUpdate(row)">
          <!-- 头部：图标 + 标题 + 状态圆点 -->
          <div class="mt-card-head">
            <div class="mt-icon">
              <el-icon :size="22"><Share /></el-icon>
            </div>
            <div class="mt-title-area">
              <div class="mt-title">{{ row.chainName }}</div>
              <div class="mt-component">
                <span class="mt-component-id">#{{ row.chainCode }}</span>
                <button class="copy-id-btn" title="复制链路编码" @click.stop="copyChainCode(row)">
                  <el-icon><CopyDocument /></el-icon>
                </button>
              </div>
            </div>
            <div class="mt-switch-wrap">
              <span class="status-dot" :class="statusDotClass(row)" :title="statusLabel(row)" />
            </div>
          </div>

          <!-- 元信息：版本 + 记录档位 + 更新时间 -->
          <div class="mt-meta">
            <span class="mt-badge">v{{ row.version ?? 1 }}</span>
            <el-tag size="small" effect="plain" type="info">{{ logLevelLabel(row.logLevel) }}</el-tag>
            <span class="mt-range">{{ formatTime(row.updateTime) }}</span>
          </div>

          <!-- 底部操作（link 按钮，全程可见） -->
          <div class="mt-actions" @click.stop>
            <el-button
              v-hasPermi="['databus:editor:edit']"
              link
              type="primary"
              size="small"
              @click="handleArrange(row)"
            >
              <el-icon><MagicStick /></el-icon>编排
            </el-button>
            <el-button
              v-hasPermi="['databus:editor:edit']"
              link
              type="primary"
              size="small"
              @click="handleUpdate(row)"
            >
              <el-icon><Edit /></el-icon>编辑
            </el-button>
            <el-button
              v-if="row.status !== STATUS_PUBLISHED"
              v-hasPermi="['databus:editor:publish']"
              link
              type="success"
              size="small"
              @click="handlePublish(row)"
            >
              <el-icon><Promotion /></el-icon>发布
            </el-button>
            <el-button
              v-else
              v-hasPermi="['databus:editor:offline']"
              link
              type="warning"
              size="small"
              @click="handleOffline(row)"
            >
              <el-icon><TurnOff /></el-icon>下线
            </el-button>
            <el-button
              v-hasPermi="['databus:editor:remove']"
              link
              type="danger"
              size="small"
              @click="handleDelete(row)"
            >
              <el-icon><Delete /></el-icon>删除
            </el-button>
          </div>
        </div>
        <el-empty v-if="!loading && chainList.length === 0" description="暂无链路数据" />
      </div>

      <pagination
        v-show="total > 0"
        v-model:page="queryParams.pageNum"
        v-model:limit="queryParams.pageSize"
        :total="total"
        @pagination="getList"
      />
    </div>

    <ChainForm ref="chainFormRef" @success="getList" />
  </div>
</template>

<script setup name="DatabusChain" lang="ts">
import {
  Plus,
  Search,
  Edit,
  Delete,
  Share,
  CopyDocument,
  MagicStick,
  Promotion,
  TurnOff
} from '@element-plus/icons-vue';
import { delChain, listChain, offlineChain, publishChain } from '@/api/databus/chain';
import type { DatabusChainQuery, DatabusChainVo } from '@/api/databus/chain/types';
import { ElMessage } from 'element-plus';
import { useLoading } from '@/hooks/async/useLoading';
import modal from '@/plugins/modal';
import { useRouter } from 'vue-router';
import ChainForm from './ChainForm.vue';

/**
 * 链路管理页（Style-B 小卡片网格风格）。
 * - 自适应网格（auto-fill minmax 320px）
 * - 状态用彩色圆点（草稿黄/已发布绿/已下线灰），不用文字标签
 * - 编排跳编辑器、发布/下线/编辑/删除 link 按钮全程可见
 * - 复制 chainCode 入口就近放在编码旁
 * - 点击卡片主体 = 打开基础信息编辑弹窗
 */

/** 状态值常量（与后端 ChainStatusEnum 对齐） */
const STATUS_DRAFT = '0';
const STATUS_PUBLISHED = '1';
const STATUS_OFFLINE = '2';

/** 状态筛选选项（cls 用于 hover/选中色区分，圆点颜色独立） */
const STATUS_OPTIONS = [
  { value: STATUS_DRAFT, label: '草稿', cls: 'tab-draft' },
  { value: STATUS_PUBLISHED, label: '已发布', cls: 'tab-online' },
  { value: STATUS_OFFLINE, label: '已下线', cls: 'tab-offline' }
];

/** 记录档位本地展示映射（字典 databus_log_level 的镜像，避免字典异步加载时序问题） */
const LOG_LEVEL_LABELS: Record<string, string> = {
  OFF: '关闭记录',
  BASIC: '基础记录',
  FULL: '完整记录'
};

const chainList = ref<DatabusChainVo[]>([]);
const { loading, withLoading } = useLoading(true);
const total = ref(0);

const chainFormRef = ref<InstanceType<typeof ChainForm>>();
const router = useRouter();

const queryParams = ref<DatabusChainQuery>({
  pageNum: 1,
  pageSize: 12,
  chainName: '',
  status: ''
});

/** status → 状态圆点 class（黄=草稿 / 绿=已发布 / 灰=已下线） */
const statusDotClass = (row: DatabusChainVo) => {
  if (row.status === STATUS_PUBLISHED) return 'status-online';
  if (row.status === STATUS_DRAFT) return 'status-draft';
  return 'status-offline';
};

/** 状态圆点 tooltip 文案 */
const statusLabel = (row: DatabusChainVo) =>
  STATUS_OPTIONS.find(item => item.value === row.status)?.label ?? '未知状态';

/** 记录档位值 → 展示文案，未知值原样显示 */
const logLevelLabel = (code?: string) => (code ? (LOG_LEVEL_LABELS[code] ?? code) : LOG_LEVEL_LABELS.BASIC);

/** 更新时间格式化（空值占位） */
const formatTime = (time?: string) => (time ? time.replace('T', ' ').slice(0, 16) : '未保存过');

/** 查询链路分页列表 */
const getList = async () => {
  await withLoading(async () => {
    const res = await listChain(queryParams.value);
    chainList.value = res.data?.rows ?? [];
    total.value = res.data?.total ?? 0;
  });
};

/** 搜索按钮操作 */
const handleQuery = () => {
  queryParams.value.pageNum = 1;
  getList();
};

/** 切换状态筛选 */
const changeStatus = (value: string) => {
  queryParams.value.status = value;
  handleQuery();
};

/** 新增按钮操作 */
const handleAdd = () => {
  chainFormRef.value?.openDialog();
};

/** 修改按钮操作（基础信息弹窗，按 id 重新拉详情回显） */
const handleUpdate = (row: Partial<DatabusChainVo>) => {
  chainFormRef.value?.openDialog(row.id);
};

/**
 * 编排：跳转链路编辑器。
 * 编辑器是 hidden 菜单（SQL 已配 path=editor，挂数据总线父目录），
 * 这里不硬编码父级路径，而是从已注册路由中动态解析 component 为 databus/editor 的路由，
 * 保证父菜单 path 调整也不影响跳转。
 */
const handleArrange = async (row: DatabusChainVo) => {
  if (!row.id) return;
  const target = router.getRoutes().find(r => r.path.endsWith('/editor') && r.path.includes('databus'));
  if (!target) {
    ElMessage.error('未找到编辑器路由，请确认编辑器隐藏菜单已加载（重新登录后重试）');
    return;
  }
  router.push({ path: target.path, query: { id: String(row.id) } });
};

/** 发布：正向操作直接执行（后端推 EL 到 Rule-DB + 状态流转），无需确认 */
const handlePublish = async (row: DatabusChainVo) => {
  if (!row.id) return;
  await publishChain(row.id);
  modal.msgSuccess('发布成功');
  getList();
};

/** 下线：直接执行（后端先改状态再移除 Rule-DB 规则），无需确认 */
const handleOffline = async (row: DatabusChainVo) => {
  if (!row.id) return;
  await offlineChain(row.id);
  modal.msgSuccess('已下线');
  getList();
};

/** 删除按钮操作（二次确认；后端同时清 Rule-DB 残留） */
const handleDelete = async (row: Partial<DatabusChainVo>) => {
  const targetId = row.id;
  const targetName = row.chainName ?? String(targetId);
  await modal.confirm('是否确认删除链路"' + targetName + '"？删除后不可恢复。');
  await delChain(targetId as number);
  await getList();
  modal.msgSuccess('删除成功');
};

/**
 * 复制链路编码：外部系统按 chainCode 调用时就近复制。
 * 使用 navigator.clipboard 标准 API（与连接页一致）。
 */
const copyChainCode = async (row: DatabusChainVo) => {
  if (!row.chainCode) return;
  try {
    await navigator.clipboard.writeText(row.chainCode);
    ElMessage.success(`已复制链路编码：${row.chainCode}`);
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
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content:space-between;
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

.status-bar {
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

  /* 各状态筛选选中色：草稿黄/已发布绿/已下线灰 */
  &.tab-draft.active {
    background-color: var(--el-color-warning);
    border-color: var(--el-color-warning);
  }
  &.tab-online.active {
    background-color: var(--el-color-success);
    border-color: var(--el-color-success);
  }
  &.tab-offline.active {
    background-color: var(--el-color-info);
    border-color: var(--el-color-info);
  }
}

/* 小卡片网格 */
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

/* 状态彩色圆点（不用文字标签）：草稿黄/已发布绿/已下线灰 */
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
  &.status-draft {
    background: var(--el-color-warning, #f59e0b);
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
}

.mt-actions {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  border-top: 1px solid var(--el-border-color-lighter, #ebeef5);
  padding-top: 10px;
}
</style>
