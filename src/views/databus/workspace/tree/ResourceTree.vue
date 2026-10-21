<template>
  <aside class="res-tree">
    <!--
      统一资源树（工作区右抽屉「资源」tab 内容，workbench-unification.md §2.2）。
      五个 section 自上而下：我的收藏 / 最近访问 / 目录树（顶级平铺 + 未归组）/ 系统组件（只读虚拟根，按 group 二级）。
      filetype 心智：链路与组件＝文件类型（叶子 icon 区分），目录＝树的唯一组织轴（叶子混装链路与自建组件）。
      数据源：目录 /list + 链路 /list（isTemplate=0）+ 组件台账（宿主 props.rows）+ 收藏 /list + 最近访问（localStorage）。
      交互：容器单击展开/收起、叶子单击打开、叶子右键派发、链路/组件叶子 hover 星标一键收藏、叶子/目录可拖入目录换归属。
      筛选（2026-10-18 中栏无网格）：树是全工作区唯一资源导航 + 筛选面——
      头部搜索框按 名称/编码/短名/标签 过滤节点（真筛选）；启动期异常件在树头警示条与叶子 E 字母码双呈现。
      装饰（VS Code git decorations 惯例）：行尾色点承担生命周期（草稿/已发布/已下线），
      字母码承担装饰（E 异常/M 会话脏/D 废弃）可与色点并存；目录色点继承后代最差生命周期。
    -->
    <div class="res-tree__head">
      <span class="res-tree__tools">
        <el-tooltip content="新建链路" placement="bottom">
          <button
            v-hasPermi="['databus:editor:add']"
            class="res-tree__tool"
            type="button"
            @click="emit('add-chain', null)"
          >
            <SvgIcon icon-class="lucide:file-plus" />
          </button>
        </el-tooltip>
        <el-tooltip content="新建根目录" placement="bottom">
          <button
            v-hasPermi="['databus:directory:add']"
            class="res-tree__tool"
            type="button"
            @click="emit('add-directory')"
          >
            <SvgIcon icon-class="lucide:plus" />
          </button>
        </el-tooltip>
        <el-tooltip content="刷新" placement="bottom">
          <button class="res-tree__tool" type="button" @click="reload()">
            <SvgIcon icon-class="lucide:refresh-cw" />
          </button>
        </el-tooltip>
      </span>
    </div>

    <div class="res-tree__filter">
      <el-input v-model="keyword" placeholder="搜索名称 / 编码 / 标签" clearable size="small">
        <template #prefix><SvgIcon icon-class="lucide:search" /></template>
      </el-input>
    </div>

    <!-- 启动期编译/注册失败的库存脚本件警示条（原组件库网格顶部红条搬入树）；点条目直达该叶子 -->
    <div v-if="unhealthy?.length" class="res-tree__health">
      <div class="res-tree__health-head">
        <SvgIcon icon-class="lucide:circle-alert" />
        <span>{{ unhealthy.length }} 个脚本件启动期失败</span>
      </div>
      <div class="res-tree__health-list">
        <button
          v-for="h in unhealthy"
          :key="h.componentId"
          type="button"
          class="res-tree__health-item"
          :title="h.error"
          @click="focusSection(`cmp:${h.componentCode}`)"
        >
          <el-tag size="small" type="danger" effect="plain">{{ h.componentCode }}</el-tag>
          <span class="res-tree__health-msg">{{ h.error }}</span>
        </button>
      </div>
    </div>

    <div ref="bodyRef" v-loading="loading || localLoading" class="res-tree__body">
      <el-empty
        v-if="!loading && !localLoading && !treeData.length"
        description="暂无资源"
        :image-size="64"
      />
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
        draggable
        :allow-drag="allowDrag"
        :allow-drop="allowDrop"
        class="res-tree__el"
        @node-click="onNodeClick"
        @node-contextmenu="onNodeContextMenu"
        @node-drop="onNodeDrop"
      >
        <template #default="{ data }">
          <span class="tree-node" :title="tipOf(data)">
            <!-- 链路类叶子（含收藏/最近里的链路条目）统一用确定性字母头像；模板靠分组区分身份 -->
            <span
              v-if="isAvatarNode(data)"
              class="tree-node__avatar"
              :style="avatarStyle(data)"
            >
              {{ avatarLetter(data) }}
            </span>
            <SvgIcon
              v-else
              class="tree-node__icon"
              :class="iconClass(data)"
              :icon-class="iconOf(data)"
              :style="iconStyle(data)"
            />
            <span class="tree-node__label" :class="labelClass(data)">{{ data.label }}</span>
            <span class="tree-node__tail">
              <span
                v-if="data.lifecycle"
                class="tree-node__dot"
                :class="`is-${data.lifecycle}`"
              />
              <span v-if="data.marks?.length" class="tree-node__mark" :class="markClass(data)">
                {{ markText(data) }}
              </span>
              <span v-if="data.badge" class="tree-node__badge">{{ data.badge }}</span>
              <button
                v-if="canFav(data)"
                type="button"
                class="tree-node__star"
                :class="{ 'is-on': data.favorited }"
                :title="data.favorited ? '取消收藏' : '收藏'"
                @click.stop="toggleFav(data)"
              >
                <SvgIcon :icon-class="data.favorited ? 'lucide:star' : 'lucide:star-off'" />
              </button>
            </span>
          </span>
        </template>
      </el-tree>
    </div>

    <ResourceTreeContextMenu
      :menu="menu"
      @close="menu.visible = false"
      @command="onMenuCommand"
      @copy="onCopyCode"
    />

    <!-- 目录编辑抽屉（重命名薄壳）：表单体与新建向导 create tab 共用 DirectoryFormBody（2026-10-21 新建路径已收敛到向导 tab） -->
    <el-drawer
      v-model="renameDialog.visible"
      direction="rtl"
      size="520px"
      append-to-body
      destroy-on-close
      :with-header="false"
      :close-on-click-modal="true"
      class="res-tree__rename"
    >
      <DirectoryFormBody
        :directory-id="renameDialog.directoryId"
        @saved="onDirectorySaved"
        @cancel="renameDialog.visible = false"
      />
    </el-drawer>

    <!-- 归属移动：链路/自建组件通用（选 0=移出为未归组） -->
    <el-dialog v-model="moveDialog.visible" title="移动到目录" width="480px" append-to-body>
      <div class="res-move">
        <div class="res-move__name">{{ moveDialog.name }}</div>
        <div class="res-move__from">{{ moveDialog.fromLabel }}</div>
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
import { computed, nextTick, reactive, ref, watch, type CSSProperties } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { listChain } from '@/api/databus/chain';
import type { DatabusChainVo } from '@/api/databus/chain/types';
import type { ComponentSource, ScriptRuntime } from '@/api/databus/component/types';
import {
  delDirectory,
  listDirectory,
  moveChainToDirectory,
  moveComponentToDirectory,
  updateDirectory
} from '@/api/databus/directory';
import type { DirectoryVo } from '@/api/databus/directory/types';
import type { FavoriteResourceType, FavoriteVo } from '@/api/databus/favorite/types';
import { groupLabel } from '@/views/databus/component/model/labels';
import type { ComponentRegistryRow } from '@/views/databus/component/model/registry';
import { useComponentTaxonomy } from '@/views/databus/editor/composables/useComponentTaxonomy';
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';
import { useFavorites } from '../composables/useFavorites';
import type {
  FormPreset,
  RecentResource,
  ResourceLifecycle,
  ResourceMark,
  ResourceMenuCommand,
  ResourceMenuState,
  ResourceTreeNode
} from '../workbench.types';
import ResourceTreeContextMenu from './ResourceTreeContextMenu.vue';
import DirectoryFormBody from '../panel/DirectoryFormBody.vue';

defineOptions({ name: 'ResourceTree' });

const props = defineProps<{
  /** 组件台账全量合流行（宿主提供）：自建叶取 db 行，系统虚拟根取 source=SYSTEM 行 */
  rows: ComponentRegistryRow[];
  /** 最近访问条目（宿主持有 localStorage 单例，避免双写冲突） */
  recent: RecentResource[];
  /** 本会话存在未保存草稿 tab 的组件编码（自建叶标橙点） */
  dirtyCodes?: string[];
  /** 启动期编译/注册失败的库存脚本件（自建叶标 E 字母码 + 树头警示条） */
  unhealthy?: ScriptRuntime[];
  /** 当前激活画布的链路（树高亮 current） */
  activeChainId?: DatabusChainVo['id'] | null;
  /** 当前激活 tab 的组件编码（detail/form/changes；树高亮 current） */
  activeCode?: string | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  /** 新建链路（头部钮=null 未归组；目录右键=该目录 id） */
  (e: 'add-chain', directoryId: string | number | null): void;
  /** 新建目录（头部钮=根级无 preset；目录右键=在该目录下建子目录）——宿主开向导 tab directory 段 */
  (e: 'add-directory', preset?: FormPreset): void;
  /** 新建组件（目录右键携带归属目录预设） */
  (e: 'add-component', preset: FormPreset): void;
  /** 叶子业务动作（打开/编辑/复制/发布/下线/执行/删除/使用模板/查看/代码变更/启停）：宿主承接 */
  (e: 'command', command: ResourceMenuCommand, node: ResourceTreeNode): void;
}>();

useLucideSubset();

/* ---------------- 数据加载与组树 ---------------- */

const TREE_PROPS = { children: 'children', label: 'label' } as const;

const directories = ref<DirectoryVo[]>([]);
const chains = ref<DatabusChainVo[]>([]);
const localLoading = ref(false);
const keyword = ref('');

const { groups } = useComponentTaxonomy();
const { favorites, reload: reloadFavorites, isFavorited, add: addFav, remove: removeFav } =
  useFavorites();

/** el-tree 实例的最小结构化类型（避免深路径 import 内部类型） */
interface TreeInstance {
  setCurrentKey: (key: string | null) => void;
  filter: (value: string) => void;
  getNode: (key: string) =>
    | { expanded: boolean; collapse: () => void; expand: () => void }
    | undefined;
}
const treeRef = ref<TreeInstance>();
/** 树滚动容器（.res-tree__body，overflow-y:auto）：定位节点的滚动基准 */
const bodyRef = ref<HTMLElement>();

/** 目录平表 + 链路 + 收藏（失败静默，拦截器已 toast） */
async function reload() {
  localLoading.value = true;
  try {
    const [dirRes, chainRes] = await Promise.all([
      listDirectory(),
      listChain({ pageNum: 1, pageSize: 9999, isTemplate: '0' })
    ]);
    directories.value = dirRes.data ?? [];
    chains.value = chainRes.data?.rows ?? [];
  } catch {
    /* 拦截器已提示，树保持旧数据 */
  } finally {
    localLoading.value = false;
  }
  await reloadFavorites();
}

void reload();

const chainMap = computed(() => new Map(chains.value.map((c) => [String(c.id), c])));
const rowByCode = computed(() => new Map(props.rows.map((r) => [r.code, r])));
const selfBuiltRows = computed(() => props.rows.filter((r) => r.db != null));
const systemRows = computed(() => props.rows.filter((r) => r.source === 'SYSTEM'));
const dirtySet = computed(() => new Set(props.dirtyCodes ?? []));
const unhealthySet = computed(() => new Set((props.unhealthy ?? []).map((h) => h.componentCode)));

function byLabel(a: ResourceTreeNode, b: ResourceTreeNode): number {
  return a.label.localeCompare(b.label, 'zh-CN');
}

/* ---------------- 状态计算（生命周期轴 + 装饰轴） ---------------- */

/** 链路状态码 → 生命周期轴：'0'草稿 / '1'已发布 / '2'已下线 */
const STATUS_LIFECYCLE: Record<string, ResourceLifecycle> = {
  '0': 'draft',
  '1': 'published',
  '2': 'offline'
};

function lifecycleOfChain(status?: string): ResourceLifecycle | undefined {
  return status == null ? undefined : STATUS_LIFECYCLE[status];
}

/** 自建组件生命周期：停用=已下线；未发布库存脚本件=草稿；其余=已发布 */
function lifecycleOfComponent(r: ComponentRegistryRow): ResourceLifecycle {
  if (r.disabled) {
    return 'offline';
  }
  return r.source === 'CUSTOM' && !r.scripted ? 'draft' : 'published';
}

/** 自建组件装饰码：异常 → 会话脏 → 废弃（顺序固定，多标记按此拼接） */
function marksOfComponent(r: ComponentRegistryRow): ResourceMark[] {
  const marks: ResourceMark[] = [];
  if (unhealthySet.value.has(r.code)) {
    marks.push('error');
  }
  if (dirtySet.value.has(r.code)) {
    marks.push('modified');
  }
  if (r.deprecated) {
    marks.push('deprecated');
  }
  return marks;
}

function chainLeaf(c: DatabusChainVo): ResourceTreeNode {
  return {
    id: `chain:${c.id}`,
    type: 'chain',
    label: c.chainName,
    directoryId: c.directoryId ?? null,
    chainId: c.id,
    chainCode: c.chainCode,
    status: c.status,
    lifecycle: lifecycleOfChain(c.status),
    children: [],
    favorited: isFavorited('chain', c.id)
  };
}

/** 自建组件叶（DB 治理行；身份是 code，db.id 为收藏/移动主键） */
function componentLeaf(r: ComponentRegistryRow): ResourceTreeNode {
  return {
    id: `cmp:${r.code}`,
    type: 'component',
    label: r.shortName || r.name,
    directoryId: r.db?.directoryId ?? null,
    dbId: r.db?.id ?? null,
    componentCode: r.code,
    icon: r.icon,
    color: r.color,
    source: r.source,
    disabled: r.disabled,
    row: r,
    lifecycle: lifecycleOfComponent(r),
    marks: marksOfComponent(r),
    children: [],
    favorited: r.db?.id != null && isFavorited('component', r.db.id)
  };
}

/** 系统组件叶（纯内置只读，无 DB 行 → 不可收藏/移动） */
function systemLeaf(r: ComponentRegistryRow): ResourceTreeNode {
  return {
    id: `sys:${r.code}`,
    type: 'system-leaf',
    label: r.shortName || r.name,
    directoryId: null,
    componentCode: r.code,
    icon: r.icon,
    color: r.color,
    source: r.source,
    row: r,
    lifecycle: 'published',
    children: []
  };
}

function favoriteLeaf(f: FavoriteVo): ResourceTreeNode {
  const name = f.resourceName || f.resourceCode || String(f.resourceId);
  if (f.resourceType === 'chain') {
    return {
      id: `fav:chain:${f.resourceId}`,
      type: 'favorite',
      label: name,
      directoryId: null,
      chainId: f.resourceId,
      chainCode: f.resourceCode ?? undefined,
      status: chainMap.value.get(String(f.resourceId))?.status,
      lifecycle: lifecycleOfChain(chainMap.value.get(String(f.resourceId))?.status),
      children: [],
      favoriteType: 'chain',
      favoriteId: f.resourceId,
      favorited: true
    };
  }
  const row = rowByCode.value.get(f.resourceCode ?? '');
  return {
    id: `fav:cmp:${f.resourceId}`,
    type: 'favorite',
    label: name,
    directoryId: null,
    dbId: f.resourceId,
    componentCode: f.resourceCode ?? undefined,
    icon: f.icon ?? row?.icon ?? undefined,
    color: row?.color,
    lifecycle: row ? lifecycleOfComponent(row) : undefined,
    marks: row ? marksOfComponent(row) : undefined,
    children: [],
    favoriteType: 'component',
    favoriteId: f.resourceId,
    favorited: true
  };
}

/** 最近访问条目 → 叶子；已删资源（不在台账/链路表）返回 null 由上层过滤 */
function recentLeaf(item: RecentResource): ResourceTreeNode | null {
  if (item.type === 'chain') {
    const c = chainMap.value.get(String(item.refId));
    if (!c) {
      return null;
    }
    return {
      id: `recent:chain:${item.refId}`,
      type: 'recent',
      label: item.title || c.chainName,
      directoryId: null,
      chainId: c.id,
      chainCode: c.chainCode,
      status: c.status,
      lifecycle: lifecycleOfChain(c.status),
      children: [],
      favorited: isFavorited('chain', c.id)
    };
  }
  const code = String(item.refId);
  const row = rowByCode.value.get(code);
  if (!row) {
    return null;
  }
  return {
    id: `recent:cmp:${code}`,
    type: 'recent',
    label: item.title || row.name,
    directoryId: null,
    dbId: row.db?.id ?? null,
    componentCode: code,
    icon: row.icon ?? item.icon,
    color: row.color,
    lifecycle: lifecycleOfComponent(row),
    marks: marksOfComponent(row),
    children: [],
    favorited: row.db?.id != null && isFavorited('component', row.db.id)
  };
}

/** 后序统计下辖叶子数（容器徽标；空容器不挂徽标） */
function subtreeLeaves(node: ResourceTreeNode): number {
  if (!node.children.length) {
    return 0;
  }
  return node.children.reduce(
    (n, child) => n + (child.children.length ? subtreeLeaves(child) : 1),
    0
  );
}

/** 生命周期「最差」优先级：offline > draft > published */
const LIFECYCLE_RANK: Record<ResourceLifecycle, number> = {
  published: 0,
  draft: 1,
  offline: 2
};

/**
 * 目录状态继承（对齐旧的 dirNode/STATUS_RANK）：容器节点生命周期取后代里最差者，
 * 优先级 offline > draft > published；容器自身不产生状态、仅继承，据此也画色点。
 * 叶子（children 为空）直接返回自身生命周期。
 */
function inheritLifecycle(node: ResourceTreeNode): ResourceLifecycle | undefined {
  if (!node.children.length) {
    return node.lifecycle;
  }
  let worst: ResourceLifecycle | undefined;
  for (const child of node.children) {
    const lc = inheritLifecycle(child);
    if (lc != null && (worst == null || LIFECYCLE_RANK[lc] > LIFECYCLE_RANK[worst])) {
      worst = lc;
    }
  }
  if (worst != null) {
    node.lifecycle = worst;
  }
  return worst;
}

/**
 * 五 section 组装：
 * 我的收藏 → 最近访问 → 目录树（顶级平铺 + 未归组兜底）→ 系统组件（虚拟根 + group 二级）。
 */
const treeData = computed<ResourceTreeNode[]>(() => {
  const roots: ResourceTreeNode[] = [];

  // 1. 我的收藏（平铺，不复制目录层级）
  const favChildren = favorites.value.map(favoriteLeaf);
  roots.push({
    id: 'fav-root',
    type: 'favorite-root',
    label: '我的收藏',
    directoryId: null,
    badge: favChildren.length || undefined,
    children: favChildren
  });

  // 2. 最近访问（最多 10 个，跨类型；已删资源剔除）
  const recentChildren = props.recent
    .map(recentLeaf)
    .filter((n): n is ResourceTreeNode => n != null);
  roots.push({
    id: 'recent-root',
    type: 'recent-root',
    label: '最近访问',
    directoryId: null,
    badge: recentChildren.length || undefined,
    children: recentChildren
  });

  // 3. 目录树：两遍扫描组父子，孤儿挂根（保证目录永不丢）
  const dirIdSet = new Set(directories.value.map((d) => String(d.id)));
  const dirNodeMap = new Map<string, ResourceTreeNode>();
  for (const d of directories.value) {
    dirNodeMap.set(String(d.id), {
      id: `dir:${d.id}`,
      type: 'directory',
      label: d.directoryName,
      directoryId: d.id,
      children: []
    });
  }
  const dirRoots: ResourceTreeNode[] = [];
  for (const d of directories.value) {
    const node = dirNodeMap.get(String(d.id))!;
    const pid = String(d.parentId);
    if (pid === '0' || !dirIdSet.has(pid)) {
      dirRoots.push(node);
    } else {
      dirNodeMap.get(pid)!.children.push(node);
    }
  }
  roots.push(...dirRoots);

  // 4. 叶子混装：链路 + 自建组件按 directory_id 分桶，悬空/为空落「未归组」
  const buckets = new Map<string, ResourceTreeNode[]>();
  const ungrouped: ResourceTreeNode[] = [];
  function place(leaf: ResourceTreeNode, dirId: string | number | null) {
    const key = dirId == null ? '' : String(dirId);
    if (key && dirNodeMap.has(key)) {
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(leaf);
      } else {
        buckets.set(key, [leaf]);
      }
    } else {
      ungrouped.push(leaf);
    }
  }
  for (const c of chains.value) {
    place(chainLeaf(c), c.directoryId ?? null);
  }
  for (const r of selfBuiltRows.value) {
    place(componentLeaf(r), r.db?.directoryId ?? null);
  }
  for (const [key, bucket] of buckets) {
    dirNodeMap.get(key)!.children.push(...bucket.toSorted(byLabel));
  }
  if (ungrouped.length) {
    roots.push({
      id: 'ungrouped',
      type: 'ungrouped',
      label: '未归组',
      directoryId: null,
      children: ungrouped.toSorted(byLabel)
    });
  }

  // 5. 系统组件：只读虚拟根，内部按面板分组二级（分组口径取字典序，兜底未分组）
  if (systemRows.value.length) {
    const orderedKeys = groups.value.length
      ? groups.value.map((g) => g.key)
      : [...new Set(systemRows.value.map((r) => r.group))];
    const groupNodes: ResourceTreeNode[] = [];
    for (const key of orderedKeys) {
      const members = systemRows.value.filter((r) => r.group === key);
      if (!members.length) {
        continue;
      }
      groupNodes.push({
        id: `sys-group:${key}`,
        type: 'system-group',
        label: groupLabel(key),
        directoryId: null,
        children: members.map(systemLeaf).toSorted(byLabel)
      });
    }
    const rest = systemRows.value.filter((r) => !orderedKeys.includes(r.group));
    if (rest.length) {
      groupNodes.push({
        id: 'sys-group:__ungrouped',
        type: 'system-group',
        label: '未分组',
        directoryId: null,
        children: rest.map(systemLeaf).toSorted(byLabel)
      });
    }
    roots.push({
      id: 'sys-root',
      type: 'system-root',
      label: '系统组件',
      directoryId: null,
      badge: systemRows.value.length,
      children: groupNodes
    });
  }

  // 目录/未归组徽标：下辖叶子数（后序遍历一次算完）
  for (const root of roots) {
    if (root.type === 'directory' || root.type === 'ungrouped') {
      root.badge = subtreeLeaves(root) || undefined;
    }
  }

  // 目录/虚拟根生命周期继承：后序遍历取后代里最差者（目录据此也画色点）
  for (const root of roots) {
    inheritLifecycle(root);
  }
  return roots;
});

/* ---------------- 交互 ---------------- */

/** 真筛选：关键字命中 名称 / 编码 / 短名 / 标签（对齐原组件库搜索口径） */
function filterNode(value: string, data: ResourceTreeNode): boolean {
  if (!value) {
    return true;
  }
  const kw = value.toLowerCase();
  return [data.label, data.componentCode, data.chainCode, data.row?.shortName, ...(data.row?.tags ?? [])].some(
    (s) => (s ?? '').toLowerCase().includes(kw)
  );
}

watch(keyword, (v) => treeRef.value?.filter(v));

/** 容器节点：单击展开/收起 */
const EXPAND_TYPES = new Set([
  'favorite-root',
  'recent-root',
  'directory',
  'ungrouped',
  'system-root',
  'system-group'
]);

/** 虚拟根/分组节点无右键菜单（目录在 EXPAND_TYPES 内但保留菜单） */
const MENU_BLOCKED_TYPES = new Set([
  'favorite-root',
  'recent-root',
  'ungrouped',
  'system-root',
  'system-group'
]);

/** 容器节点：单击展开/收起；叶子单击即打开（expand-on-click-node=false，点击不与选中冲突） */
function onNodeClick(data: ResourceTreeNode) {
  if (EXPAND_TYPES.has(data.type)) {
    const tn = treeRef.value?.getNode(data.id);
    if (tn) {
      tn.expanded ? tn.collapse() : tn.expand();
    }
    return;
  }
  // 叶子单击即打开（链路→画布；组件/系统件→详情；收藏/最近条目按类型分流）
  emit('command', 'open', data);
}

// 外部 tab 激活变化同步树高亮：画布优先，其次组件（自建叶 cmp: / 系统叶 sys:）
const currentNodeKey = computed<string | null>(() => {
  if (props.activeChainId != null) {
    const id = String(props.activeChainId);
    if (chains.value.some((c) => String(c.id) === id)) {
      return `chain:${id}`;
    }
    return null;
  }
  if (props.activeCode) {
    return systemRows.value.some((r) => r.code === props.activeCode)
      ? `sys:${props.activeCode}`
      : `cmp:${props.activeCode}`;
  }
  return null;
});

watch(
  currentNodeKey,
  (key) => treeRef.value?.setCurrentKey(key),
  { immediate: true }
);

/* ---------------- 右键菜单 ---------------- */

const menu = ref<ResourceMenuState>({ visible: false, x: 0, y: 0, node: null });

/** 菜单尺寸估值，贴边夹取（树在最右栏，不夹取会溢出视口） */
const MENU_W = 176;
const MENU_H = 288;

function onNodeContextMenu(event: MouseEvent, data: ResourceTreeNode) {
  event.preventDefault();
  if (MENU_BLOCKED_TYPES.has(data.type)) {
    return; // 虚拟根/分组无操作（目录自身是 directory，不在集合内，保留菜单）
  }
  const x = Math.max(8, Math.min(event.clientX, window.innerWidth - MENU_W - 8));
  const y = Math.max(8, Math.min(event.clientY, window.innerHeight - MENU_H - 8));
  menu.value = { visible: true, x, y, node: data };
}

/** 收藏目标（链路叶子→chain；自建组件叶→component；收藏条目→其自身） */
function favTargetOf(
  node: ResourceTreeNode
): { type: FavoriteResourceType; id: string | number } | null {
  if (node.type === 'chain') {
    return node.chainId != null ? { type: 'chain', id: node.chainId } : null;
  }
  if (node.type === 'component') {
    return node.dbId != null ? { type: 'component', id: node.dbId } : null;
  }
  if (node.type === 'favorite' && node.favoriteType != null && node.favoriteId != null) {
    return { type: node.favoriteType, id: node.favoriteId };
  }
  return null;
}

function onMenuCommand(command: ResourceMenuCommand, node: ResourceTreeNode) {
  switch (command) {
    case 'move':
      openMoveDialog(node);
      break;
    case 'add-child':
      emit('add-directory', { directoryId: node.directoryId ?? null });
      break;
    case 'add-chain':
      emit('add-chain', node.type === 'directory' ? (node.directoryId ?? null) : null);
      break;
    case 'add-component':
      emit('add-component', {
        directoryId: node.type === 'directory' ? (node.directoryId ?? null) : null
      });
      break;
    case 'rename':
      renameDialog.directoryId = node.directoryId ?? null;
      renameDialog.visible = true;
      break;
    case 'remove-directory':
      removeDirectory(node);
      break;
    case 'favorite-add':
      void toggleFavCommand(node, true);
      break;
    case 'favorite-remove':
      void toggleFavCommand(node, false);
      break;
    default:
      // 打开/编辑/复制/发布/下线/执行/删除/使用模板/查看/代码变更/启停：树不闭环，上抛宿主
      emit('command', command, node);
  }
}

async function toggleFavCommand(node: ResourceTreeNode, next: boolean) {
  const target = favTargetOf(node);
  if (!target) {
    return;
  }
  if (next) {
    await addFav(target.type, target.id);
    ElMessage.success('已收藏');
  } else {
    await removeFav(target.type, target.id);
    ElMessage.success('已取消收藏');
  }
}

/** 树行内联星标：一键收藏/取消（系统件不出星标） */
function canFav(data: ResourceTreeNode): boolean {
  return favTargetOf(data) != null;
}

function toggleFav(data: ResourceTreeNode) {
  void toggleFavCommand(data, !data.favorited);
}

async function onCopyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code);
    ElMessage.success(`已复制编码：${code}`);
  } catch {
    ElMessage.warning('复制失败，请手动选择文本复制');
  }
}

/* ---------------- 目录选项与重命名薄壳 ---------------- */

/** 目录下拉树选项（value=0 为根哨兵）；移动 dialog 与拖拽防环共用（表单体选项由 DirectoryFormBody 自取） */
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

/** 平表闭包求子孙集合（含自身），用于拖拽剔除自身子树 */
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

/** 重命名抽屉（编辑专用薄壳）：表单体与新建向导 create tab 共用 DirectoryFormBody */
const renameDialog = reactive({
  visible: false,
  directoryId: null as string | number | null
});

/** 重命名保存回报：关抽屉并刷树（脏确认与提交提示由表单体自理） */
async function onDirectorySaved() {
  renameDialog.visible = false;
  await reload();
}

async function removeDirectory(node: ResourceTreeNode) {
  try {
    await ElMessageBox.confirm(
      `删除目录「${node.label}」？仅当目录下无子目录、无挂链路、无挂组件时可删。`,
      '删除目录',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    );
  } catch {
    return; // 用户取消
  }
  try {
    await delDirectory(node.directoryId as string | number);
    ElMessage.success('目录已删除');
    await reload();
  } catch {
    /* 拦截器已提示（后端有子目录/挂链/挂组件三拦截） */
  }
}

/* ---------------- 归属移动（链路/组件通用） ---------------- */

const moveDialog = reactive<{
  visible: boolean;
  saving: boolean;
  kind: 'chain' | 'component';
  id: string | number;
  name: string;
  fromLabel: string;
  target: string | number;
}>({
  visible: false,
  saving: false,
  kind: 'chain',
  id: '',
  name: '',
  fromLabel: '',
  target: 0
});

const moveOptions = computed<DirOption[]>(() => [
  { value: 0, label: '未归组', children: buildDirOptions(0, new Set<string>()) }
]);

function openMoveDialog(node: ResourceTreeNode) {
  const dir = directories.value.find((d) => String(d.id) === String(node.directoryId));
  moveDialog.kind = node.type === 'component' ? 'component' : 'chain';
  moveDialog.id = node.type === 'component' ? (node.dbId as number) : (node.chainId as string | number);
  moveDialog.name = node.label;
  moveDialog.fromLabel = `当前归属：${dir ? dir.directoryName : '未归组'}`;
  moveDialog.target = dir ? dir.id : 0;
  moveDialog.visible = true;
}

async function submitMove() {
  if (moveDialog.id == null) {
    return;
  }
  moveDialog.saving = true;
  try {
    const target = moveDialog.target;
    const directoryId = target === 0 || target === '0' ? null : target;
    if (moveDialog.kind === 'component') {
      await moveComponentToDirectory({ componentId: moveDialog.id, directoryId });
    } else {
      await moveChainToDirectory({ chainId: moveDialog.id, directoryId });
    }
    ElMessage.success('归属已更新');
    moveDialog.visible = false;
    await reload();
  } catch {
    /* 拦截器已提示 */
  } finally {
    moveDialog.saving = false;
  }
}

/* ---------------- 拖拽换归属（Trae 式） ---------------- */

/**
 * el-tree 拖拽回调给的是内部 Node，其 data 宽类型为 Record<string, any>（Element 的 TreeNodeData）；
 * 这里按同构只取 data，函数内一次性断言成业务节点——不 import Element 内部 Node 类型。
 */
interface DragNode {
  data: Record<string, any>;
}

/** 可拖：链路/自建组件叶子（换目录）与目录（换父）；系统件/虚拟根不可拖 */
function allowDrag(node: DragNode): boolean {
  const data = node.data as ResourceTreeNode;
  return data.type === 'chain' || data.type === 'component' || data.type === 'directory';
}

/**
 * 落点规则：只允许 inner（不做同级排序，排序仍由目录 sort 字段管），
 * 链路/组件 → 目录或未归组；目录 → 别的目录，且目标不得在自己的子树内。
 */
function allowDrop(
  dragging: DragNode,
  target: DragNode,
  type: 'prev' | 'inner' | 'next'
): boolean {
  if (type !== 'inner') return false;
  const dragData = dragging.data as ResourceTreeNode;
  const targetData = target.data as ResourceTreeNode;
  if (dragData.type === 'chain' || dragData.type === 'component') {
    if (targetData.type === 'ungrouped') return dragData.directoryId != null;
    if (targetData.type !== 'directory') return false;
    return String(dragData.directoryId ?? '') !== String(targetData.directoryId);
  }
  if (dragData.type === 'directory') {
    if (targetData.type !== 'directory') return false;
    if (String(dragData.directoryId) === String(targetData.directoryId)) return false;
    return !subtreeIds(String(dragData.directoryId)).has(String(targetData.directoryId));
  }
  return false;
}

/** 落定即提交后端，成败都 reload：el-tree 已就地改过 data，用后端真值覆盖回视觉 */
async function onNodeDrop(dragging: DragNode, target: DragNode) {
  const dragData = dragging.data as ResourceTreeNode;
  const targetData = target.data as ResourceTreeNode;
  const directoryId = targetData.type === 'ungrouped' ? null : targetData.directoryId;
  try {
    if (dragData.type === 'chain') {
      await moveChainToDirectory({ chainId: dragData.chainId, directoryId });
      ElMessage.success('链路归属已更新');
    } else if (dragData.type === 'component') {
      await moveComponentToDirectory({ componentId: dragData.dbId as number, directoryId });
      ElMessage.success('组件归属已更新');
    } else {
      const dir = directories.value.find((d) => String(d.id) === String(dragData.directoryId));
      if (!dir) return;
      await updateDirectory({
        id: dir.id,
        parentId: directoryId ?? 0,
        directoryName: dir.directoryName,
        sort: dir.sort,
        remark: dir.remark
      });
      ElMessage.success('目录已移动');
    }
  } catch {
    /* 拦截器已提示（后端环校验/重名等） */
  } finally {
    await reload();
  }
}

/* ---------------- 渲染辅助 ---------------- */

/** 链路类节点（链路/模板/收藏或最近里的链路条目）：chainId 非空即链路身份 */
function isAvatarNode(data: ResourceTreeNode): boolean {
  return data.chainId != null && data.chainId !== '';
}

function iconOf(data: ResourceTreeNode): string {
  switch (data.type) {
    case 'favorite-root':
      return 'lucide:star';
    case 'recent-root':
      return 'lucide:clock';
    case 'ungrouped':
      return 'lucide:inbox';
    case 'system-root':
      return 'lucide:package';
    case 'directory':
    case 'system-group':
      return 'lucide:folder-open';
    default:
      return data.icon || 'lucide:box';
  }
}

/** 容器/虚拟根按类型染色（叶子走台账 color，见 iconStyle）；值＝.tree-node__icon 的语义 class */
const CONTAINER_ICON_CLASS: Partial<Record<ResourceTreeNode['type'], string>> = {
  'favorite-root': 'is-fav',
  'recent-root': 'is-recent',
  ungrouped: 'is-ungrouped',
  'system-root': 'is-system',
  directory: 'is-dir',
  'system-group': 'is-dir'
};

function iconClass(data: ResourceTreeNode): string {
  const base = CONTAINER_ICON_CLASS[data.type];
  if (data.disabled) {
    return base ? `${base} is-off` : 'is-off';
  }
  return base ?? '';
}

/** 叶子按台账 color 着色；容器/虚拟根由 iconClass 的语义 class 染色（见 CONTAINER_ICON_CLASS） */
function iconStyle(data: ResourceTreeNode): CSSProperties | undefined {
  return data.color ? { color: data.color } : undefined;
}

function labelClass(data: ResourceTreeNode): string {
  return data.disabled ? 'is-disabled' : '';
}

/** 装饰轴字母码：error→E / modified→M / deprecated→D（多标记拼接，如 EM） */
const MARK_TEXT: Record<ResourceMark, string> = {
  error: 'E',
  modified: 'M',
  deprecated: 'D'
};

/** 装饰轴语义色 class（多标记时取首个＝优先级最高者） */
const MARK_CLASS: Record<ResourceMark, string> = {
  error: 'is-error',
  modified: 'is-modified',
  deprecated: 'is-deprecated'
};

function markText(data: ResourceTreeNode): string {
  return (data.marks ?? []).map((m) => MARK_TEXT[m]).join('');
}

function markClass(data: ResourceTreeNode): string {
  const first = data.marks?.[0];
  return first ? MARK_CLASS[first] : '';
}

/** 链路字母头像：chainCode 哈希 → 量化色相 → HSL 底色 + 名称首字（同码同色） */
const AVATAR_HUE_STEPS = 12;

function hashOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function avatarStyle(data: ResourceTreeNode): CSSProperties {
  const seed = String(data.chainCode || data.chainId || data.id);
  const hue = (hashOf(seed) % AVATAR_HUE_STEPS) * (360 / AVATAR_HUE_STEPS);
  return { background: `hsl(${hue}, 58%, 48%)` };
}

function avatarLetter(data: ResourceTreeNode): string {
  const first = data.label.trim().charAt(0);
  return /[a-z]/.test(first) ? first.toUpperCase() : first || '?';
}

const LIFECYCLE_TIP: Record<ResourceLifecycle, string> = {
  draft: '草稿',
  published: '已发布',
  offline: '已下线'
};

const MARK_TIP: Record<ResourceMark, string> = {
  error: '运行异常',
  modified: '本会话有未保存改动',
  deprecated: '已废弃'
};

/** 来源文案（与网格/台账同一套口径） */
function sourceLabel(source?: ComponentSource): string {
  if (source === 'SYSTEM') {
    return '内置';
  }
  return source === 'OVERLAY' ? '治理覆盖' : '库存脚本件';
}

/** 组件状态文案：生命周期 + 装饰码中文，多段以「 · 」拼接 */
function statusText(data: ResourceTreeNode): string {
  const parts: string[] = [];
  if (data.lifecycle) {
    parts.push(LIFECYCLE_TIP[data.lifecycle]);
  }
  for (const m of data.marks ?? []) {
    parts.push(MARK_TIP[m]);
  }
  return parts.join(' · ');
}

function tipOf(data: ResourceTreeNode): string {
  if (data.type === 'favorite-root') {
    return '我的收藏：个人化组织维度，与目录归属无关';
  }
  if (data.type === 'recent-root') {
    return '最近访问：本机最近打开过的链路与组件';
  }
  if (data.type === 'system-root') {
    return '系统组件：内置只读，不可编辑/删除/移动';
  }
  if (data.type === 'ungrouped') {
    return '未归组：未设置目录归属的链路与自建组件';
  }
  const code = data.chainCode || data.componentCode;
  if (code) {
    const base = `${data.label}（${code}）`;
    // 组件叶 tooltip 恢复「来源 · 状态」（内置 · 运行正常 范式）
    if (data.type === 'component' || data.type === 'system-leaf') {
      return `${base}\n${sourceLabel(data.source)} · ${statusText(data)}`;
    }
    return base;
  }
  return data.label;
}

/**
 * 定位树节点（中栏空态导航 / 异常件警示条入口）：展开 + 高亮 + 滚动入视。
 * el-tree 的 Node 模型不持有 DOM（element-plus 未暴露 $el，drag 用的 $el 是另一套包装对象），
 * 故高亮后等渲染完（nextTick），从滚动容器里按 `.is-current` 取真实行元素做滚动。
 * 接受任意节点 id（section 虚拟根、目录、叶子），空态卡片与异常件点击直达。
 */
function focusSection(id: string) {
  const tree = treeRef.value;
  const node = tree?.getNode(id);
  if (!tree || !node) {
    return;
  }
  node.expand();
  tree.setCurrentKey(id);
  void nextTick(() => {
    const body = bodyRef.value;
    // is-current 挂在节点外层，其内还包着整棵后代子树，故取直属内容行，避免用子树总高定位
    const row = body?.querySelector<HTMLElement>('.el-tree-node.is-current > .el-tree-node__content');
    if (!body || !row) {
      return;
    }
    // 无条件对齐到容器顶部（留 8px 呼吸位）：目标 section 直接顶到树滚动区最上方。
    // 不用「越界才滚、只滚到刚好可见」——那样会把目标压在底部，用户还得自己往回滚。
    // 浏览器会把 scrollTop 夹到 [0, 最大] 内，故末尾节点滚到尽头的边界也自洽。
    body.scrollTop += row.getBoundingClientRect().top - body.getBoundingClientRect().top - 8;
  });
}

defineExpose({ reload, focusSection });
</script>

<style lang="scss" scoped>
.res-tree {
  /* 层级竖线的缩进基准（el-tree 的 :indent 已置 0，缩进全由此变量承担） */
  --res-tree-indent: 18px;

  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color, #fff);
  min-width: 0;

  &__head {
    display: flex;
    align-items: center;
    gap: 8px;
    /* 34px：与顶部 header、AI 栏头、tab 条、抽屉 tab 齐成一条水平线 */
    height: 34px;
    padding: 0 8px 0 14px;
    flex-shrink: 0;
  }

  &__title {
    font-size: 13px;
    font-weight: 700;
    color: var(--el-text-color-primary, #1d2129);
  }

  &__tools {
    margin-left: auto;
    display: flex;
    gap: 2px;
    /* 默认隐身，hover 整棵树面板（含搜索框/列表区）或键盘聚焦到按钮时才淡入 */
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  &:hover &__tools,
  &:focus-within &__tools {
    opacity: 1;
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

  /* 启动期失败件警示条：窄栏内紧凑列表，点击条目直达对应叶子 */
  &__health {
    flex-shrink: 0;
    margin: 0 8px 6px;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--el-color-danger-light-9, #fef0f0);
    border: 1px solid var(--el-color-danger-light-7, #fde2e2);
  }

  &__health-head {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 600;
    color: var(--el-color-danger, #f56c6c);
  }

  &__health-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 132px;
    margin-top: 6px;
    overflow-y: auto;
  }

  &__health-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 0;
    text-align: left;
    background: transparent;
    border: none;
    cursor: pointer;

    &:hover .res-tree__health-msg {
      color: var(--el-color-danger, #f56c6c);
      text-decoration: underline;
    }
  }

  &__health-msg {
    flex: 1;
    min-width: 0;
    font-size: 11px;
    line-height: 1.4;
    color: var(--el-text-color-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 6px 12px;
  }
}

.res-tree__el {
  --el-tree-node-hover-bg-color: var(--el-fill-color-light, #f5f7fa);

  :deep(.el-tree-node__content) {
    height: 30px;
    border-radius: 6px;
  }

  /* 层级竖线：缩进由 children 容器 padding 承担，竖线止于末行中心 */
  :deep(.el-tree-node__children) {
    position: relative;
    padding-left: var(--res-tree-indent);
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

    /* 容器/虚拟根语义色（叶子不在这里，走台账 color 内联） */
    &.is-fav {
      color: var(--el-color-warning);
    }

    &.is-ungrouped {
      color: var(--el-color-warning);
    }

    &.is-recent {
      color: var(--el-color-info);
    }

    &.is-system {
      color: var(--el-color-info);
    }

    &.is-dir {
      color: var(--el-color-primary);
    }

    /* 停用态统一压灰，优先级最高 */
    &.is-off {
      color: var(--el-text-color-placeholder);
    }
  }

  /* 链路字母头像：确定性配色（同码同色），18px 与图标同宽保持行内节奏 */
  &__avatar {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 5px;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    color: #fff;
  }

  &__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--el-text-color-primary, #1d2129);

    &.is-disabled {
      color: var(--el-text-color-placeholder);
      text-decoration: line-through;
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

  /* 行尾生命周期色点（叶子按自身语义，目录取后代最差者） */
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

  /* 装饰轴字母码（E 异常 / M 会话脏 / D 废弃），可与色点并存 */
  &__mark {
    flex-shrink: 0;
    min-width: 12px;
    padding: 0 3px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 700;
    line-height: 14px;
    text-align: center;

    &.is-error {
      color: var(--el-color-danger, #f56c6c);
    }

    &.is-modified {
      color: var(--el-color-warning, #e6a23c);
    }

    &.is-deprecated {
      color: var(--el-text-color-placeholder);
    }
  }

  /* 下辖叶子数徽标（目录/未归组/虚拟根） */
  &__badge {
    min-width: 18px;
    padding: 0 5px;
    border-radius: 9px;
    font-size: 11px;
    line-height: 16px;
    text-align: center;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color, #f0f2f5);
  }

  /* 星标：默认隐身，行 hover 或已收藏时淡入（系统件不出此钮） */
  &__star {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--el-text-color-secondary);
    font-size: 13px;
    cursor: pointer;
    opacity: 0;
    transition:
      opacity 0.15s ease,
      color 0.15s ease;

    &:hover {
      color: var(--el-color-warning, #e6a23c);
    }

    &.is-on {
      opacity: 1;
      color: var(--el-color-warning, #e6a23c);
    }
  }

  &:hover &__star {
    opacity: 1;
  }
}

.res-move {
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

/* 重命名抽屉薄壳：抽体零内边距交给表单体自排版（抽屉传送至 body，须顶层选择器） */
.res-tree__rename {
  :deep(.el-drawer__body) {
    padding: 0;
    display: flex;
    flex-direction: column;
    height: 100%;
  }
}
</style>
