<!--
  设置 pane（2026-10-20 管理页 tab 化，databus-workspace-tabs.md §10 步骤4/5）。
  左导航 + 右内容，三组：告警规则 / 通知渠道 / 静默期。
  告警规则：分页表格 + 类型/状态筛选 + 新增/编辑/删除（AlertRuleForm 弹窗管理）。
  通知渠道 / 静默期：后端尚无独立配置接口，先落占位空态，等内容实现后替换为实表。
  「告警记录」不在此承载 —— 它已独立成 AlertPane tab。
  红线：无路由依赖、不 import Layout、不自行 router.push；表单弹窗只在此 pane 内部管（AlertRuleForm）。
-->
<template>
  <div class="settings-pane">
    <aside class="settings-nav">
      <button
        v-for="g in SETTINGS_GROUPS"
        :key="g.key"
        class="settings-nav__item"
        :class="{ active: group === g.key }"
        @click="group = g.key"
      >
        <SvgIcon class="settings-nav__icon" :icon-class="g.icon" />
        <span>{{ g.label }}</span>
      </button>
    </aside>

    <div class="settings-content">
      <div v-if="group === 'alert-rule'" class="settings-content__inner">
        <div class="page-header">
          <div class="page-title-wrap">
            <h2 class="page-title">告警规则</h2>
            <p class="page-subtitle">
              每分钟扫描启用规则，命中即按渠道通知（邮件/Webhook/通知链路），恢复即自动收线；持续触发不重复通知。
            </p>
          </div>
          <div class="header-actions">
            <el-button
              v-hasPermi="['databus:alert:add']"
              type="primary"
              @click="handleAdd"
            >
              <el-icon><Plus /></el-icon>
              <span>新增规则</span>
            </el-button>
          </div>
        </div>

        <div class="filter-bar">
          <el-input
            v-model="ruleQuery.ruleName"
            class="filter-item"
            placeholder="规则名称"
            clearable
            @keyup.enter="handleRuleQuery"
            @clear="handleRuleQuery"
          />
          <el-select
            v-model="ruleQuery.ruleType"
            class="filter-item"
            placeholder="全部类型"
            clearable
            @change="handleRuleQuery"
          >
            <el-option
              v-for="item in ALERT_RULE_TYPE_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <div class="status-bar">
            <button
              v-for="s in ENABLED_OPTIONS"
              :key="s.value"
              class="filter-tab"
              :class="{ active: ruleQuery.enabled === s.value }"
              @click="changeEnabled(s.value)"
            >
              {{ s.label }}
            </button>
          </div>
        </div>

        <div class="table-card">
          <div v-if="ruleLoading && ruleList.length === 0" class="table-skeleton">
            <el-skeleton animated :rows="7" />
          </div>
          <el-table v-else v-loading="ruleLoading" :data="ruleList">
            <el-table-column prop="ruleName" label="规则名称" min-width="160" show-overflow-tooltip />
            <el-table-column label="目标链路" min-width="150" show-overflow-tooltip>
              <template #default="{ row }"><span class="mono">#{{ row.chainCode }}</span></template>
            </el-table-column>
            <el-table-column label="类型" width="130">
              <template #default="{ row }">
                <el-tag size="small" effect="plain">{{ ruleTypeLabel(row.ruleType) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="触发条件" min-width="170">
              <template #default="{ row }">{{ ruleConditionText(row as DatabusAlertRuleVo) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="84" align="center">
              <template #default="{ row }">
                <el-tag :type="row.enabled === 'Y' ? 'success' : 'info'" size="small">
                  {{ row.enabled === 'Y' ? '启用' : '停用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="通知渠道" min-width="150">
              <template #default="{ row }">
                <el-tag
                  v-for="t in notifyTypeList(row.notifyType)"
                  :key="t"
                  size="small"
                  effect="plain"
                  class="channel-tag"
                >
                  {{ notifyTypeLabel(t) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="130" align="center" fixed="right">
              <template #default="{ row }">
                <el-button
                  v-hasPermi="['databus:alert:edit']"
                  link
                  type="primary"
                  size="small"
                  @click="handleUpdate(row as DatabusAlertRuleVo)"
                >
                  编辑
                </el-button>
                <el-button
                  v-hasPermi="['databus:alert:remove']"
                  link
                  type="danger"
                  size="small"
                  @click="handleDelete(row as DatabusAlertRuleVo)"
                >
                  删除
                </el-button>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty description="暂无告警规则（点「新增规则」创建第一条）" />
            </template>
          </el-table>
        </div>

        <pagination
          v-show="ruleTotal > 0"
          v-model:page="ruleQuery.pageNum"
          v-model:limit="ruleQuery.pageSize"
          :total="ruleTotal"
          @pagination="getRuleList"
        />
      </div>

      <div v-else class="settings-content__empty">
        <el-empty description="该设置项暂未开放" :image-size="72" />
      </div>
    </div>

    <AlertRuleForm ref="ruleFormRef" @success="getRuleList" />
  </div>
</template>

<script setup name="SettingsPane" lang="ts">
import { Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';
import {
  ALERT_NOTIFY_TYPE_OPTIONS,
  ALERT_RULE_TYPE_OPTIONS,
  delAlertRule,
  listAlertRule
} from '@/api/databus/alert';
import type { DatabusAlertRuleQuery, DatabusAlertRuleVo } from '@/api/databus/alert/types';
import { useLoading } from '@/hooks/async/useLoading';
import AlertRuleForm from '@/views/databus/alert/AlertRuleForm.vue';

/**
 * 设置 pane：左导航 + 右内容，三组（告警规则有真实内容；通知渠道/静默期为占位空态）。
 */

// settings pane 渲染 lucide 图标，需注入子集（幂等，与工作台其它组件共用一次注入）
useLucideSubset();

/** 三组导航（2026-10-20 敲定）。告警规则有真实内容；通知渠道/静默期后端尚无独立配置接口，
 *  先落占位空态（见 .settings-content__empty），等内容实现后逐个替换为实表。 */
const SETTINGS_GROUPS = [
  { key: 'alert-rule', label: '告警规则', icon: 'lucide:circle-alert' },
  { key: 'notify-channel', label: '通知渠道', icon: 'lucide:send' },
  { key: 'silence-window', label: '静默期', icon: 'lucide:clock' }
] as const;

const group = ref<string>('alert-rule');
const ruleFormRef = ref<InstanceType<typeof AlertRuleForm>>();

const ENABLED_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'Y', label: '启用' },
  { value: 'N', label: '停用' }
];

/* ------------------------------ 规则 ------------------------------ */

const ruleList = ref<DatabusAlertRuleVo[]>([]);
const ruleTotal = ref(0);
const { loading: ruleLoading, withLoading: withRuleLoading } = useLoading(true);

const ruleQuery = ref<DatabusAlertRuleQuery>({
  pageNum: 1,
  pageSize: 10,
  ruleName: '',
  chainCode: '',
  ruleType: '',
  enabled: ''
});

const getRuleList = async () => {
  await withRuleLoading(async () => {
    const res = await listAlertRule(ruleQuery.value);
    ruleList.value = res.data?.rows ?? [];
    ruleTotal.value = res.data?.total ?? 0;
  });
};

const handleRuleQuery = () => {
  ruleQuery.value.pageNum = 1;
  getRuleList();
};

const changeEnabled = (value: string) => {
  ruleQuery.value.enabled = value;
  handleRuleQuery();
};

const handleAdd = () => {
  ruleFormRef.value?.openDialog();
};

const handleUpdate = (row: DatabusAlertRuleVo) => {
  ruleFormRef.value?.openDialog(row.id);
};

const handleDelete = async (row: DatabusAlertRuleVo) => {
  await ElMessageBox.confirm(
    `确认删除告警规则「${row.ruleName}」？已产生的告警记录会保留，便于历史追溯。`,
    '删除确认',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
  );
  await delAlertRule(row.id as number | string);
  await getRuleList();
  ElMessage.success('删除成功');
};

/* ------------------------------ 展示辅助 ------------------------------ */

const ruleTypeLabel = (type?: string) =>
  ALERT_RULE_TYPE_OPTIONS.find((item) => item.value === type)?.label ?? type ?? '-';

const ruleConditionText = (row: DatabusAlertRuleVo) => {
  const window = row.windowMinutes ?? 5;
  if (row.ruleType === 'CONSECUTIVE_FAILURE') {
    return `窗口 ${window} 分钟内连续失败 ${row.thresholdCount ?? '-'} 次`;
  }
  if (row.ruleType === 'SUCCESS_RATE') {
    return `窗口 ${window} 分钟内成功率 < ${row.thresholdRate ?? '-'}%`;
  }
  return `窗口 ${window} 分钟`;
};

const notifyTypeList = (notifyType?: string | null) =>
  (notifyType ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

const notifyTypeLabel = (type: string) =>
  ALERT_NOTIFY_TYPE_OPTIONS.find((item) => item.value === type)?.label ?? type;

onMounted(() => {
  getRuleList();
});
</script>

<style lang="scss" scoped>
/* pane 骨架：吃满宿主高度，左导航定宽、右内容内滚（外层不出现双滚动条） */
.settings-pane {
  height: 100%;
  min-width: 0;
  display: flex;
  overflow: hidden;
  background: var(--el-fill-color-light, #f5f7fa);
}

.settings-nav {
  flex-shrink: 0;
  width: 200px;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--app-surface-bg, #fff);
  border-right: 1px solid var(--app-surface-border, #e5e7eb);
  overflow-y: auto;
}

.settings-nav__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border: none;
  border-radius: var(--app-radius-md, 10px);
  background: transparent;
  color: var(--el-text-color-regular, #363b41);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition:
    color 0.15s ease,
    background-color 0.15s ease;

  &:hover {
    background: var(--el-fill-color-light, #f5f7fa);
    color: var(--el-color-primary);
  }

  &.active {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    font-weight: 600;
  }

  &:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 2px;
  }
}

.settings-nav__icon {
  font-size: 16px;
  flex-shrink: 0;
}

.settings-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-content__inner {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px 24px 32px;
}

.settings-content__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
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
  font-size: var(--app-font-size-title, 22px);
  font-weight: 700;
  color: var(--app-text-title, #1f2937);
}

.page-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.filter-item {
  width: 200px;
  max-width: 100%;
}

.status-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-tab {
  padding: 6px 16px;
  border-radius: var(--app-radius-md, 10px);
  border: 1px solid var(--el-border-color, #e8eaec);
  background: var(--el-bg-color, #fff);
  color: var(--el-text-color-regular, #363b41);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    color 0.2s ease,
    background-color 0.2s ease,
    border-color 0.2s ease;

  &:hover {
    border-color: var(--el-color-primary);
    color: var(--el-color-primary);
  }

  &.active {
    background-color: var(--el-color-primary);
    border-color: var(--el-color-primary);
    color: #fff;
  }

  &:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 2px;
  }
}

.table-card {
  background: var(--app-surface-bg, #fff);
  border: 1px solid var(--app-surface-border, #e5e7eb);
  border-radius: var(--app-radius-lg, 14px);
  padding: 8px;
}

.table-skeleton {
  padding: 16px 16px 8px;
}

.mono {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
}

.channel-tag {
  margin-right: 4px;
}
</style>