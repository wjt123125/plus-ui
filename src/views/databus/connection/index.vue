<template>
  <div class="p-2 app-container databus-connection-page">
    <div class="search-wrap">
      <el-card shadow="hover" class="search-panel" :class="{ 'is-collapsed': !showSearch }">
        <template #header>
          <div class="panel-heading search-panel-toggle" @click.stop="showSearch = !showSearch">
            <div>
              <span class="panel-kicker">Search Filters</span>
              <h3>筛选条件</h3>
            </div>
          </div>
        </template>
        <el-form ref="queryFormRef" :model="queryParams" :inline="true" class="query-form">
          <el-form-item label="连接ID" prop="connectionId">
            <el-input
              v-model="queryParams.connectionId"
              placeholder="请输入连接ID"
              clearable
              @keyup.enter="handleQuery"
            />
          </el-form-item>
          <el-form-item label="连接名称" prop="connectionName">
            <el-input
              v-model="queryParams.connectionName"
              placeholder="请输入连接名称"
              clearable
              @keyup.enter="handleQuery"
            />
          </el-form-item>
          <el-form-item label="连接器类型" prop="connectorType">
            <el-select v-model="queryParams.connectorType" placeholder="连接器类型" clearable style="width: 180px">
              <el-option
                v-for="item in CONNECTOR_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="状态" prop="enabled">
            <el-select v-model="queryParams.enabled" placeholder="启用状态" clearable style="width: 140px">
              <el-option label="启用" value="Y" />
              <el-option label="禁用" value="N" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" icon="Search" @click="handleQuery">搜索</el-button>
            <el-button icon="Refresh" @click="resetQuery">重置</el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </div>

    <el-card v-loading="loading" shadow="hover" class="table-panel">
      <template #header>
        <div class="toolbar-shell">
          <div class="table-heading">
            <span class="panel-kicker">Connection Dataset</span>
            <h3>连接列表</h3>
            <p>共 {{ total }} 条记录，组件通过连接ID引用此处维护的连接实例。</p>
          </div>
          <div class="toolbar-actions">
            <el-button
              v-hasPermi="['databus:connection:add']"
              type="primary"
              plain
              icon="Plus"
              @click="handleAdd"
            >
              新增
            </el-button>
            <el-button
              v-hasPermi="['databus:connection:remove']"
              type="danger"
              plain
              icon="Delete"
              :disabled="multiple"
              @click="handleDelete()"
            >
              删除
            </el-button>
            <right-toolbar v-model:show-search="showSearch" :search="false" @query-table="getList"></right-toolbar>
          </div>
        </div>
      </template>

      <el-table border class="data-table" :data="connectionList" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="55" align="center" />
        <el-table-column label="连接ID" prop="connectionId" min-width="140" :show-overflow-tooltip="true" />
        <el-table-column label="连接名称" prop="connectionName" min-width="140" :show-overflow-tooltip="true" />
        <el-table-column label="连接器类型" align="center" prop="connectorType" width="150">
          <template #default="{ row }">
            <el-tag type="primary">{{ connectorTypeLabel(row.connectorType) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="连接地址" prop="endpoint" min-width="200" :show-overflow-tooltip="true">
          <template #default="{ row }">{{ row.endpoint || '-' }}</template>
        </el-table-column>
        <el-table-column label="用户名" align="center" prop="username" width="120">
          <template #default="{ row }">{{ row.username || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" align="center" prop="enabled" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.enabled === 'Y'" type="success">启用</el-tag>
            <el-tag v-else type="info">禁用</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" align="center" prop="updateTime" width="160">
          <template #default="{ row }">
            <span>{{ parseTime(row.updateTime, '{y}-{m}-{d} {h}:{i}:{s}') || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" align="center" width="120" class-name="small-padding fixed-width">
          <template #default="{ row }">
            <el-tooltip content="修改" placement="top">
              <el-button
                v-hasPermi="['databus:connection:edit']"
                link
                type="primary"
                icon="Edit"
                @click="handleUpdate(row)"
              ></el-button>
            </el-tooltip>
            <el-tooltip content="删除" placement="top">
              <el-button
                v-hasPermi="['databus:connection:remove']"
                link
                type="danger"
                icon="Delete"
                @click="handleDelete(row)"
              ></el-button>
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>

      <pagination
        v-show="total > 0"
        v-model:page="queryParams.pageNum"
        v-model:limit="queryParams.pageSize"
        :total="total"
        @pagination="getList"
      />
    </el-card>

    <ConnectionForm ref="connectionFormRef" @success="getList" />
  </div>
</template>

<script setup name="DatabusConnection" lang="ts">
import { CONNECTOR_OPTIONS, delConnection, listConnection } from '@/api/databus/connection';
import type {
  SysDatabusConnectionQuery,
  SysDatabusConnectionVo
} from '@/api/databus/connection/types';
import { useLoading } from '@/hooks/async/useLoading';
import { useSearchReset } from '@/hooks/form/useSearchReset';
import { useSearchToggle } from '@/hooks/form/useSearchToggle';
import { useTableSelection } from '@/hooks/table/useTableSelection';
import modal from '@/plugins/modal';
import { parseTime } from '@/utils/ruoyi';
import ConnectionForm from './ConnectionForm.vue';

const connectionList = ref<SysDatabusConnectionVo[]>([]);
const { loading, withLoading } = useLoading(true);
const { showSearch } = useSearchToggle();
const total = ref(0);

const queryFormRef = ref<ElFormInstance>();
const connectionFormRef = ref<InstanceType<typeof ConnectionForm>>();

const queryParams = ref<SysDatabusConnectionQuery>({
  pageNum: 1,
  pageSize: 10,
  connectionId: '',
  connectionName: '',
  connectorType: '',
  enabled: ''
});

const { ids, multiple, handleSelectionChange } = useTableSelection<SysDatabusConnectionVo>(
  item => item.id as number
);

const { resetQuery } = useSearchReset({
  queryFormRef,
  queryParams,
  pageNumKey: 'pageNum',
  afterReset: () => {
    handleQuery();
  }
});

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

/** 连接器类型值转展示文案，未知类型原样显示 */
const connectorTypeLabel = (value?: string) => {
  if (!value) {
    return '-';
  }
  return CONNECTOR_OPTIONS.find(item => item.value === value)?.label ?? value;
};

/** 新增按钮操作 */
const handleAdd = () => {
  connectionFormRef.value?.openDialog();
};

/** 修改按钮操作（弹窗内按 id 重新拉详情回显） */
const handleUpdate = (row: Partial<SysDatabusConnectionVo>) => {
  connectionFormRef.value?.openDialog(row.id);
};

/** 删除按钮操作：传行为单条删除，不传行为勾选批量删除 */
const handleDelete = async (row?: Partial<SysDatabusConnectionVo>) => {
  const targetIds = row?.id ?? ids.value;
  const targetName = row?.connectionName ?? String(targetIds);
  await modal.confirm('是否确认删除连接"' + targetName + '"？');
  await delConnection(targetIds);
  await getList();
  modal.msgSuccess('删除成功');
};

onMounted(() => {
  getList();
});
</script>

<style lang="scss" scoped>
@use '@/assets/styles/components/page-shell' as pageShell;

@include pageShell.table-crud-page;
</style>
