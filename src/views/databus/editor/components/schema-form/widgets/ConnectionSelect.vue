<!-- 领域控件：connectionId 选择。值为连接业务键 connectionId（非表主键）；
     模块级单飞缓存与 useComponentOptions 同风格，编辑器会话只拉一次，失败可重试。
     按能力族过滤（material-market §15.12.6-G）：字段声明 connectorFamily=jdbc 时只列 SQL 连接器；
     节点上已存的旧值即使族不匹配也保留在列表里并标红，否则老链打开时值凭空消失、用户以为配置丢了。 -->
<template>
  <el-select
    :model-value="modelValue ?? ''"
    :placeholder="placeholder || '请选择连接'"
    clearable
    filterable
    style="width: 100%"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-option
      v-for="opt in visibleOptions"
      :key="opt.id"
      :label="`${opt.connectionName}（${opt.connectorType}）`"
      :value="opt.connectionId"
    >
      <span :class="{ 'connection-select__mismatch': isMismatch(opt) }">{{ opt.connectionName }}</span>
      <span class="connection-select__type">{{ opt.connectorType }}</span>
      <span v-if="isMismatch(opt)" class="connection-select__warn">不匹配（需 {{ connectorFamily }}）</span>
    </el-option>
    <template #empty>
      <span class="connection-select__empty">{{ emptyText }}</span>
    </template>
  </el-select>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElOption, ElSelect } from 'element-plus';
import { listConnectionOptions } from '@/api/databus/connection';
import type { ConnectionOption } from '@/api/databus/connection/types';

defineOptions({ name: 'ConnectionSelect' });

const props = defineProps<{
  modelValue?: string | null;
  placeholder?: string;
  /** 字段要求的连接器能力族（PropSchema.connectorFamily）；不传＝不过滤 */
  connectorFamily?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const connections = ref<ConnectionOption[]>([]);
const loadFailed = ref(false);

/**
 * 族不匹配判定。连接的 connectorFamily 为空（连接器包未装载 / describe 失败）时**不判为不匹配**：
 * 后端拿不到族不代表连接不可用，宁可留着让用户自己选，也不要凭空过滤掉唯一那条能用的连接。
 */
function isMismatch(opt: ConnectionOption): boolean {
  return !!props.connectorFamily && !!opt.connectorFamily && opt.connectorFamily !== props.connectorFamily;
}

const visibleOptions = computed<ConnectionOption[]>(() => {
  if (!props.connectorFamily) {
    return connections.value;
  }
  const matched = connections.value.filter((o) => !isMismatch(o));
  // 已存旧值兜底：过滤后不在列表里就把它捞回来（标红），保住「打开老链能看见原值」
  const current = props.modelValue;
  if (current && !matched.some((o) => o.connectionId === current)) {
    const stale = connections.value.find((o) => o.connectionId === current);
    if (stale) {
      matched.push(stale);
    }
  }
  return matched;
});

const emptyText = computed(() => {
  if (loadFailed.value) {
    return '连接列表加载失败，请切走再切回重试';
  }
  if (props.connectorFamily && connections.value.length > 0) {
    return `没有 ${props.connectorFamily} 族的连接，请先到连接管理创建`;
  }
  return '暂无启用的连接';
});

let pending: Promise<ConnectionOption[]> | null = null;

async function fetchConnections(): Promise<ConnectionOption[]> {
  if (!pending) {
    pending = listConnectionOptions()
      .then((res) => {
        connections.value = res.data ?? [];
        return connections.value;
      })
      .catch((err) => {
        pending = null;
        throw err;
      });
  }
  return pending;
}

onMounted(() => {
  fetchConnections().catch(() => {
    loadFailed.value = true;
  });
});
</script>

<style scoped>
.connection-select__type {
  margin-left: 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.connection-select__mismatch {
  color: var(--el-color-danger);
}

.connection-select__warn {
  margin-left: 8px;
  font-size: 11px;
  color: var(--el-color-danger);
}

.connection-select__empty {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
