<template>
  <aside class="chain-tree">
    <!--
      链路树（链路工作台最右栏，对标组件工作台 ComponentTree）：
      目录树来自后端平表（databus_chain_directory，全量无分页）前端组树；链路按 directory_id 挂目录，
      查无目录/为空挂尾部「未归组」虚拟节点。点链路=中栏开画布 tab；右键=节点操作菜单。

      与 ComponentTree 同为 el-tree 方案（:data 嵌套 + :indent=0 + 层级竖线），
      区别在数据源是两个端点（目录平表 + 链路全量）前端合树，目录 CRUD 对话框内置本组件。
    -->
    <div class="chain-tree__head">
      <span class="chain-tree__title">链路</span>
      <span class="chain-tree__count">{{ chains.length }}</span>
      <span class="chain-tree__tools">
        <el-tooltip content="新建根目录" placement="bottom">
          <button
            v-hasPermi="['databus:chain:directory:add']"
            class="chain-tree__tool"
            type="button"
            @click="openDirectoryDialog('add')"
          >
            <SvgIcon icon-class="lucide:plus" />
          </button>
        </el-tooltip>
        <el-tooltip content="刷新" placement="bottom">
          <button class="chain-tree__tool" type="button" @click="reload()">
            <SvgIcon icon-class="lucide:refresh-cw" />
          </button>
        </el-tooltip>
      </span>
    </div>

    <div class="chain-tree__filter">
      <el-input v-model="keyword" placeholder="搜索目录/链路" clearable size="small">
        <template #prefix><SvgIcon icon-class="lucide:search" /></template>
      </el-input>
    </div>

    <div v-loading="loading" class="chain-tree__body">
      <el-empty v-if="!loading && treeData.length === 0" description="暂无链路" :image-size="64" />
      <el-tree
        v-else
        ref="treeRef"
        :data="treeData"
        node-key="id"
        :props="TREE_PROPS"
        :indent="0"
        default-expand-all
        :expand-on-click-node="false"
        :filter-node-method="filterNode"
        highlight-current
        class="chain-tree__el"
        @node-click="onNodeClick"
        @node-contextmenu="onNodeContextMenu"
      >
        <template #default="{ data }">
          <span class="tree-node" :title="tipOf(data)">
            <SvgIcon class="tree-node__icon" :icon-class="iconOf(data)" />
            <span class="tree-node__label">{{ data.label }}</span>
            <span v-if="data.type === 'chain'" class="tree-node__tail">
              <span class="tree-node__dot" :class="dotClass(data)" />
            </span>
          </span>
        </template>
      </el-tree>
    </div>

    <ChainTreeContextMenu
      :menu="menu"
      @close="menu.visible = false"
      @command="onMenuCommand"
      @copy="onCopyCode"
    />

    <!-- 目录新增/编辑（同名/换父成环由后端校验兜底） -->
    <el-dialog
      v-model="dirDialog.visible"
      :title="dirDialog.mode === 'add' ? '新建目录' : '编辑目录'"
      width="480px"
      append-to-body
    >
      <el-form ref="dirFormRef" :model="dirDialog.form" :rules="dirRules" label-width="80px">
        <el-form-item label="目录名" prop="directoryName">
          <el-input
            v-model="dirDialog.form.directoryName"
            maxlength="100"
            show-word-limit
            placeholder="目录名"
          />
        </el-form-item>
        <el-form-item label="父目录" prop="parentId">
          <el-tree-select
            v-model="dirDialog.form.parentId"
            :data="dirOptions"
            node-key="value"
            check-strictly
            default-expand-all
            style="width: 100%"
            placeholder="根目录"
          />
        </el-form-item>
        <el-form-item label="排序号" prop="sort">
          <el-input-number v-model="dirDialog.form.sort" :min="0" :max="9999" controls-position="right" />
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input
            v-model="dirDialog.form.remark"
            type="textarea"
            :rows="2"
            maxlength="500"
            show-word-limit
            placeholder="选填"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dirDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="dirDialog.saving" @click="submitDirectory">确定</el-button>
      </template>
    </el-dialog>

    <!-- 链路移动归属：选 0=移出为未归组 -->
    <el-dialog v-model="moveDialog.visible" title="移动链路到目录" width="480px" append-to-body>
      <div class="chain-move">
        <div class="chain-move__name">{{ moveDialog.chainName }}</div>
        <div class="chain-move__from">{{ moveDialog.fromLabel }}</div>
        <el-tree-select
          v-model="moveDialog.target"
          :data="moveOptions"
          node-key="value"
          check-strictly
          default-expand-all
          style="width: 100%"
          placeholder="选择目标目录"
        />
      </div>
      <template #footer>
        <el-button @click="moveDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="moveDialog.saving" @click="submitMove">确定</el-button>
      </template>
    </el-dialog>
  </aside>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import {
  addChainDirectory,
  delChainDirectory,
  listChainDirectory,
  moveChainToDirectory,
  updateChainDirectory
} from '@/api/databus/chainDirectory';
import type { ChainDirectoryVo } from '@/api/databus/chainDirectory/types';
import { listChain } from '@/api/databus/chain';
import type { DatabusChainVo } from '@/api/databus/chain/types';
import { useLucideSubset } from '../../../workbench/composables/useLucideSubset';
import type { ChainTreeMenuCommand, ChainTreeMenuState, ChainTreeNode } from '../workbench.types';
import ChainTreeContextMenu from './ChainTreeContextMenu.vue';

defineOptions({ name: 'ChainTree' });

const props = defineProps<{
  /** 中栏当前画布的链路（树上高亮 current） */
  activeChainId?: DatabusChainVo['id'] | null;
}>();

const emit = defineEmits<{
  (e: 'open', chainId: DatabusChainVo['id'], chainName: string): void;
}>();

useLucideSubset();

/* ---------------- 数据加载与组树 ---------------- */

const TREE_PROPS = { children: 'children', label: 'label' } as const;

const directories = ref<ChainDirectoryVo[]>([]);
const chains = ref<DatabusChainVo[]>([]);
const loading = ref(false);
const keyword = ref('');

/** el-tree 实例的最小结构化类型（避免深路径 import 内部类型） */
interface TreeInstance {
  setCurrentKey: (key: string | null) => void;
  filter: (value: string) => void;
  getNode: (
    key: string
  ) => { expanded: boolean; collapse: () => void; expand: () => void } | undefined;
}
const treeRef = ref<TreeInstance>();

/**
 * 双端点合树：目录平表（已按 sort 序返回）+ 链路全量（排除模板）。
 * 失败静默（request 拦截器已 toast），树保持旧数据。
 */
async function reload() {
  loading.value = true;
  try {
    const [dirRes, chainRes] = await Promise.all([
      listChainDirectory(),
      listChain({ pageNum: 1, pageSize: 9999, isTemplate: '0' })
    ]);
    directories.value = dirRes.data ?? [];
    chains.value = chainRes.data?.rows ?? [];
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false;
  }
}

void reload();

/**
 * 平表组树：目录两遍扫描（先全建节点再挂父子，孤儿挂根）；
 * 链路按 directoryId 分桶后按名称序挂入目录尾部；未归组链路（含归属目录已删的）
 * 统一挂「未归组」虚拟节点，仅在有未归组链路时出现。
 */
const treeData = computed<ChainTreeNode[]>(() => {
  const allDirIds = new Set(directories.value.map((d) => String(d.id)));
  const nodeMap = new Map<string, ChainTreeNode>();
  for (const d of directories.value) {
    nodeMap.set(String(d.id), {
      id: `dir:${d.id}`,
      type: 'directory',
      label: d.directoryName,
      directoryId: d.id,
      chainId: '',
      children: []
    });
  }

  const roots: ChainTreeNode[] = [];
  for (const d of directories.value) {
    const node = nodeMap.get(String(d.id))!;
    const pid = String(d.parentId);
    // parentId=0 或指向已删目录（孤儿）都挂根，保证目录永不丢
    if (pid === '0' || !allDirIds.has(pid)) {
      roots.push(node);
    } else {
      nodeMap.get(pid)!.children.push(node);
    }
  }

  const ungrouped: ChainTreeNode[] = [];
  const buckets = new Map<string, ChainTreeNode[]>();
  for (const c of chains.value) {
    const node: ChainTreeNode = {
      id: `chain:${c.id}`,
      type: 'chain',
      label: c.chainName,
      directoryId: c.directoryId ?? null,
      chainId: c.id,
      chainCode: c.chainCode,
      status: c.status,
      children: []
    };
    const dirKey = c.directoryId == null ? '' : String(c.directoryId);
    if (dirKey && nodeMap.has(dirKey)) {
      const bucket = buckets.get(dirKey) ?? [];
      bucket.push(node);
      buckets.set(dirKey, bucket);
    } else {
      ungrouped.push(node);
    }
  }

  for (const [dirKey, bucket] of buckets) {
    bucket.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
    nodeMap.get(dirKey)!.children.push(...bucket);
  }

  if (ungrouped.length) {
    ungrouped.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
    roots.push({
      id: 'ungrouped',
      type: 'ungrouped',
      label: '未归组',
      directoryId: null,
      chainId: '',
      children: ungrouped
    });
  }
  return roots;
});

/* ---------------- 交互 ---------------- */

function filterNode(value: string, data: ChainTreeNode): boolean {
  if (!value) return true;
  return data.label.toLowerCase().includes(value.toLowerCase());
}

watch(keyword, (v) => treeRef.value?.filter(v));

function onNodeClick(data: ChainTreeNode) {
  if (data.type === 'chain') {
    emit('open', data.chainId, data.label);
    return;
  }
  // 目录/未归组：手动 toggle 展开（expand-on-click-node=false，点击不与选中冲突）
  const tn = treeRef.value?.getNode(data.id);
  if (tn) {
    tn.expanded ? tn.collapse() : tn.expand();
  }
}

// 外部（中栏关 tab）变化时同步树高亮
watch(
  () => props.activeChainId,
  (id) => {
    treeRef.value?.setCurrentKey(id == null ? null : `chain:${String(id)}`);
  },
  { immediate: true }
);

/* ---------------- 右键菜单 ---------------- */

const menu = ref<ChainTreeMenuState>({ visible: false, x: 0, y: 0, node: null });

/** 菜单尺寸估值，贴边夹取（树在最右栏，不夹取会溢出视口） */
const MENU_W = 176;
const MENU_H = 200;

function onNodeContextMenu(event: MouseEvent, data: ChainTreeNode) {
  event.preventDefault();
  if (data.type === 'ungrouped') return; // 虚拟节点无目录操作
  const x = Math.max(8, Math.min(event.clientX, window.innerWidth - MENU_W - 8));
  const y = Math.max(8, Math.min(event.clientY, window.innerHeight - MENU_H - 8));
  menu.value = { visible: true, x, y, node: data };
}

async function onCopyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code);
    ElMessage.success(`已复制链路编码：${code}`);
  } catch {
    ElMessage.warning('复制失败，请手动选择文本复制');
  }
}

function onMenuCommand(command: ChainTreeMenuCommand, node: ChainTreeNode) {
  switch (command) {
    case 'open-chain':
      emit('open', node.chainId, node.label);
      break;
    case 'move-chain':
      openMoveDialog(node);
      break;
    case 'add-child':
      openDirectoryDialog('add', node.directoryId);
      break;
    case 'rename':
      openDirectoryDialog('edit', node.directoryId);
      break;
    case 'remove-directory':
      removeDirectory(node);
      break;
  }
}

/* ---------------- 目录新增/编辑 ---------------- */

interface DirectoryFormState {
  id?: string | number;
  parentId: string | number;
  directoryName: string;
  sort: number;
  remark?: string;
}

const dirDialog = reactive<{
  visible: boolean;
  mode: 'add' | 'edit';
  saving: boolean;
  form: DirectoryFormState;
}>({
  visible: false,
  mode: 'add',
  saving: false,
  form: { parentId: 0, directoryName: '', sort: 0, remark: '' }
});

const dirFormRef = ref<FormInstance>();

const dirRules: FormRules = {
  directoryName: [
    { required: true, message: '目录名不能为空', trigger: 'blur' },
    { max: 100, message: '目录名不超过 100 字', trigger: 'blur' }
  ]
};

/** 目录下拉树选项（value=0 为根哨兵）；编辑模式剔除自身子树防选环 */
interface DirOption {
  value: string | number;
  label: string;
  children: DirOption[];
}

function buildDirOptions(parentId: string | number, excluded: Set<string>): DirOption[] {
  return directories.value
    .filter(
      (d) =>
        String(d.parentId) === String(parentId) &&
        !excluded.has(String(d.id))
    )
    .map((d) => ({
      value: d.id,
      label: d.directoryName,
      children: buildDirOptions(d.id, excluded)
    }));
}

/** 平表闭包求子孙集合（含自身），用于编辑模式下剔除自身子树 */
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
    dirDialog.mode === 'edit' && dirDialog.form.id != null
      ? subtreeIds(String(dirDialog.form.id))
      : new Set<string>();
  return [{ value: 0, label: '根目录', children: buildDirOptions(0, excluded) }];
});

function openDirectoryDialog(mode: 'add' | 'edit', parentId?: string | number | null) {
  dirDialog.mode = mode;
  if (mode === 'add') {
    dirDialog.form = {
      parentId: parentId ?? 0,
      directoryName: '',
      sort: 0,
      remark: ''
    };
  } else {
    const d = directories.value.find((x) => String(x.id) === String(parentId));
    if (!d) return;
    dirDialog.form = {
      id: d.id,
      parentId: d.parentId,
      directoryName: d.directoryName,
      sort: d.sort,
      remark: d.remark
    };
  }
  dirDialog.visible = true;
}

async function submitDirectory() {
  const valid = await dirFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  dirDialog.saving = true;
  try {
    if (dirDialog.mode === 'add') {
      await addChainDirectory({ ...dirDialog.form, parentId: dirDialog.form.parentId ?? 0 });
      ElMessage.success('目录已创建');
    } else {
      await updateChainDirectory({ ...dirDialog.form, id: dirDialog.form.id });
      ElMessage.success('目录已更新');
    }
    dirDialog.visible = false;
    await reload();
  } catch {
    /* 拦截器已提示 */
  } finally {
    dirDialog.saving = false;
  }
}

async function removeDirectory(node: ChainTreeNode) {
  try {
    await ElMessageBox.confirm(
      `删除目录「${node.label}」？仅当目录下无子目录且无挂链时可删。`,
      '删除目录',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    );
  } catch {
    return; // 用户取消
  }
  try {
    await delChainDirectory(node.directoryId as string | number);
    ElMessage.success('目录已删除');
    await reload();
  } catch {
    /* 拦截器已提示（后端有子目录/挂链双拦截） */
  }
}

/* ---------------- 链路移动归属 ---------------- */

const moveDialog = reactive<{
  visible: boolean;
  saving: boolean;
  chainId: DatabusChainVo['id'];
  chainName: string;
  fromLabel: string;
  target: string | number;
}>({
  visible: false,
  saving: false,
  chainId: '',
  chainName: '',
  fromLabel: '',
  target: 0
});

const moveOptions = computed<DirOption[]>(() => [
  { value: 0, label: '未归组', children: buildDirOptions(0, new Set<string>()) }
]);

function openMoveDialog(node: ChainTreeNode) {
  const dir = directories.value.find((d) => String(d.id) === String(node.directoryId));
  moveDialog.chainId = node.chainId;
  moveDialog.chainName = node.label;
  moveDialog.fromLabel = `当前归属：${dir ? dir.directoryName : '未归组'}`;
  moveDialog.target = dir ? dir.id : 0;
  moveDialog.visible = true;
}

async function submitMove() {
  moveDialog.saving = true;
  try {
    const target = moveDialog.target;
    await moveChainToDirectory({
      chainId: moveDialog.chainId,
      directoryId: target === 0 || target === '0' ? null : target
    });
    ElMessage.success('链路归属已更新');
    moveDialog.visible = false;
    await reload();
  } catch {
    /* 拦截器已提示 */
  } finally {
    moveDialog.saving = false;
  }
}

/* ---------------- 渲染辅助 ---------------- */

function iconOf(data: ChainTreeNode): string {
  if (data.type === 'chain') {
    return 'lucide:spline';
  }
  if (data.type === 'ungrouped') {
    return 'lucide:boxes';
  }
  return 'lucide:folder';
}

/** 链路状态色点：0草稿(橙) 1已发布(绿) 2已下线(灰蓝) */
const DOT_CLASS: Record<string, string> = {
  '0': 'is-draft',
  '1': 'is-published',
  '2': 'is-offline'
};

function dotClass(data: ChainTreeNode): string {
  return data.status ? (DOT_CLASS[data.status] ?? '') : '';
}

function tipOf(data: ChainTreeNode): string {
  return data.type === 'chain' && data.chainCode
    ? `${data.label}（${data.chainCode}）`
    : data.label;
}

defineExpose({ reload });
</script>

<style lang="scss" scoped>
.chain-tree {
  /* 层级竖线的缩进基准（el-tree 的 :indent 已置 0，缩进全由此变量承担） */
  --chain-tree-indent: 18px;

  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color, #fff);
  min-width: 0;

  &__head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 8px 8px 14px;
    flex-shrink: 0;
  }

  &__title {
    font-size: 13px;
    font-weight: 700;
    color: var(--el-text-color-primary, #1d2129);
  }

  &__count {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  &__tools {
    margin-left: auto;
    display: flex;
    gap: 2px;
  }

  &__tool {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
    background: transparent;
    border: none;
    border-radius: 5px;
    cursor: pointer;

    &:hover {
      color: var(--el-color-primary);
      background: var(--el-fill-color-light);
    }
  }

  &__filter {
    flex-shrink: 0;
    padding: 0 8px 6px;
  }

  &__body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 6px 12px;
  }
}

.chain-tree__el {
  --el-tree-node-hover-bg-color: var(--el-fill-color-light, #f5f7fa);

  :deep(.el-tree-node__content) {
    height: 30px;
    border-radius: 6px;
  }

  /* 层级竖线：缩进由 children 容器 padding 承担，竖线止于末行中心（同 ComponentTree） */
  :deep(.el-tree-node__children) {
    position: relative;
    padding-left: var(--chain-tree-indent);
  }

  :deep(.el-tree-node__children)::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 15px;
    left: 11px;
    width: 1px;
    background: var(--el-border-color-lighter);
  }

  :deep(.el-tree-node.is-current > .el-tree-node__content) {
    background: var(--el-color-primary-light-9, #ecf2ff);
  }
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
  font-size: 13px;

  &__icon {
    flex-shrink: 0;
    font-size: 14px;
    color: var(--el-text-color-secondary);
  }

  &__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--el-text-color-primary, #1d2129);
  }

  &__tail {
    margin-left: auto;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    padding-left: 6px;
  }

  /* 行尾状态色点（链路发布状态） */
  &__dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--el-text-color-secondary);

    &.is-draft {
      background: var(--el-color-warning, #e6a23c);
    }

    &.is-published {
      background: var(--el-color-success, #10b981);
    }

    &.is-offline {
      background: var(--el-color-info, #909399);
    }
  }
}

.chain-move {
  display: flex;
  flex-direction: column;
  gap: 10px;

  &__name {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  &__from {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}
</style>
