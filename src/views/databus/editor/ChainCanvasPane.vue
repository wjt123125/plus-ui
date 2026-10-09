<template>
  <div
    ref="rootRef"
    class="databus-editor"
    :class="{
      'is-palette-collapsed': paletteCollapsed,
      'is-props-collapsed': propsCollapsed,
      'is-embedded': host === 'workbench'
    }"
  >
    <!-- 顶部工具栏（display:contents 三段直接落网格列轨道） -->
    <EditorToolbar
      v-model:chain-id="chainId"
      :host="host"
      :editing-id="editingId"
      :chain-name="chainName"
      :can-undo="canUndo"
      :can-redo="canRedo"
      :chain-saving="chainSaving"
      :saving="saving"
      @back="backToList"
      @undo="undo"
      @redo="redo"
      @reset="resetCanvas"
      @open-input-params="inputParamsVisible = true"
      @open-preview="openPreview"
      @save-chain="handleSaveChain"
      @save-as-el="saveAsEl"
      @select="onChainSelect"
    />

    <!-- 三栏：组件面板 / 画布 / 参数表单 -->
    <div class="databus-editor__body">
      <div class="databus-editor__palette">
        <CmpPalette @collapse="setPaletteCollapsed(true)" />
      </div>
      <div class="databus-editor__canvas-wrap">
        <FlowCanvas
          :nodes="initial.nodes"
          :edges="initial.edges"
          @select="ctrl.select($event)"
          @drop-node="onDropNode"
        />
        <button
          v-if="paletteCollapsed"
          type="button"
          class="databus-editor__palette-expand"
          title="展开物料区"
          @click="setPaletteCollapsed(false)"
        >
          <el-icon><Expand /></el-icon>
        </button>
        <button
          v-if="propsCollapsed"
          type="button"
          class="databus-editor__props-expand"
          title="展开属性面板"
          @click="setPropsCollapsed(false)"
        >
          <el-icon><Expand /></el-icon>
        </button>
      </div>
      <EditorPropsPanel
        :node="selectedNode"
        :edge="selectedEdge"
        :collapsed="propsCollapsed"
        @fold="setPropsCollapsed(true)"
        @delete="ctrl.requestDeleteNode($event)"
        @data-change="onPropsChange"
      />
    </div>

    <!-- EL 生成结果 -->
    <ElResultDialog v-model:visible="resultVisible" :chain-id="chainId" :el-result="elResult" />

    <!-- 试运行：入参 JSON -->
    <PreviewInputDialog
      v-model:visible="previewVisible"
      v-model:request="previewRequest"
      :loading="previewRunning"
      @execute="runPreview"
    />

    <!-- 试运行：执行结果（banner/步骤表/上下文快照在组件内，步骤标题推断由 composable 注入） -->
    <PreviewResultDialog
      v-model:visible="previewResultVisible"
      :result="previewResult"
      :resolve-step-title="stepTitle"
      @reopen="reopenPreview"
      @open-step="openStepDetail"
    />

    <!-- 步骤明细抽屉：点击步骤表「执行结果」文本滑出 -->
    <StepDetailDrawer v-model:visible="stepDetailVisible" :step="currentStep" />

    <!-- 入参登记：左右双栏联动，保存后随链路持久化 -->
    <InputParamsDialog
      v-model:visible="inputParamsVisible"
      :params="inputParams"
      @save="onInputParamsSave"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useVueFlow, type Node, type Edge } from '@vue-flow/core';
import { Expand } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { generateEl } from '@/api/databus/el';
import CmpPalette from './components/palette/CmpPalette.vue';
import FlowCanvas from './components/canvas/FlowCanvas.vue';
import EditorToolbar from './components/shell/EditorToolbar.vue';
import EditorPropsPanel from './components/panels/EditorPropsPanel.vue';
import ElResultDialog from './components/dialogs/ElResultDialog.vue';
import InputParamsDialog from './components/dialogs/InputParamsDialog.vue';
import PreviewInputDialog from './components/dialogs/PreviewInputDialog.vue';
import PreviewResultDialog from './components/dialogs/PreviewResultDialog.vue';
import StepDetailDrawer from './components/dialogs/StepDetailDrawer.vue';
import { type CmpNodeData } from './composables/useElTreeModel';
import { useFlowHistory } from './composables/useFlowHistory';
import { provideCanvasController } from './composables/useCanvasController';
import { provideEditorFullscreen } from './composables/useEditorFullscreen';
import { provideElPreview } from './composables/useElPreview';
import { provideElTreeModel } from './composables/useElTreeModel';
import { useAutoLayout } from './composables/useAutoLayout';
import { useCanvasGuards } from './composables/useCanvasGuards';
import { useChainDocument } from './composables/useChainDocument';
import { useEditorHotkeys } from './composables/useEditorHotkeys';
import { usePanelCollapse } from './composables/usePanelCollapse';
import { usePreviewRun } from './composables/usePreviewRun';
import { useComponentOptions } from './composables/useComponentOptions';

defineOptions({ name: 'ChainCanvasPane' });

/**
 * 链路画布面板：全屏编辑器与链路工作台共用的编排容器。
 * - host='editor'：路由级全屏编辑器，支持 query.id 初始化、返回列表、链路切换器
 * - host='workbench'：工作台内嵌（v-show 保活），mount 时按 chainId 加载链路
 * 多实例共存时快捷键/全屏按 active 门闸，避免 undo/Delete 串台。
 */
const props = withDefaults(
  defineProps<{
    /** 宿主：'editor' 路由级全屏编辑器；'workbench' 链路工作台内嵌画布 */
    host?: 'editor' | 'workbench';
    /** workbench 宿主：要加载的链路主键（19 位雪花 id 保字符串）；editor 宿主忽略。
     *  命名避开 useChainDocument 的 chainId（当前编辑链路，可被切换器改） */
    loadChainId?: number | string | null;
    /** workbench 宿主：本 tab 是否激活（非激活实例快捷键短路） */
    active?: boolean;
  }>(),
  { host: 'editor', loadChainId: null, active: true }
);

const emit = defineEmits<{ 'dirty-change': [dirty: boolean] }>();

// ElNode 模型树是唯一数据源，画布是它的投影
const treeModel = provideElTreeModel();

// 链路文档状态（editingId/元数据/inputParams + load/save/back）见下方 useChainDocument 装配
// 初始画布：project 空树 → 仅 start 虚拟节点
const initial = treeModel.project();

// 物料区 / 属性面板收起态：图标触发、画布浮动展开钮、localStorage 记忆（逻辑下沉 composable）
const { collapsed: paletteCollapsed, setCollapsed: setPaletteCollapsed } =
  usePanelCollapse('databus.palette.collapsed');
const { collapsed: propsCollapsed, setCollapsed: setPropsCollapsed } =
  usePanelCollapse('databus.props.collapsed');

// 编辑器整体全屏（工具栏/物料/画布/属性区一同进入），供画布控制条按钮 inject 调用
const rootRef = ref<HTMLElement | null>(null);
provideEditorFullscreen(rootRef);

// 在父组件创建 Vue Flow store 实例并注入子树，FlowCanvas 通过 useVueFlow() 拿到同一实例
const {
  getNodes,
  getEdges,
  setNodes,
  setEdges,
  fitView,
  onNodeDragStop
} = useVueFlow();

// ELK 自动排列：提升到顶层，供 canvasController（结构变更后）调用
const { autoLayout: runAutoLayout } = useAutoLayout(treeModel);

// 撤销/重做历史栈：数据源切换到 ElNode 树快照
const { undo, redo, canUndo, canRedo, push, reset } = useFlowHistory(
  { treeModel, getNodes, setNodes, setEdges },
  { onRestored: () => runAutoLayout({ fitView: false }) }
);

// 实时 EL 预览：直接从模型树序列化 CmpProperty，结构变更由控制器 commit 回调触发
const elPreview = provideElPreview(treeModel);

// 画布操作控制器：改树→重投影→入栈→EL 预览刷新
const ctrl = provideCanvasController({
  treeModel,
  pushHistory: push,
  onCommit: () => elPreview.schedule(),
  autoLayout: runAutoLayout
});

// 节点拖拽结束：回写坐标到模型树缓存（跨重投影保留位置）
onNodeDragStop(({ node }) => {
  treeModel.cachePosition(node.id, node.position.x, node.position.y);
});

const saving = ref(false);
const resultVisible = ref(false);
const elResult = ref('');

const selectedNode = computed<Node<CmpNodeData> | null>(() => {
  if (!ctrl.selectedId.value) return null;
  return (
    (getNodes.value.find((n) => n.id === ctrl.selectedId.value) as Node<CmpNodeData> | undefined) ??
    null
  );
});

// selectedId 可能是 node id 或 edge id：node 找不到时再试 edges
const selectedEdge = computed<Edge | null>(() => {
  if (!ctrl.selectedId.value || selectedNode.value) return null;
  return (getEdges.value.find((e) => e.id === ctrl.selectedId.value) as Edge | undefined) ?? null;
});

/** CmpProps 改参：重投影 + 入栈 + EL 预览刷新 */
function onPropsChange() {
  ctrl.commit();
}

function onDropNode(payload: { type: string; x: number; y: number }) {
  ctrl.insertNodeAt(payload.type, payload.x, payload.y);
}

// 保存链路 / 生成 EL / 试运行共用的画布前置校验与清空（逻辑下沉 composable）
const { resetCanvas, ensureCanvasHasNodes, ensureDataSpacesValid } = useCanvasGuards({
  treeModel,
  getNodes,
  setNodes,
  setEdges,
  select: (id) => ctrl.select(id)
});

// 链路文档：编辑态标识/业务元数据/入参登记表 + 加载/保存/返回/路由初始化
const {
  editingId,
  chainId,
  chainName,
  chainSaving,
  inputParams,
  inputParamsVisible,
  onInputParamsSave,
  loadChainToEditor,
  saveChain,
  onChainSelect,
  backToList,
  initFromRoute
} = useChainDocument({
  treeModel,
  getNodes,
  getEdges,
  setNodes,
  setEdges,
  select: (id) => ctrl.select(id),
  autoLayout: () => ctrl.autoLayout(),
  resetHistory: reset,
  ensureCanvasHasNodes,
  ensureDataSpacesValid
});

// ── tab 脏圆点信号（上报工作台 tab 壳，editor 宿主无人接听、无副作用） ──
// 不用 useFlowHistory.isDirty()：它是普通函数非响应式，且语义是「防抖窗口内
// 未入栈改动」（commit 会推进基线）。这里用独立 ref：canUndo 响应式且只在
// 真实编辑（commit 入栈）后变 true；加载换链/保存成功时归零。
const dirty = ref(false);
watch(canUndo, (v) => {
  if (v) dirty.value = true;
});
// 换链/首次加载（editingId 变化即 loadChainToEditor 完成赋值）归零
watch(editingId, () => {
  dirty.value = false;
});
watch(dirty, (v) => emit('dirty-change', v));

/** 保存链路（包装）：成功后脏圆点归零，失败保持脏（提醒未保存） */
async function handleSaveChain() {
  try {
    await saveChain();
    dirty.value = false;
  } catch {
    // 请求异常已在 axios 拦截器统一提示，此处仅保持脏态
  }
}

async function saveAsEl() {
  if (!ensureCanvasHasNodes()) return;
  if (!ensureDataSpacesValid()) return;

  // 直接从模型树序列化，不读画布 nodes/edges
  const cmpProperty = treeModel.toCmpProperty();
  if (!cmpProperty) {
    ElMessage.warning('画布上还没有真实组件');
    return;
  }

  saving.value = true;
  try {
    const { data } = await generateEl(cmpProperty);
    elResult.value = data.elStr ?? '';
    resultVisible.value = true;
  } finally {
    saving.value = false;
  }
}

// 试运行：入参/结果/步骤抽屉三态 + 必填拦截 + 步骤标题推断（逻辑下沉 composable）
const {
  previewVisible,
  previewRunning,
  previewRequest,
  previewResultVisible,
  previewResult,
  openPreview,
  runPreview,
  reopenPreview,
  stepDetailVisible,
  currentStep,
  openStepDetail,
  stepTitle
} = usePreviewRun({
  treeModel,
  inputParams,
  ensureCanvasHasNodes,
  ensureDataSpacesValid
});

// 键盘快捷键：动作注入，window 绑定/解绑在 composable 内自理。
// workbench 多 canvas tab 共存时，非激活实例短路（undo/Delete 不串台）
useEditorHotkeys(
  {
    deselect: () => ctrl.deselect(),
    requestDeleteNode: () => ctrl.requestDeleteNode(),
    undo,
    redo,
    selectAll: () => ctrl.selectAll(),
    copy: () => ctrl.copy(),
    paste: () => ctrl.paste(),
    saveAsEl
  },
  () => props.active
);

onMounted(() => {
  // 预拉物料（唯一数据源）：成功后重投影一次，把加载瞬间渲染为「未注册」的业务卡刷新成真物料
  void useComponentOptions()
    .ensureOptions()
    .then(() => ctrl.reproject());
  // 建立历史基线，保证撤销按钮初始禁用且首次编辑可撤销
  nextTick(reset);
  if (props.host === 'editor') {
    // 从链路列表「编排」跳入：query.id 指定已保存链路，异步加载替换空画布
    initFromRoute();
  } else if (props.loadChainId != null) {
    // 工作台宿主：v-show 保活 mount 一次即加载；同链单例保证 loadChainId 不再变化
    void loadChainToEditor(props.loadChainId);
  }
});
</script>

<style scoped>
/* 尺寸只定义一次：--palette-size/--props-size 是常量；
   --palette-w/--props-w 是网格实际列宽，折叠时置 0。
   工具栏与主体共用同一组列轨道，竖分隔线即列分界，天然不错开。 */
.databus-editor {
  --palette-size: 248px;
  --props-size: 300px;
  --palette-w: var(--palette-size);
  --props-w: var(--props-size);
  /* 工具栏中段两侧预留位：展开时仅 12px 呼吸间隙；折叠时原位悬浮的左段
     （链路编码 248）/右段（链路切换器 300）仍占着画布上方空间，内边距等量
     让出，防止中段按钮随 1fr 列加宽滑入悬浮区遮住它们 */
  --toolbar-pl: 12px;
  --toolbar-pr: 12px;

  display: grid;
  grid-template-rows: 48px minmax(0, 1fr);
  grid-template-columns: var(--palette-w) minmax(0, 1fr) var(--props-w);

  /* 跟随 plus-ui 满高页面惯例（workflow 设计器/AI 聊天页同值） */
  height: calc(100vh - 123px);
  background-color: var(--el-bg-color);

  transition: grid-template-columns 0.2s ease;
}

/* 工作台内嵌宿主：高度交给工作台 tab 面板容器（其自身已处理满高滚动） */
.databus-editor.is-embedded {
  height: 100%;
}

/* 折叠只改列宽变量；轨道收缩，画布自然外扩。
   同步加大中段工具栏同侧预留（常量宽 + 12px 呼吸间隙），
   与 grid-template-columns 的 0.2s 过渡等速，按钮绝对位置钉住不动 */
.databus-editor.is-palette-collapsed {
  --palette-w: 0px;
  --toolbar-pl: calc(var(--palette-size) + 12px);
}

.databus-editor.is-props-collapsed {
  --props-w: 0px;
  --toolbar-pr: calc(var(--props-size) + 12px);
}

/* 全屏态脱离 RuoYi 外壳后需撑满整个屏幕（否则底部露出 123px 空带）；
   UA 样式表对 :fullscreen 元素默认黑底，显式跟随页面背景色 */
.databus-editor:fullscreen {
  height: 100%;
  background-color: var(--el-bg-color);
}

/* 工具栏三段由 EditorToolbar 以 display:contents 直接落入第一行网格轨道 */

/* body 容器让位：物料 / 画布 / 属性直接成为第二行网格条目 */
.databus-editor__body {
  display: contents;
}

.databus-editor__palette {
  grid-row: 2;
  grid-column: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden auto;
  border-right: 1px solid var(--el-border-color-lighter);
  transition: border-right-color 0.2s ease;
}

/* 轨道收 0 时隐掉竖边，避免画布左缘残留一根线 */
.databus-editor.is-palette-collapsed .databus-editor__palette {
  border-right-color: transparent;
}

/* 内容固定 248px 不参与挤压回流（折叠动画期间不重排） */
.databus-editor__palette :deep(.cmp-palette) {
  width: var(--palette-size);
}

.databus-editor__canvas-wrap {
  position: relative;
  grid-row: 2;
  grid-column: 2;
  min-width: 0;
  min-height: 0;
}

/* 收起后画布左上角的展开按钮：与画布浮层控件同语言（26×26、白底卡片） */
.databus-editor__palette-expand {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  box-shadow: 0 1px 4px rgb(0 0 0 / 12%);
  transition: color 0.15s, border-color 0.15s;
}

.databus-editor__palette-expand:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
}

/* 属性面板容器/折叠竖边/页签样式整体迁入 EditorPropsPanel */

/* 收起后画布右上角展开钮：与物料区展开钮同款（26×26 白底卡片）。
   位于最右缘（right:12），自动排列圆钮在其左侧（FlowSidePanel margin-right:46 让位），
   top:14 对齐圆钮中线（15 + 24/2 - 26/2） */
.databus-editor__props-expand {
  position: absolute;
  top: 14px;
  right: 12px;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  box-shadow: 0 1px 4px rgb(0 0 0 / 12%);
  transition: color 0.15s, border-color 0.15s;
}

.databus-editor__props-expand:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
}
</style>
