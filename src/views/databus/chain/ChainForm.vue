<!--
  链路编辑抽屉（编辑专用薄壳，2026-10-21 新建向导统一入口后新建路径退役）。
  表单体在 ChainFormBody（与新建向导 create tab 共用），此处只负责 el-drawer 外壳与开合编排；
  树叶子右键「编辑链路」经 openDialog(id) 打开，保存成功 emit('success') 由宿主刷树/改标题。
-->
<template>
  <el-drawer
    v-model="visible"
    direction="rtl"
    size="520px"
    append-to-body
    destroy-on-close
    :with-header="false"
    :close-on-click-modal="true"
    class="chain-form"
  >
    <ChainFormBody :chain-id="chainId" @saved="onSaved" @cancel="visible = false" />
  </el-drawer>
</template>

<script setup lang="ts">
import ChainFormBody, { type ChainFormSuccessPayload } from './ChainFormBody.vue';

/**
 * 链路编辑抽屉。
 * 父组件持 ref:openDialog(id) 编辑；表单体保存成功后 emit('success', payload)。
 */

const emit = defineEmits<{
  // payload 仅表单编辑提交时携带；模板运营区的标记/取消只触发树 reload
  (e: 'success', payload?: ChainFormSuccessPayload): void;
}>();

const visible = ref(false);
/** 编辑目标链路主键（null 兜底=空表单；新建已退役到向导 tab） */
const chainId = ref<number | string | null>(null);

/** 编辑链路：按主键拉详情回显（表单体 mounted 时自取） */
function openDialog(id?: number | string) {
  chainId.value = id ?? null;
  visible.value = true;
}

/** 表单体保存回报：成功即关抽屉；模板运营（无 payload）只刷树不关 */
function onSaved(payload?: ChainFormSuccessPayload) {
  if (payload) {
    visible.value = false;
  }
  emit('success', payload);
}

defineExpose({ openDialog });
</script>

<style lang="scss" scoped>
.chain-form {
  :deep(.el-drawer__body) {
    padding: 0;
    display: flex;
    flex-direction: column;
    height: 100%;
  }
}
</style>
