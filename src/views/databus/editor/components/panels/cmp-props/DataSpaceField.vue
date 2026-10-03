<!--
  数据空间表单项：schema 叶子 / switchRoute / 脚本三个表单共用。
  改名校验与全树路径引用联动内聚在本件；切换节点时从 ElNode.cmpId 同步。
  hint/placeholder 随宿主场景不同（脚本 nodeId 语义）由 props 覆盖。
-->
<template>
  <el-form-item label="数据空间" required :error="spaceError || undefined">
    <el-input
      v-model="name"
      :placeholder="placeholder"
      clearable
      @change="onChange"
    />
    <div class="cmp-field__hint">{{ hintText }}</div>
  </el-form-item>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElFormItem, ElInput, ElMessage } from 'element-plus';
import { useElTreeModelInject } from '../../../composables/useElTreeModel';
import { SPACE_NAME_RE } from './constants';
import { usePropsContext } from './usePropsContext';

defineOptions({ name: 'DataSpaceField' });

const props = withDefaults(
  defineProps<{
    placeholder?: string;
    /** 脚本叶子：hint 换成 nodeId 即数据空间名 + save 写出写法的说明 */
    scriptHint?: boolean;
  }>(),
  {
    placeholder: '如 httpRequest1（字母开头，字母数字下划线）',
    scriptHint: false
  }
);

const emit = defineEmits<{ (e: 'data-change'): void }>();

const ctx = usePropsContext();
const treeModel = useElTreeModelInject();

const name = ref('');
const spaceError = ref('');

/** 说明文案随当前输入实时拼出数据空间路径；脚本场景整句不同 */
const hintText = computed(() =>
  props.scriptHint
    ? `脚本 nodeId 即数据空间名（画布唯一）；脚本可通过 databusContext.save('$.${name.value || '数据空间名'}.xxx', value) 写出`
    : `组件产出挂在 $.${name.value || '数据空间名'} 下；画布内唯一，改名会联动更新引用`
);

// 分支组件互斥渲染，切节点即重建；immediate 同步当前叶子的 cmpId
watch(
  () => [ctx.elNode.value?.id, ctx.elNode.value?.cmpId] as const,
  () => {
    name.value = ctx.elNode.value?.cmpId ?? '';
    spaceError.value = '';
  },
  { immediate: true }
);

/** 数据空间改名：校验 → renameDataSpace 联动替换全树路径引用 → 重投影 */
function onChange() {
  const n = ctx.elNode.value;
  if (!n) return;
  const newName = name.value.trim();
  const oldName = n.cmpId ?? '';
  if (newName === oldName) {
    spaceError.value = '';
    name.value = oldName;
    return;
  }
  if (!SPACE_NAME_RE.test(newName)) {
    spaceError.value = '字母开头，只能含字母、数字、下划线';
    ElMessage.error('数据空间名不合法：字母开头，只能含字母、数字、下划线');
    name.value = oldName;
    return;
  }
  if (treeModel.isDataSpaceNameTaken(newName, n.id)) {
    spaceError.value = '数据空间名已被其他组件占用';
    ElMessage.error(`数据空间名「${newName}」已被占用，画布内必须唯一`);
    name.value = oldName;
    return;
  }
  const updated = treeModel.renameDataSpace(n.id, newName);
  spaceError.value = '';
  name.value = newName;
  if (updated > 0) {
    ElMessage.success(`数据空间已改名，联动更新了 ${updated} 处路径引用`);
  }
  // 改名可能改动了其他叶子的 data，统一走 commit 重投影 + 刷新 EL 预览
  emit('data-change');
}
</script>

<style scoped>
.cmp-field__hint {
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}
</style>
