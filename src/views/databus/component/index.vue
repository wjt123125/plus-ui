
<template>
  <div class="cmpwb-page">
    <!--
      组件管理工作台（三栏推拉布局，无遮罩抽屉，对标 Trae 客户端）：
        AI 助手栏 / 工作面板（主内容区）/ 组件树
      「组件库」是工作面板里的一个普通 tab（卡片网格宿主），与其它 tab 一样可关闭；
      点树的目录节点打开/聚焦它，点叶节点或卡片开「查看」tab；编辑与代码变更各自独立 tab，
      tab 身份 = 组件 + 模式，会话仅存内存，离开路由即清空。分栏宽度与开合状态记 localStorage。
      台账数据来自 /options（内置+启用自定义富 schema）与 /list（全部 DB 行）的合流。

      §2.0：两侧栏的开合入口收敛到顶部 header（唯一入口），栏收起即宽度归零、不占位——
      AI 栏的 44px mini rail 与组件树的 34px 竖条把手都已废除。高度由外层 wrapper 吃
      calc(100vh - 123px)、header flex-shrink:0、.cmpwb flex:1 + min-height:0 三段式分配，不再硬算。
    -->
    <WorkbenchHeader
      v-model:ai-collapsed="aiCollapsed"
      v-model:nav-collapsed="treeCollapsed"
      ai-label="AI 助手"
      nav-label="组件树"
    />

    <div class="cmpwb">
      <!-- 栏 1：AI 助手 -->
      <AiAssistantRail
        :collapsed="aiCollapsed"
        :width="aiWidth"
        title="AI 助手"
        welcome-title="组件助手"
        welcome-desc="用自然语言查询组件、生成参数契约与排查脚本编译失败。"
        @select="onAiSelect"
      />
      <Splitter v-if="!aiCollapsed" v-model="aiWidth" :min="AI_MIN" :max="AI_MAX" />

      <!-- 栏 2：工作面板（主内容区，常驻不可折叠） -->
      <WorkPanel
        v-model:active-key="activeKey"
        :tabs="tabs"
        :rows="rows"
        :tag-suggestions="tagPool"
        :refresh-tokens="refreshTokens"
        @close="wb.close"
        @dirty-change="wb.setDirty"
        @saved="handleSaved"
        @rolled="handleRolled"
        @open-changes="handleOpenChanges"
        @edit="handleEdit"
        @delete="handleDelete"
        @changes="handleChanges"
      >
        <template #grid>
          <ComponentGrid
            :rows="scopedRows"
            :scope="scope"
            :unhealthy="unhealthy"
            :loading="loading"
            :toggling-code="togglingCode"
            :active-code="activeCode"
            @open="openDetail"
            @edit="handleEdit"
            @delete="handleDelete"
            @toggle="toggleEnabled"
          >
            <template #meta>
              <span class="cmpwb__counts">
                内置 {{ builtinCount }} · 治理覆盖 {{ overlayCount }} · 库存脚本件 {{ customCount }}
              </span>
            </template>
          </ComponentGrid>
        </template>
      </WorkPanel>

      <!-- 栏 3：组件树（可拖宽、可收起；「新建组件」入口在目录节点的右键菜单里） -->
      <Splitter v-if="!treeCollapsed" v-model="treeWidth" :min="TREE_MIN" :max="TREE_MAX" target="next" />
      <ComponentTree
        v-if="!treeCollapsed"
        :rows="rows"
        :unhealthy="unhealthy"
        :recent="recentOrdered"
        :scope="scope"
        :loading="loading"
        :dirty-codes="dirtyCodes"
        :style="{ width: treeWidth + 'px', flexShrink: 0 }"
        @update:scope="onScopeChange"
        @view="openDetail"
        @edit="handleEdit"
        @changes="handleChanges"
        @toggle="toggleEnabled"
        @delete="handleDelete"
        @add="handleAdd"
      />
    </div>
  </div>
</template>

<script setup name="DatabusComponent" lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  delComponent,
  listComponent,
  listComponentOptions,
  listScriptRuntime,
  updateComponent
} from '@/api/databus/component';
import type { ScriptRuntime, ScriptSaveResult } from '@/api/databus/component/types';
import { useLoading } from '@/hooks/async/useLoading';
import modal from '@/plugins/modal';
import { usePersisted } from '../workbench/composables/usePersisted';
import Splitter from '../workbench/components/Splitter.vue';
import WorkbenchHeader from '../workbench/components/WorkbenchHeader.vue';
import AiAssistantRail from '../workbench/ai/AiAssistantRail.vue';
import { useComponentTaxonomy } from '../editor/composables/useComponentTaxonomy';
import { usePhIcons } from '../editor/composables/usePhIcons';
import ComponentGrid from './workbench/list/ComponentGrid.vue';
import ComponentTree from './workbench/tree/ComponentTree.vue';
import WorkPanel from './workbench/panel/WorkPanel.vue';
import { useComponentTabs } from './workbench/composables/useComponentTabs';
import { useRecentComponents } from './workbench/composables/useRecentComponents';
import type { ComponentSaved, ComponentTab, FormPreset, TreeScope } from './workbench/workbench.types';
import { buildRegistry } from './model/registry';
import type { ComponentRegistryRow, DefMeta } from './model/registry';

/** 分栏尺寸约定（详见 docs/refactor-component-workbench.md） */
const AI_MIN = 260;
const AI_MAX = 360;
const TREE_MIN = 180;
const TREE_MAX = 320;

const rows = ref<ComponentRegistryRow[]>([]);
/** 库存脚本件运行时健康（启动期失败件用于列表顶部红条与树「异常件」节点） */
const runtimeHealth = ref<ScriptRuntime[]>([]);
const { loading, withLoading } = useLoading(true);
const togglingCode = ref<string>();
const scope = ref<TreeScope>({ kind: 'all' });

const wb = useComponentTabs();
const { tabs, activeKey } = wb;
const { recentOrdered, touch: touchRecent, remove: removeRecent } = useRecentComponents();
/** 分组/业务域字典：组件树 business 组下钻三层要用，进页面即触发（模块级缓存，全会话一次） */
const { defaultDomainKey, ensureTaxonomy } = useComponentTaxonomy();
/** ph 图标全集：台账 icon 契约是 `ph:*`，树叶子与卡片渲染前必须离线注入，否则运行时联网取图 */
const { loadPhIcons } = usePhIcons();

// 进页面即打开「组件库」tab（可关闭，之后由点树目录节点重新打开）
wb.openGrid();

/** 前端偏好：AI 栏与组件树的开合与宽度（工作面板是主内容区，不参与折叠） */
const aiCollapsed = usePersisted('databus.cmpwb.aiCollapsed', true);
const aiWidth = usePersisted('databus.cmpwb.aiWidth', 300);
const treeCollapsed = usePersisted('databus.cmpwb.treeCollapsed', false);
const treeWidth = usePersisted('databus.cmpwb.treeWidth', 240);

/** tab key → 重载令牌：回滚后自增，让同组件的编辑面板重取脚本体 */
const refreshTokens = reactive<Record<string, number>>({});

const unhealthy = computed(() => runtimeHealth.value.filter((h) => !h.healthy));
const builtinCount = computed(() => rows.value.filter((r) => r.source === 'SYSTEM').length);
const overlayCount = computed(() => rows.value.filter((r) => r.source === 'OVERLAY').length);
const customCount = computed(() => rows.value.filter((r) => r.source === 'CUSTOM').length);

/** 标签建议池：台账已有标签去重，供新增/编辑表单自由创建时联想 */
const tagPool = computed(() => {
  const set = new Set<string>();
  for (const r of rows.value) {
    for (const t of r.tags ?? []) {
      if (t) {
        set.add(t);
      }
    }
  }
  return [...set];
});

/** 组件树 scope → 「组件库」网格行集 */
const scopedRows = computed(() => {
  switch (scope.value.kind) {
    case 'unhealthy': {
      const codes = new Set(unhealthy.value.map((h) => h.componentCode));
      return rows.value.filter((r) => codes.has(r.code));
    }
    case 'recent': {
      const map = new Map(rows.value.map((r) => [r.code, r]));
      return recentOrdered.value.map((item) => map.get(item.code)).filter((r): r is ComponentRegistryRow => !!r);
    }
    case 'group': {
      const key = scope.value.key === '__ungrouped' ? '' : scope.value.key;
      return rows.value.filter((r) => (r.group || '') === key);
    }
    case 'domain': {
      // 与组件树的 business 组下钻分桶同一套口径：空 domain 归兜底域
      const key = scope.value.key;
      return rows.value.filter(
        (r) => r.group === 'business' && (r.domain || defaultDomainKey.value) === key
      );
    }
    case 'code': {
      // 提取到 const：对 scope.value 的判别收窄不会带进 filter 回调闭包
      const code = scope.value.code;
      return rows.value.filter((r) => r.code === code);
    }
    default:
      return rows.value;
  }
});

const activeCode = computed(() => tabs.value.find((t) => t.key === activeKey.value)?.code);

/** 本会话有未保存草稿的组件编码 → 树上标 M（VS Code modified 惯例） */
const dirtyCodes = computed(() => tabs.value.filter((t) => t.dirty && t.code).map((t) => t.code));

function rowByCode(code: string): ComponentRegistryRow | undefined {
  return rows.value.find((r) => r.code === code);
}

/** 拉取双源合流 + 脚本运行健康；任一源失败不阻断其他源渲染 */
const getList = async () => {
  await withLoading(async () => {
    const [optRes, listRes, runtimeRes] = await Promise.allSettled([
      listComponentOptions(),
      listComponent({ pageNum: 1, pageSize: 999 }),
      listScriptRuntime()
    ]);
    const options = optRes.status === 'fulfilled' ? optRes.value.data?.components ?? [] : [];
    const dbRows = listRes.status === 'fulfilled' ? listRes.value.data?.rows ?? [] : [];
    runtimeHealth.value = runtimeRes.status === 'fulfilled' ? runtimeRes.value.data ?? [] : [];
    // 展示元数据从 /options 自身构建（同一次响应，无第二数据源）
    const optionMetaMap: ReadonlyMap<string, DefMeta> = new Map(
      options.map((o) => [
        o.code,
        {
          group: o.group ?? undefined,
          color: o.color ?? undefined,
          icon: o.icon ?? undefined,
          short: o.shortName ?? undefined
        }
      ])
    );
    rows.value = buildRegistry(options, dbRows, optionMetaMap);
  });
};

// ── 树 / 网格 → 工作面板 ────────────────────────────────────────

function onScopeChange(next: TreeScope) {
  scope.value = next;
  if (next.kind !== 'code') {
    // 点目录节点（全部组件 / 异常件 / 最近访问 / 分组）= 打开或聚焦「组件库」tab
    wb.openGrid();
    return;
  }
  const row = rowByCode(next.code);
  if (row) {
    openDetail(row);
  }
}

function openDetail(row: ComponentRegistryRow) {
  wb.openDetail(row);
  touchRecent(row);
}

/** 新建组件：入口是组件树目录节点的右键菜单（§2.3），携带该目录的 group/domain 预设 */
function handleAdd(preset?: FormPreset) {
  wb.openForm(undefined, undefined, preset);
}

function handleEdit(row: ComponentRegistryRow) {
  if (row.db?.id == null) {
    return;
  }
  wb.openForm(row.db.id, row);
  touchRecent(row);
}

function handleChanges(row: ComponentRegistryRow) {
  if (wb.openChanges(row)) {
    touchRecent(row);
  }
}

/** 编辑面板内「代码变更」按钮：按 tab 上的组件定位台账行 */
function handleOpenChanges(tab: ComponentTab) {
  const row = rowByCode(tab.code);
  if (row) {
    handleChanges(row);
  }
}

async function handleSaved(tab: ComponentTab, payload: ComponentSaved) {
  await getList();
  if (payload.id == null) {
    return;
  }
  const saved = rowByCode(payload.code);
  if (tab.dbId == null) {
    // 新增成功：form:new 临时 tab 转正为 form:id，避免再点保存又建一条
    wb.adoptNewForm(payload.code, payload.id, payload.name);
  } else {
    wb.openForm(payload.id, { code: payload.code, name: payload.name });
  }
  touchRecent({ code: payload.code, name: payload.name, source: saved?.source ?? 'CUSTOM' });
}

/** 回滚生效：刷新台账 + 让同组件的编辑面板重取脚本体 */
async function handleRolled(tab: ComponentTab, result: ScriptSaveResult) {
  await getList();
  if (!result.success) {
    return;
  }
  for (const t of tabs.value) {
    if (t.code === tab.code && t.kind === 'form') {
      refreshTokens[t.key] = (refreshTokens[t.key] ?? 0) + 1;
    }
  }
}

async function handleDelete(row: ComponentRegistryRow) {
  if (row.db?.id == null) {
    return;
  }
  await modal.confirm(`是否确认删除自定义组件"${row.name}"（${row.code}）？删除后不可恢复。`);
  await delComponent(row.db.id);
  modal.msgSuccess('删除成功');
  const staleKeys = tabs.value.filter((t) => t.code === row.code).map((t) => t.key);
  wb.closeByCode(row.code);
  staleKeys.forEach((key) => delete refreshTokens[key]);
  removeRecent(row.code);
  await getList();
}

/**
 * 卡片开关：val=true 启用（status 0）/ false 停用（status 1）。
 * 停用不硬拦：仅提示面板不可见、已发布链路继续跑（库存脚本件重启后不再注册，重启用恢复）。
 */
async function toggleEnabled(row: ComponentRegistryRow, val: boolean) {
  if (!row.db || togglingCode.value) {
    return;
  }
  if (!val) {
    await modal.confirm(
      `确认停用「${row.name}」？停用后编辑器面板不再露出；已发布链路仍继续运行` +
        (row.scripted ? '，但服务重启后该脚本件不会重新注册（重启用即恢复）。' : '。')
    );
  }
  togglingCode.value = row.code;
  try {
    await updateComponent({ ...row.db, status: val ? '0' : '1' });
    modal.msgSuccess(val ? '已启用' : '已停用');
    await getList();
  } finally {
    togglingCode.value = undefined;
  }
}

/** AI 助手选中某组件（v1 空壳预留）：等价于在树上点该叶子 */
function onAiSelect(payload: string) {
  const row = rowByCode(payload);
  if (row) {
    scope.value = { kind: 'code', code: row.code };
    openDetail(row);
  }
}

// 台账刷新后剔除已不存在的「最近访问」项
watch(rows, (list) => {
  if (!list.length) {
    return;
  }
  const alive = new Set(list.map((r) => r.code));
  for (const item of recentOrdered.value) {
    if (!alive.has(item.code)) {
      removeRecent(item.code);
    }
  }
});

/** Ctrl+U 开合 AI 栏；输入区/代码编辑器内不抢键 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable || !!target.closest('.cm-editor');
}

function onKeydown(event: KeyboardEvent) {
  if (!event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) {
    return;
  }
  if (isTypingTarget(event.target)) {
    return;
  }
  if (event.key.toLowerCase() === 'u') {
    event.preventDefault();
    aiCollapsed.value = !aiCollapsed.value;
  }
}

onMounted(() => {
  // 字典与 ph 图标全集都在树首次渲染前触发：字典未到位时 business 组先渲两层（树挂 loading），
  // 到位后自动下钻三层；图标全集是独立 chunk，注入完成前叶子图标位为空但不会联网。
  void ensureTaxonomy();
  void loadPhIcons();
  getList();
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<style lang="scss" scoped>
/* 页面级 wrapper：吃掉视口高度，header 与三栏区各取所需（§2.0 高度公式） */
.cmpwb-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 123px);
  min-height: 480px;
}

.cmpwb {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
  overflow: hidden;
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 8px;
}

.cmpwb__counts {
  color: var(--el-text-color-placeholder);
}
</style>
