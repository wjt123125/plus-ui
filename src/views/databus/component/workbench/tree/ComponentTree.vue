<template>
  <aside class="cmp-tree">
    <!--
      组件树（工作台最右栏，对标 Trae / VS Code 资源管理器）：
      顶部三个虚拟节点（全部组件 / 异常件 / 最近访问），一级=物料面板分组（与流程编辑器物料树同源），
      business 组再下钻业务域（域字典来自后端 databus_component_domain），叶节点=组件。
      点节点=过滤「组件库」tab 的卡片范围；右键=节点操作菜单（§2.3）。
      栏内不再有「收起」按钮——侧栏开关收敛到页面级 WorkbenchHeader（§2.0）。

      装饰沿用 VS Code git decorations 惯例（§2.1）：图标只按台账 icon/color 渲染，不承担状态语义；
      名称颜色 + 右侧实心色点表示运行/发布状态，normal 态不显示色点；停用件淡灰 + 删除线、
      废弃件中灰；目录节点继承后代最高优先级状态色与色点；来源三态退到 tooltip。
    -->
    <div class="cmp-tree__head">
      <span class="cmp-tree__title">组件</span>
      <span class="cmp-tree__count">{{ rows.length }}</span>
    </div>
    <div v-loading="loading || taxonomyLoading" class="cmp-tree__body">
      <el-tree
        ref="treeRef"
        :data="treeData"
        node-key="id"
        :props="TREE_PROPS"
        :indent="0"
        :current-node-key="currentNodeKey"
        :default-expanded-keys="expandedKeys"
        :expand-on-click-node="false"
        highlight-current
        class="cmp-tree__el"
        @node-click="onNodeClick"
        @node-contextmenu="onNodeContextMenu"
        @node-expand="onNodeExpand"
        @node-collapse="onNodeCollapse"
      >
        <template #default="{ data }">
          <span class="tree-node" :title="data.tip">
            <SvgIcon
              class="tree-node__icon"
              :class="iconClass(data)"
              :icon-class="iconOf(data)"
              :style="iconStyle(data)"
            />
            <span class="tree-node__label" :class="data.statusClass">{{ data.label }}</span>
            <span v-if="data.badge != null || hasDot(data) || codeOf(data)" class="tree-node__tail">
              <span v-if="data.badge != null" class="tree-node__badge" :class="data.badgeClass">
                {{ data.badge }}
              </span>
              <span v-if="hasDot(data)" class="tree-node__dot" :class="data.statusClass" />
              <span v-if="codeOf(data)" class="tree-node__code" :class="data.statusClass">
                {{ codeOf(data) }}
              </span>
            </span>
          </span>
        </template>
      </el-tree>
    </div>

    <CmpTreeContextMenu
      :menu="menu"
      @close="menu.visible = false"
      @view="(row) => emit('view', row)"
      @edit="(row) => emit('edit', row)"
      @changes="(row) => emit('changes', row)"
      @toggle="(row, enabled) => emit('toggle', row, enabled)"
      @delete="(row) => emit('delete', row)"
      @add="(preset) => emit('add', preset)"
      @copy="onCopyCode"
    />
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { ComponentSource, ScriptRuntime } from '@/api/databus/component/types';
import { useComponentTaxonomy } from '../../../editor/composables/useComponentTaxonomy';
import { useLucideSubset } from '../../../workbench/composables/useLucideSubset';
import type { ComponentRegistryRow } from '../../model/registry';
import type {
  ComponentTreeNode,
  FormPreset,
  RecentComponent,
  TreeNodeStatus,
  TreeMenuState,
  TreeScope
} from '../workbench.types';
import CmpTreeContextMenu from './CmpTreeContextMenu.vue';

defineOptions({ name: 'ComponentTree' });

const props = defineProps<{
  rows: ComponentRegistryRow[];
  unhealthy: ScriptRuntime[];
  recent: RecentComponent[];
  scope: TreeScope;
  /** 本会话存在未保存草稿 tab 的组件编码（树上标橙色点） */
  dirtyCodes: string[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:scope', scope: TreeScope): void;
  (e: 'view', row: ComponentRegistryRow): void;
  (e: 'edit', row: ComponentRegistryRow): void;
  (e: 'changes', row: ComponentRegistryRow): void;
  (e: 'toggle', row: ComponentRegistryRow, enabled: boolean): void;
  (e: 'delete', row: ComponentRegistryRow): void;
  (e: 'add', preset?: FormPreset): void;
}>();

useLucideSubset();

const { groups, domains, loaded, error, defaultDomainKey } = useComponentTaxonomy();

/**
 * 域字典是独立端点、与 /options 不同批：字典未回来时 business 先渲两层，避免树「跳一下」（§2.2）。
 * 请求失败（error）后不再转圈——business 恒渲两层即为降级终态。
 */
const taxonomyLoading = computed(() => !loaded.value && !error.value);
/** 域字典可用才下钻；loaded 但为空数组（后端未 seed）同样退回两层，否则 business 组件会整组消失 */
const domainReady = computed(() => domains.value.length > 0);

const TREE_PROPS = { children: 'children', label: 'label' } as const;

const STATUS_RANK: Record<TreeNodeStatus, number> = {
  normal: 0,
  new: 1,
  deprecated: 2,
  disabled: 3,
  draft: 4,
  error: 5
};
const STATUS_CLASS: Record<TreeNodeStatus, string> = {
  normal: '',
  new: 'is-new',
  deprecated: 'is-deprecated',
  disabled: 'is-disabled',
  draft: 'is-draft',
  error: 'is-error'
};
const STATUS_TIP: Record<TreeNodeStatus, string> = {
  normal: '运行正常',
  new: '库存件尚未保存脚本工件（未发布）',
  deprecated: '已废弃，不建议在新链路使用',
  disabled: '已停用',
  draft: '本会话有未保存的改动',
  error: '启动期编译/注册失败，链路执行会报错'
};

/** el-tree 实例的最小结构化类型（避免深路径 import 内部类型） */
interface TreeInstance {
  setCurrentKey: (key: string | null) => void;
}

const treeRef = ref<TreeInstance>();
const expandedKeys = ref<string[]>([]);
const menu = ref<TreeMenuState>({ visible: false, x: 0, y: 0 });

const unhealthyCodes = computed(() => new Set(props.unhealthy.map((h) => h.componentCode)));
const dirtyCodeSet = computed(() => new Set(props.dirtyCodes));

function sourceLabel(source: ComponentSource): string {
  if (source === 'SYSTEM') {
    return '内置';
  }
  return source === 'OVERLAY' ? '治理覆盖' : '库存脚本件';
}

function statusOf(row: ComponentRegistryRow): TreeNodeStatus {
  if (unhealthyCodes.value.has(row.code)) {
    return 'error';
  }
  if (dirtyCodeSet.value.has(row.code)) {
    return 'draft';
  }
  if (row.disabled) {
    return 'disabled';
  }
  if (row.deprecated) {
    return 'deprecated';
  }
  // 「未发布」＝库存件还没保存过脚本工件。不能用 db.version 判：DDL 里 version 默认 1
  // 且 insertByBo 不显式写值，新建行拿到的就是 1 而非 null，该条件永假（曾导致 U 码全树不出现）。
  if (row.source === 'CUSTOM' && !row.scripted) {
    return 'new';
  }
  return 'normal';
}

function leafOf(row: ComponentRegistryRow): ComponentTreeNode {
  const status = statusOf(row);
  return {
    id: `c:${row.code}`,
    label: row.shortName || row.name,
    kind: 'leaf',
    row,
    icon: row.icon,
    color: row.color,
    status,
    statusClass: STATUS_CLASS[status],
    tip: `${sourceLabel(row.source)} · ${STATUS_TIP[status]}`
  };
}

/** 叶节点按展示名排序（目录节点顺序由字典 sort 决定，不参与此排序） */
function sortLeaves(leaves: ComponentTreeNode[]): ComponentTreeNode[] {
  return leaves.toSorted((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
}

/**
 * 目录节点：状态色与色点继承后代 STATUS_RANK 最高者（对齐 VS Code 文件夹装饰），
 * 计数徽标＝下辖叶子总数（business 组跨两层，不能用 children.length）。
 */
function dirNode(
  id: string,
  label: string,
  kind: 'group' | 'domain',
  children: ComponentTreeNode[],
  preset?: Pick<ComponentTreeNode, 'group' | 'domain'>
): ComponentTreeNode {
  let status: TreeNodeStatus = 'normal';
  let leaves = 0;
  for (const child of children) {
    if (STATUS_RANK[child.status ?? 'normal'] > STATUS_RANK[status]) {
      status = child.status ?? 'normal';
    }
    leaves += child.children ? countLeaves(child.children) : 1;
  }
  return {
    id,
    label,
    kind,
    ...preset,
    status,
    statusClass: STATUS_CLASS[status],
    badge: leaves,
    tip: status === 'normal' ? undefined : `目录内含${STATUS_TIP[status]}的组件`,
    children
  };
}

function countLeaves(nodes: ComponentTreeNode[]): number {
  return nodes.reduce((n, c) => n + (c.children ? countLeaves(c.children) : 1), 0);
}

/** business 组下钻三层：分段全部来自域字典，前端无本地分段表（§2.2） */
function businessNode(rows: ComponentRegistryRow[]): ComponentTreeNode {
  const children = domains.value
    .map((d) => {
      // domain 为空的件归兜底域；slot 域由后端按 node_type 派生，前端只按字符串分桶
      const bucket = rows.filter((r) => (r.domain || defaultDomainKey.value) === d.key);
      return bucket.length
        ? dirNode(`d:${d.key}`, d.label, 'domain', sortLeaves(bucket.map(leafOf)), {
            group: 'business',
            domain: d.key
          })
        : undefined;
    })
    .filter((n): n is ComponentTreeNode => !!n);
  return dirNode('g:business', groupLabel('business'), 'group', children, { group: 'business' });
}

function groupLabel(key: string): string {
  return groups.value.find((g) => g.key === key)?.label ?? key;
}

const treeData = computed<ComponentTreeNode[]>(() => {
  const nodes: ComponentTreeNode[] = [
    { id: 'all', label: '全部组件', kind: 'virtual', badge: props.rows.length, tip: '不按范围过滤' },
    {
      id: 'unhealthy',
      label: '异常件',
      kind: 'virtual',
      badge: props.unhealthy.length || undefined,
      badgeClass: props.unhealthy.length ? 'is-danger' : '',
      tip: '启动期编译/注册失败的库存脚本件'
    },
    {
      id: 'recent',
      label: '最近访问',
      kind: 'virtual',
      badge: props.recent.length || undefined,
      tip: '本机最近打开过的组件'
    }
  ];

  // 分组来自后端字典（paletteGroups 同一个 shallowRef），只挂有组件的组；其余六组恒无 domain，保持两层
  for (const g of groups.value) {
    const members = props.rows.filter((r) => r.group === g.key);
    if (!members.length) {
      continue;
    }
    if (g.key === 'business' && domainReady.value) {
      nodes.push(businessNode(members));
      continue;
    }
    nodes.push(
      dirNode(`g:${g.key}`, g.label, 'group', sortLeaves(members.map(leafOf)), { group: g.key })
    );
  }
  const ungrouped = props.rows.filter((r) => !r.group);
  if (ungrouped.length) {
    nodes.push(dirNode('g:__ungrouped', '未分组', 'group', sortLeaves(ungrouped.map(leafOf))));
  }
  return nodes;
});

/** scope → el-tree current key */
const currentNodeKey = computed(() => {
  const s = props.scope;
  if (s.kind === 'group') {
    return `g:${s.key}`;
  }
  if (s.kind === 'domain') {
    return `d:${s.key}`;
  }
  if (s.kind === 'code') {
    return `c:${s.code}`;
  }
  return s.kind;
});

function onNodeClick(data: ComponentTreeNode) {
  if (data.kind === 'leaf' && data.row) {
    emit('update:scope', { kind: 'code', code: data.row.code });
    return;
  }
  if (data.kind === 'domain' || data.kind === 'group') {
    const key = data.id.slice(2);
    emit('update:scope', data.kind === 'domain' ? { kind: 'domain', key } : { kind: 'group', key });
    return;
  }
  if (data.id === 'all') {
    emit('update:scope', { kind: 'all' });
  } else if (data.id === 'unhealthy') {
    emit('update:scope', { kind: 'unhealthy' });
  } else if (data.id === 'recent') {
    emit('update:scope', { kind: 'recent' });
  }
}

/* ---------------- 右键菜单（§2.3） ---------------- */

/** 菜单尺寸估值，用于贴边翻转——树在最右栏，不夹取会频繁溢出视口 */
const MENU_W = 176;
/** 最长的一套是叶子菜单：6 项 + 2 分隔线 + 容器 padding */
const MENU_H = 220;

/**
 * el-tree 的 node-contextmenu 只由鼠标触发；TouchEvent 分支取触点坐标仅为类型完整
 * 与长按兜底（范式同 editor/components/canvas/CmpContextMenu.vue）。
 */
function getEventClientPos(event: MouseEvent | TouchEvent): { x: number; y: number } {
  if ('clientX' in event) {
    return { x: event.clientX, y: event.clientY };
  }
  const touch = event.touches[0] ?? event.changedTouches[0];
  return { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 };
}

function onNodeContextMenu(event: MouseEvent | TouchEvent, data: ComponentTreeNode) {
  event.preventDefault();
  const { x, y } = getEventClientPos(event);
  menu.value = {
    visible: true,
    x: Math.max(8, Math.min(x, window.innerWidth - MENU_W - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - MENU_H - 8)),
    node: data
  };
}

function onNodeExpand(data: ComponentTreeNode) {
  if (!expandedKeys.value.includes(data.id)) {
    expandedKeys.value = [...expandedKeys.value, data.id];
  }
}

function onNodeCollapse(data: ComponentTreeNode) {
  expandedKeys.value = expandedKeys.value.filter((k) => k !== data.id);
}

async function onCopyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code);
    ElMessage.success(`已复制组件编码：${code}`);
  } catch {
    ElMessage.warning('复制失败，请手动选择文本复制');
  }
}

/* ---------------- 渲染辅助 ---------------- */

function iconOf(data: ComponentTreeNode): string {
  if (data.kind === 'leaf') {
    return data.icon || 'lucide:box';
  }
  if (data.id === 'all') {
    return 'lucide:boxes';
  }
  if (data.id === 'unhealthy') {
    return 'lucide:circle-alert';
  }
  if (data.id === 'recent') {
    return 'lucide:clock';
  }
  return 'lucide:folder';
}

function iconClass(data: ComponentTreeNode): string {
  return data.id === 'unhealthy' ? 'is-alarm' : '';
}

/** 只有叶子按台账 color 着色；目录/虚拟节点走 CSS 的中性色（图标不承担状态语义） */
function iconStyle(data: ComponentTreeNode) {
  return data.kind === 'leaf' && data.color ? { color: data.color } : undefined;
}

/** normal 态不显示色点，避免满树绿点噪音（§2.1） */
function hasDot(data: ComponentTreeNode): boolean {
  return !!data.status && data.status !== 'normal';
}

/**
 * 叶子状态字母码（对齐 Trae 文件树的 M/U 标识，补色点在小尺寸/色觉场景的短板，§2.1 修订）。
 * 目录不挂字母码——聚合色点已表达「组内最差」，再挂码会和计数徽标挤在一起。
 */
const STATUS_CODE: Record<TreeNodeStatus, string> = {
  normal: '',
  new: 'U',
  draft: 'M',
  error: 'E',
  disabled: 'X',
  deprecated: 'D'
};

function codeOf(data: ComponentTreeNode): string {
  return data.kind === 'leaf' && data.status ? STATUS_CODE[data.status] : '';
}

// 外部（AI 钩子/删除后）改 scope 时同步树高亮
watch(
  currentNodeKey,
  (key) => {
    treeRef.value?.setCurrentKey?.(key);
  },
  { immediate: true }
);
</script>

<style lang="scss" scoped>
.cmp-tree {
  /* 层级竖线的缩进基准：el-tree 的 :indent 已置 0，缩进全由此变量承担 */
  --cmp-tree-indent: 18px;

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

  &__body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 6px 12px;
  }
}

.cmp-tree__el {
  --el-tree-node-hover-bg-color: var(--el-fill-color-light, #f5f7fa);

  :deep(.el-tree-node__content) {
    height: 30px;
    border-radius: 6px;
  }

  /*
    层级竖线（indent guides）：el-tree 无原生支持。
    缩进改由 .el-tree-node__children 的 padding 承担（:indent="0" 让行内容不再吃 inline padding-left），
    于是每层容器都相对父层内缩，::before 的 left 天然落在父节点展开箭头下方，混合深度自动逐级延伸。
    bottom 收 15px（行高 30px 的一半）让竖线止于末行中心，不多画一截。
  */
  :deep(.el-tree-node__children) {
    position: relative;
    padding-left: var(--cmp-tree-indent);
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

    &.is-alarm {
      color: var(--el-color-danger, #f56c6c);
    }
  }

  &__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--el-text-color-primary, #1d2129);

    /* 状态色＝运行/发布状态（VS Code git decorations 惯例） */
    &.is-error {
      color: var(--el-color-danger, #f56c6c);
    }

    &.is-draft {
      color: var(--el-color-warning, #e6a23c);
    }

    &.is-new {
      color: var(--el-color-success, #10b981);
    }

    /* 停用与废弃原本同为 #a8abb2，改色点后必须拉开灰阶（§2.1） */
    &.is-disabled {
      color: #c0c4cc;
      text-decoration: line-through;
    }

    &.is-deprecated {
      color: #909399;
    }
  }

  &__tail {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    padding-left: 6px;
  }

  /* 右侧实心色点：与名称同色，替代原单字母徽标 !/M/N；版本号一并废除 */
  &__dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--el-text-color-secondary);

    &.is-error {
      background: var(--el-color-danger, #f56c6c);
    }

    &.is-draft {
      background: var(--el-color-warning, #e6a23c);
    }

    &.is-new {
      background: var(--el-color-success, #10b981);
    }

    &.is-disabled {
      background: #c0c4cc;
    }

    &.is-deprecated {
      background: #909399;
    }
  }

  /* 字母码：色点的第二通道，同色；定宽保证 M/U/E/X/D 不抖动行尾 */
  &__code {
    flex-shrink: 0;
    width: 10px;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    text-align: center;
    color: var(--el-text-color-secondary);

    &.is-error {
      color: var(--el-color-danger, #f56c6c);
    }

    &.is-draft {
      color: var(--el-color-warning, #e6a23c);
    }

    &.is-new {
      color: var(--el-color-success, #10b981);
    }

    &.is-disabled {
      color: #c0c4cc;
    }

    &.is-deprecated {
      color: #909399;
    }
  }

  &__badge {
    flex-shrink: 0;
    min-width: 18px;
    padding: 0 5px;
    border-radius: 9px;
    font-size: 11px;
    line-height: 16px;
    text-align: center;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color, #f0f2f5);

    &.is-danger {
      color: #fff;
      background: var(--el-color-danger, #f56c6c);
    }
  }
}
</style>
