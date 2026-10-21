<!--
  目录表单主体（原资源树内目录 dialog 剥壳，2026-10-21 新建向导统一入口）。
  新建向导 create tab 与树内重命名 dialog（薄壳）共用同一份，故不含 el-dialog；
  结构：head（标题 + 目录名预览）+ label-top 单列表单 + footer（取消/保存）。
  directoryId 空=新增（preset.directoryId 预填父目录，未传/0=根级）；非空=编辑（GET /{id} 回显）。
  父目录选项自取 /databus/directory/list（value=0 根哨兵）；编辑态剔除自身子树防选环。
  脏状态走表单快照比对上报 dirty-change（供 tab 条脏圆点、切段与关闭确认）。
-->
<template>
  <div class="dir-body">
    <header class="dir-body__head">
      <div class="dir-body__title-wrap">
        <span class="dir-body__title">{{ isEdit ? '编辑目录' : '新建目录' }}</span>
        <span class="dir-body__name">{{ form.directoryName || '未命名目录' }}</span>
      </div>
    </header>

    <el-form
      ref="formRef"
      v-loading="loading"
      :model="form"
      :rules="rules"
      label-position="top"
      class="dir-body__form"
    >
      <el-form-item label="目录名" prop="directoryName">
        <el-input
          v-model="form.directoryName"
          maxlength="100"
          show-word-limit
          placeholder="目录名"
        />
      </el-form-item>
      <el-form-item label="父目录" prop="parentId">
        <el-tree-select
          v-model="form.parentId"
          :data="dirOptions"
          node-key="value"
          check-strictly
          default-expand-all
          style="width: 100%"
          placeholder="根目录"
        />
      </el-form-item>
      <el-form-item label="排序号" prop="sort">
        <el-input-number v-model="form.sort" :min="0" :max="9999" controls-position="right" />
      </el-form-item>
      <el-form-item label="备注" prop="remark">
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="2"
          maxlength="500"
          show-word-limit
          placeholder="选填"
        />
      </el-form-item>
    </el-form>

    <footer class="dir-body__footer">
      <span v-if="dirty" class="dir-body__dirty">有未保存的改动</span>
      <span class="dir-body__spacer" />
      <el-button size="small" @click="emit('cancel')">取 消</el-button>
      <el-button size="small" type="primary" :loading="submitting" @click="handleSubmit">
        保 存
      </el-button>
    </footer>
  </div>
</template>

<script setup lang="ts" name="DirectoryFormBody">
import type { FormInstance, FormRules } from 'element-plus';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { DirectoryVo } from '@/api/databus/directory/types';
import { addDirectory, getDirectory, listDirectory, updateDirectory } from '@/api/databus/directory';
import { ElMessage } from 'element-plus';
import type { FormPreset } from '../workbench.types';

/**
 * 目录表单主体。
 * - directoryId 空=新增（preset.directoryId 预填父目录）；非空=编辑（拉详情回显）
 * - 保存成功 emit('saved', isNew)，由宿主决定关 dialog / 刷树 / 向导复位
 * - 表单快照比对上报 dirty-change，供 tab 条脏圆点与关闭确认
 */

interface DirectoryFormState {
  id?: string | number;
  parentId: string | number;
  directoryName: string;
  sort: number;
  remark?: string;
}

const props = defineProps<{
  /** 编辑目标目录主键；null/undefined=新增（向导） */
  directoryId?: string | number | null;
  /** 新建预设（父目录；目录右键「新建子目录」携带） */
  preset?: FormPreset;
}>();

const emit = defineEmits<{
  (e: 'saved', isNew: boolean): void;
  (e: 'cancel'): void;
  (e: 'dirty-change', dirty: boolean): void;
}>();

const loading = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();

/** 目录平表（自取，父目录选项与编辑回显共用；同表单内闭环，不动资源树数据） */
const directories = ref<DirectoryVo[]>([]);

const buildInitForm = (): DirectoryFormState => ({ parentId: 0, directoryName: '', sort: 0, remark: '' });

const form = ref<DirectoryFormState>(buildInitForm());

const isEdit = computed(() => props.directoryId != null && props.directoryId !== '');

const rules: FormRules = {
  directoryName: [
    { required: true, message: '目录名不能为空', trigger: 'blur' },
    { max: 100, message: '目录名不超过 100 字', trigger: 'blur' }
  ]
};

/* ---------------- 父目录选项（value=0 根哨兵；编辑态剔除自身子树防选环） ---------------- */

interface DirOption {
  value: string | number;
  label: string;
  children: DirOption[];
}

function buildDirOptions(parentId: string | number, excluded: Set<string>): DirOption[] {
  return directories.value
    .filter((d) => String(d.parentId) === String(parentId) && !excluded.has(String(d.id)))
    .map((d) => ({
      value: d.id,
      label: d.directoryName,
      children: buildDirOptions(d.id, excluded)
    }));
}

/** 平表闭包求子孙集合（含自身），用于编辑/拖拽剔除自身子树 */
function subtreeIds(rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of directories.value) {
      if (ids.has(String(d.parentId)) && !ids.has(String(d.id))) {
        ids.add(String(d.id));
        grew = true;
      }
    }
  }
  return ids;
}

const dirOptions = computed<DirOption[]>(() => {
  const excluded =
    form.value.id != null ? subtreeIds(String(form.value.id)) : new Set<string>();
  return [{ value: 0, label: '根目录', children: buildDirOptions(0, excluded) }];
});

/* ---------------- 脏状态：表单快照比对 ---------------- */

const dirty = ref(false);
/** null=尚未完成初次基线（mount 初始化期间不上报，避免瞬时脏误报闪跳） */
let baseline: string | null = null;

function snapshot(): string {
  return JSON.stringify(form.value);
}

function markBaseline() {
  baseline = snapshot();
  dirty.value = false;
  emit('dirty-change', false);
}

watch(snapshot, (val) => {
  if (baseline === null) {
    return;
  }
  // 快照回到基线同样要复位（输入又删净等 A→B→A 轨迹不再残留脏标记，2026-10-21 脏态误报修复）
  const next = val !== baseline && !loading.value;
  if (next !== dirty.value) {
    dirty.value = next;
    emit('dirty-change', next);
  }
});

/* ---------------- 加载 / 保存 ---------------- */

async function reload() {
  form.value = buildInitForm();
  loading.value = true;
  try {
    const [dirRes] = await Promise.all([listDirectory().catch(() => null)]);
    directories.value = dirRes?.data ?? [];
    if (isEdit.value) {
      const { data } = await getDirectory(props.directoryId as string | number);
      form.value = {
        id: data.id,
        parentId: data.parentId,
        directoryName: data.directoryName,
        sort: data.sort,
        remark: data.remark
      };
    } else if (props.preset?.directoryId != null) {
      form.value.parentId = props.preset.directoryId;
    }
    await nextTick();
    markBaseline();
  } finally {
    loading.value = false;
  }
}

onMounted(reload);
watch(() => props.directoryId, reload);

/** 换父目录再次「新建目录」：脏草稿就地预填父目录不打断输入；干净态整表复位 */
watch(
  () => props.preset?.directoryId,
  (val, old) => {
    if (val === old) {
      return;
    }
    if (dirty.value) {
      form.value.parentId = val ?? 0;
      return;
    }
    void reload();
  }
);

function handleSubmit() {
  formRef.value?.validate(async (valid: boolean) => {
    if (!valid) {
      return;
    }
    const isNew = form.value.id == null;
    submitting.value = true;
    try {
      if (isNew) {
        await addDirectory({ ...form.value, parentId: form.value.parentId ?? 0 });
        ElMessage.success('目录已创建');
        markBaseline();
      } else {
        await updateDirectory({ ...form.value, id: form.value.id });
        ElMessage.success('目录已更新');
        markBaseline();
      }
      emit('saved', isNew);
    } finally {
      submitting.value = false;
    }
  });
}

defineExpose({ reload });
</script>

<style lang="scss" scoped>
.dir-body {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: var(--el-bg-color, #fff);
}

.dir-body__head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
}

.dir-body__title-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.dir-body__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--el-text-color-primary, #1d2129);
}

.dir-body__name {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dir-body__form {
  padding: 14px 20px 4px;
  flex: 1;
  overflow-y: auto;

  :deep(.el-form-item) {
    margin-bottom: 10px;
  }

  :deep(.el-form-item__label) {
    padding-bottom: 4px;
    font-weight: 500;
    color: var(--el-text-color-primary);
    line-height: 1.5;
  }
}

.dir-body__footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-top: 1px solid var(--el-border-color-lighter, #ebeef5);
}

.dir-body__spacer {
  flex: 1;
}

.dir-body__dirty {
  font-size: 12px;
  color: var(--el-color-warning, #e6a23c);
}
</style>
