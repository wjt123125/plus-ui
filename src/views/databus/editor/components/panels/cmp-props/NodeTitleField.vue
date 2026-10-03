<!--
  节点标题编辑：业务叶子/条件件/算子可编辑；留空显组件 label，填了锁定；
  Refresh 图标清空恢复默认。是否可编辑由壳按 ctx.canEditTitle 决定是否渲染本件。
-->
<template>
  <el-form label-position="top" size="small" class="cmp-title__form">
    <el-form-item label="节点标题">
      <el-input
        v-model="titleInput"
        :placeholder="ctx.defaultTitleText.value"
        @change="onTitleChange"
      >
        <template #suffix>
          <el-icon
            v-if="hasCustomTitle"
            class="cmp-title__reset"
            title="恢复默认命名"
            @click="resetTitle"
          >
            <Refresh />
          </el-icon>
        </template>
      </el-input>
      <div class="cmp-field__hint">留空时显示组件 label；自定义后不随配置变化</div>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import { ElForm, ElFormItem, ElIcon, ElInput } from 'element-plus';
import { useElTreeModelInject } from '../../../composables/useElTreeModel';
import { usePropsContext } from './usePropsContext';

defineOptions({ name: 'NodeTitleField' });

const emit = defineEmits<{ (e: 'data-change'): void }>();

const ctx = usePropsContext();
const treeModel = useElTreeModelInject();

const titleInput = ref('');

// 切节点即重建（壳按 canEditTitle 条件渲染）；immediate 同步树正本
watch(
  () => [ctx.elNode.value?.id, ctx.elNode.value?.title] as const,
  () => {
    titleInput.value = ctx.elNode.value?.title ?? '';
  },
  { immediate: true }
);

const hasCustomTitle = computed(() => !!titleInput.value.trim());

/** 标题改完（失焦/回车）：写树正本并重投影；空白等同恢复默认 */
function onTitleChange() {
  const n = ctx.elNode.value;
  if (!n) return;
  treeModel.updateNodeTitle(n.id, titleInput.value);
  titleInput.value = n.title ?? '';
  emit('data-change');
}

/** 点 Refresh：清空用户正本，恢复显示组件 label */
function resetTitle() {
  const n = ctx.elNode.value;
  if (!n) return;
  treeModel.updateNodeTitle(n.id, '');
  titleInput.value = '';
  emit('data-change');
}
</script>

<style scoped>
.cmp-title__form {
  margin-top: 4px;
}

.cmp-title__reset {
  cursor: pointer;
  color: var(--el-text-color-secondary);
}

.cmp-title__reset:hover {
  color: var(--el-color-primary);
}

.cmp-field__hint {
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}
</style>
