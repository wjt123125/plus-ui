<!--
  switchRoute 手写表单：数据空间 + 判断值路径 source + 值→分支 cases 映射。
  保持手写而非 schema：cases.target 吃画布 case 名，schema 表单无法表达这种动态候选。
-->
<template>
  <el-form label-position="top" size="small" class="cmp-leaf__form">
    <ConditionLeafBadge v-if="ctx.isConditionLeaf.value" />
    <DataSpaceField
      placeholder="如 switchRoute1（字母开头，字母数字下划线）"
      @data-change="emit('data-change')"
    />

    <SwitchCasesField v-if="ctx.needsCasesEdit.value" />

    <el-form-item label="判断值路径 source">
      <el-input
        v-model="form.source"
        placeholder="如 {{ $.request.type }}"
        @change="commit"
      />
      <div class="cmp-field__hint">读出实际值后按下方顺序逐条匹配，命中第一条即跳转；全不命中执行报错（暂不支持 DEFAULT）</div>
    </el-form-item>
    <el-form-item label="值 → 分支 cases">
      <div class="cmp-leaf__cases">
        <div v-for="(row, i) in form.cases" :key="i" class="cmp-leaf__mapping-row">
          <el-input
            v-model="row.value"
            size="small"
            placeholder="值：常量或 {{ $.路径 }}"
            @change="commit"
          />
          <el-select
            v-model="row.target"
            size="small"
            filterable
            allow-create
            default-first-option
            placeholder="目标 case 名"
            @change="commit"
          >
            <el-option
              v-for="name in caseActions.caseNames.value"
              :key="name"
              :label="name"
              :value="name"
            />
          </el-select>
          <el-button
            :icon="Delete"
            size="small"
            text
            :disabled="form.cases.length <= 1"
            @click="removeRouteCase(i)"
          />
        </div>
        <el-button size="small" :icon="Plus" @click="addRouteCase">添加映射</el-button>
      </div>
      <div class="cmp-field__hint">数字按数值匹配（200 与 "200" 相等）；target 必须与上方某个 case 名一致</div>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue';
import { Delete, Plus } from '@element-plus/icons-vue';
import { ElButton, ElForm, ElFormItem, ElInput, ElOption, ElSelect } from 'element-plus';
import { useElTreeModelInject } from '../../../composables/useElTreeModel';
import ConditionLeafBadge from './ConditionLeafBadge.vue';
import DataSpaceField from './DataSpaceField.vue';
import SwitchCasesField from './SwitchCasesField.vue';
import { usePropsContext } from './usePropsContext';
import { useSwitchCasesActions } from './useSwitchCases';

defineOptions({ name: 'SwitchRouteFields' });

const emit = defineEmits<{ (e: 'data-change'): void }>();

const ctx = usePropsContext();
const caseActions = useSwitchCasesActions();
const treeModel = useElTreeModelInject();

/** switchRoute 手写表单本地状态（node 切换时从 data JSON 同步） */
const form = reactive({
  source: '',
  cases: [] as { value: string; target: string }[]
});

// 切节点即重建；immediate 从叶子 data JSON 同步，非法 JSON 按空配置处理
watch(
  () => [ctx.elNode.value?.id, ctx.elNode.value?.data] as const,
  () => syncForm(ctx.elNode.value?.data),
  { immediate: true }
);

function syncForm(data?: string) {
  let cfg: any = {};
  if (data) {
    try {
      cfg = JSON.parse(data);
    } catch {
      cfg = {};
    }
  }
  form.source = typeof cfg?.source === 'string' ? cfg.source : '';
  form.cases = Array.isArray(cfg?.cases)
    ? cfg.cases.map((c: any) => ({
        value: c?.value == null ? '' : String(c.value),
        target: c?.target == null ? '' : String(c.target)
      }))
    : [];
}

/** case 比较值：数字串转数字，其余原样（路径/常量字符串） */
function coerceCaseValue(raw: string): string | number {
  return /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
}

/** 表单值序列化回叶子 data（纯数字串转 number，与后端数字比较口径配套） */
function commit() {
  const n = ctx.elNode.value;
  if (!n) return;
  const cfg: Record<string, unknown> = {};
  const source = form.source.trim();
  if (source) cfg.source = source;
  cfg.cases = form.cases
    .filter((row) => row.value.trim() !== '' || row.target.trim() !== '')
    .map((row) => ({
      value: coerceCaseValue(row.value.trim()),
      target: row.target.trim()
    }));
  treeModel.updateLeafData(n.id, { data: JSON.stringify(cfg) });
  emit('data-change');
}

function addRouteCase() {
  form.cases.push({ value: '', target: '' });
  commit();
}

function removeRouteCase(index: number) {
  if (form.cases.length <= 1) return;
  form.cases.splice(index, 1);
  commit();
}
</script>

<style scoped>
.cmp-leaf__form {
  margin-top: 4px;
}

.cmp-leaf__cases {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.cmp-leaf__mapping-row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.cmp-leaf__mapping-row :deep(.el-input) {
  flex: 1;
}

.cmp-leaf__mapping-row :deep(.el-select) {
  flex: 1;
}

.cmp-field__hint {
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}
</style>
