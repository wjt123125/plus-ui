<!--
  统一资源选择器（三型：组件 / 链路 / 连接器）。
  市场上架表单的「源资源」专用：resourceType 切换即换数据源与过滤口径——
  - COMPONENT：启用件（status='0'），归属校验在服务端，前端不预过滤；
  - CHAIN：已发布非模板件（status='1' & isTemplate='0'）；
  - CONNECTOR：连接器 def 行（包上传/市场来源，零内置；开发目录装载的行不可上架，不进选项）。
  视觉范式融合：ChainSelect 的 el-select+状态徽标 × CmpPickerCard 的彩色图标。
  类型切换时清值重拉（各型 id 语义不同，旧值无意义）；弹窗复用场景由外层 open 时调 refresh()。
-->
<template>
  <el-select
    :model-value="modelValue ?? ''"
    :placeholder="placeholder"
    :disabled="disabled"
    :loading="loading"
    clearable
    filterable
    style="width: 100%"
    @update:model-value="onValueChange"
  >
    <el-option
      v-for="opt in options"
      :key="String(opt.id)"
      :label="optionLabel(opt)"
      :value="opt.id"
    >
      <span
        v-if="opt.icon"
        class="res-selector__icon"
        :style="{ backgroundColor: opt.color || 'var(--el-color-primary)' }"
      >
        <SvgIcon :icon-class="opt.icon" />
      </span>
      <span class="res-selector__name">{{ opt.name }}</span>
      <el-tag
        v-if="opt.statusText"
        size="small"
        :type="opt.statusType"
        effect="plain"
        class="res-selector__status"
      >
        {{ opt.statusText }}
      </el-tag>
      <span class="res-selector__code">#{{ opt.code }}</span>
    </el-option>
    <template #empty>
      <span class="res-selector__empty">{{ emptyText }}</span>
    </template>
  </el-select>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { listChain } from '@/api/databus/chain';
import { listComponent } from '@/api/databus/component';
import { listConnectorDefs } from '@/api/databus/connector';
import type { ConnectorDefVo } from '@/api/databus/connector/types';
import type { SelectorResourceType } from '@/api/databus/market/types';

defineOptions({ name: 'ResourceSelector' });

const props = withDefaults(
  defineProps<{
    modelValue?: string | number | null;
    /** 三型切换：组件 / 链路 / 连接器（切换即清值重拉） */
    resourceType: SelectorResourceType;
    placeholder?: string;
    disabled?: boolean;
  }>(),
  {
    modelValue: null,
    placeholder: '选择要上架的资源',
    disabled: false
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | number): void;
  (e: 'change', value: string | number): void;
}>();

/** 统一候选项（三型映射后的中性结构，渲染分流靠可选字段） */
interface ResourceOption {
  id: string | number;
  code: string;
  name: string;
  /** 组件型：CmpPickerCard 彩色图标范式 */
  icon?: string;
  color?: string;
  /** 链路型：ChainSelect 状态徽标范式 */
  statusText?: string;
  statusType?: 'success' | 'info' | 'warning';
}

const CHAIN_STATUS_TEXT: Record<string, string> = { '0': '草稿', '1': '已发布', '2': '已下线' };
const CHAIN_STATUS_TAG: Record<string, 'success' | 'info' | 'warning'> = {
  '0': 'info',
  '1': 'success',
  '2': 'warning'
};
/** 连接器运行层状态 → 徽标（同 MarketPane 连接器卡片口径） */
const CONNECTOR_STATUS_TEXT: Record<string, string> = { INACTIVE: '未启用', ENABLED: '已启用', DISABLED: '已禁用', DEPRECATED: '已废弃' };
const CONNECTOR_STATUS_TAG: Record<string, 'success' | 'info' | 'warning'> = {
  INACTIVE: 'info',
  ENABLED: 'success',
  DISABLED: 'warning',
  DEPRECATED: 'info'
};

const options = ref<ResourceOption[]>([]);
const loading = ref(false);
const failed = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  failed.value = false;
  try {
    if (props.resourceType === 'CHAIN') {
      const { data } = await listChain({ status: '1', isTemplate: '0', pageNum: 1, pageSize: 999 });
      options.value = (data?.rows ?? []).map((c) => ({
        id: c.id ?? '',
        code: c.chainCode,
        name: c.chainName,
        statusText: CHAIN_STATUS_TEXT[c.status ?? ''] ?? '未知',
        statusType: CHAIN_STATUS_TAG[c.status ?? ''] ?? 'info'
      }));
    } else if (props.resourceType === 'CONNECTOR') {
      // 连接器（§15.7）：选 def 行（sourceId＝def.id）
      // 开发目录装载的行（source='DEV'）不进选项：它的版本固定是 dev，不对应一份确定的包内容，
      // 审核人没有可核对的对象，后端提交上架也会拒（MarketPublishService），这里直接不给选
      const { data } = await listConnectorDefs();
      options.value = (data ?? [])
        .filter((d: ConnectorDefVo) => d.id != null && d.source !== 'DEV')
        .map((d: ConnectorDefVo) => ({
          id: d.id as string | number,
          code: d.type,
          name: d.label || d.type,
          icon: d.icon || undefined,
          statusText: CONNECTOR_STATUS_TEXT[d.status ?? ''] ?? '未知',
          statusType: CONNECTOR_STATUS_TAG[d.status ?? ''] ?? 'info'
        }));
    } else {
      const { data } = await listComponent({ status: '0', pageNum: 1, pageSize: 999 });
      options.value = (data?.rows ?? []).map((c) => ({
        id: c.id ?? 0,
        code: c.componentCode,
        name: c.componentName,
        icon: c.icon ?? undefined,
        color: c.color ?? undefined
      }));
    }
  } catch {
    failed.value = true;
    options.value = [];
  } finally {
    loading.value = false;
  }
}

const emptyText = computed(() => {
  if (failed.value) {
    return '资源列表加载失败，切换类型可重试';
  }
  if (props.resourceType === 'CONNECTOR') {
    return '暂无可上架的连接器包（先在市场管理上传 zip）';
  }
  return props.resourceType === 'CHAIN' ? '暂无可上架的链路' : '暂无可上架的组件';
});

function optionLabel(opt: ResourceOption): string {
  return `${opt.name} #${opt.code}`;
}

function onValueChange(val: string | number) {
  // clearable 清空时 el-select 给空串
  emit('update:modelValue', val ?? '');
  emit('change', val ?? '');
}

onMounted(() => void load());

watch(
  () => props.resourceType,
  () => {
    // 类型切换：各型 id 语义不同，清值 + 换源重拉（外层表单无需自带清值逻辑）
    onValueChange('');
    void load();
  }
);

defineExpose({
  /** 强制重拉（弹窗每次打开需要最新列表的场景；普通挂载已自动拉） */
  refresh: () => load()
});
</script>

<style scoped>
.res-selector__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-right: 6px;
  color: #fff;
  font-size: 11px;
  border-radius: 4px;
  vertical-align: middle;
}

.res-selector__name {
  margin-right: 8px;
}

.res-selector__status {
  margin-right: 8px;
  vertical-align: middle;
}

.res-selector__code {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.res-selector__empty {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
