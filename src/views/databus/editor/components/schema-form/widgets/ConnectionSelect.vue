<!-- 领域控件：connectionId 选择。值为连接业务键 connectionId（非表主键）；
     模块级单飞缓存与 useComponentOptions 同风格，编辑器会话只拉一次，失败可重试。 -->
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
      v-for="opt in connections"
      :key="opt.id"
      :label="`${opt.connectionName}（${opt.connectorType}）`"
      :value="opt.connectionId"
    >
      <span>{{ opt.connectionName }}</span>
      <span class="connection-select__type">{{ opt.connectorType }}</span>
    </el-option>
    <template #empty>
      <span class="connection-select__empty">{{ loadFailed ? '连接列表加载失败，请切走再切回重试' : '暂无启用的连接' }}</span>
    </template>
  </el-select>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElOption, ElSelect } from 'element-plus';
import { listConnectionOptions } from '@/api/databus/connection';
import type { ConnectionOption } from '@/api/databus/connection/types';

defineOptions({ name: 'ConnectionSelect' });

defineProps<{
  modelValue?: string | null;
  placeholder?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const connections = ref<ConnectionOption[]>([]);
const loadFailed = ref(false);

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

.connection-select__empty {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
