<template>
  <el-dialog
    :model-value="visible"
    title="画布已转换为 LiteFlow EL"
    width="640px"
    append-to-body
    @update:model-value="emit('update:visible', $event)"
  >
    <el-descriptions :column="1" border size="small">
      <el-descriptions-item label="链路 ID">{{ chainId || '(未填写)' }}</el-descriptions-item>
      <el-descriptions-item label="EL 表达式">
        <el-input :model-value="elResult" type="textarea" :rows="5" readonly />
      </el-descriptions-item>
    </el-descriptions>
    <template #footer>
      <span class="el-result-dialog__hint">当前仅生成 EL 表达式，链路尚未落库；可点「试运行」按 EL 真跑一次。</span>
      <el-button type="primary" @click="emit('update:visible', false)">知道了</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean;
  chainId: string;
  elResult: string;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();
</script>

<style scoped>
.el-result-dialog__hint {
  float: left;
  padding-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
