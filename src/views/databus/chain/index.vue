<!--
  链路管理页 — 连接管理范式（单列居中 + 顶部标题/副标题/新增按钮 + 独立搜索框 + 水平胶囊筛选 + 卡片列表）。
  砍掉 sidebar 侧边栏 / featured 最近编辑横滑区 / 双视图切换；统一用分页查询，status 字段做筛选。
  page-inner 收敛到 1000px 居中，搜索框/筛选条/卡片列表同宽，每行一个，卡片压扁变矮。
-->
<template>
  <div class="page-container">
    <div class="page-inner">
      <!-- 顶部标题栏 -->
      <div class="page-header">
        <div class="page-title-wrap">
          <h2 class="page-title">链路管理</h2>
          <p class="page-subtitle">共 {{ total }} 个链路，组件通过链路编码引用此处维护的链路。</p>
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

      <!-- 状态筛选（水平胶囊，对齐连接管理范式） -->
      <div class="status-bar">
        <button
          v-for="s in STATUS_OPTIONS"
          :key="s.value"
          class="filter-tab"
          :class="{ active: queryParams.status === s.value }"
          @click="changeStatus(s.value)"
        >
          {{ s.label }}
        </button>
      </div>

      <!-- 卡片列表（单列居中，max-width 1000px，每行一个） -->
      <div v-loading="loading" class="card-list">
        <ChainCard
          v-for="row in chainList"
          :key="row.id"
          :row="row"
          @arrange="handleArrange"
          @edit="handleUpdate"
          @publish="handlePublish"
          @offline="handleOffline"
          @delete="handleDelete"
          @copy-code="copyChainCode"
        />
        <el-empty v-if="!loading && chainList.length === 0" description="暂无链路" />
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
import { Plus, Search } from '@element-plus/icons-vue';
import { delChain, listChain, offlineChain, publishChain } from '@/api/databus/chain';
import type { DatabusChainQuery, DatabusChainVo } from '@/api/databus/chain/types';
import { ElMessage } from 'element-plus';
import { useLoading } from '@/hooks/async/useLoading';
import modal from '@/plugins/modal';
import { useRouter } from 'vue-router';
import ChainCard from './ChainCard.vue';
import ChainForm from './ChainForm.vue';

/**
 * 链路管理页（连接管理范式：单列居中 + 顶部标题/搜索/筛选 + 卡片列表）。
 * - 统一分页查询，status 字段做状态筛选（''全部 / '0'草稿 / '1'已发布 / '2'已下线）
 * - 状态用彩色圆点（不用文字标签）
 * - 编排/发布或下线/编辑/删除 link 按钮常驻卡片底部
 * - 复制 chainCode 入口就近放在 code 文本旁
 * - 点击卡片主体 = 编排（跳转编辑器）
 */

const STATUS_DRAFT = '0';
const STATUS_PUBLISHED = '1';
const STATUS_OFFLINE = '2';

interface StatusOption {
  value: string;
  label: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  { value: '', label: '全部' },
  { value: STATUS_DRAFT, label: '草稿' },
  { value: STATUS_PUBLISHED, label: '已发布' },
  { value: STATUS_OFFLINE, label: '已下线' }
];

const { loading, withLoading } = useLoading(true);

const chainList = ref<DatabusChainVo[]>([]);
const total = ref(0);

const chainFormRef = ref<InstanceType<typeof ChainForm>>();
const router = useRouter();

const queryParams = ref<DatabusChainQuery>({
  pageNum: 1,
  pageSize: 10,
  chainName: '',
  status: ''
});

/** 分页查询链路列表 */
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

/** 修改按钮操作（弹窗内按 id 重新拉详情回显） */
const handleUpdate = (row: DatabusChainVo) => {
  if (!row.id) return;
  chainFormRef.value?.openDialog(row.id);
};

/** 编排：跳转链路编辑器（隐藏菜单，路由 path 以 /databus/editor 结尾） */
const handleArrange = async (row: DatabusChainVo) => {
  if (!row.id) return;
  const target = router.getRoutes().find(r => r.path.endsWith('/editor') && r.path.includes('databus'));
  if (!target) {
    ElMessage.error('未找到编辑器路由，请确认编辑器隐藏菜单已加载（重新登录后重试）');
    return;
  }
  router.push({ path: target.path, query: { id: String(row.id) } });
};

/** 发布链路 */
const handlePublish = async (row: DatabusChainVo) => {
  if (!row.id) return;
  await publishChain(row.id);
  modal.msgSuccess('发布成功');
  getList();
};

/** 下线链路 */
const handleOffline = async (row: DatabusChainVo) => {
  if (!row.id) return;
  await offlineChain(row.id);
  modal.msgSuccess('已下线');
  getList();
};

/** 删除链路（单行，二次确认） */
const handleDelete = async (row: DatabusChainVo) => {
  if (!row.id) return;
  const targetName = row.chainName ?? String(row.id);
  await modal.confirm('是否确认删除链路"' + targetName + '"？删除后不可恢复。');
  await delChain(row.id);
  await getList();
  modal.msgSuccess('删除成功');
};

/** 复制链路编码（组件层引用此值，复制到剪贴板方便粘贴到组件配置） */
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
  max-width: 1000px;
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

/* 状态筛选条（水平胶囊） */
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
}

/* 卡片列表（单列，撑满 page-inner 1000px） */
.card-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 80px;
}
</style>
