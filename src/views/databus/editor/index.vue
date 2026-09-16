<template>
  <div ref="rootRef" class="databus-editor">
    <!-- 顶部工具栏 -->
    <div class="databus-editor__toolbar">
      <span class="databus-editor__title">数据总线编排器</span>
      <el-divider direction="vertical" />
      <span class="databus-editor__field-label">链路 ID</span>
      <el-input v-model="chainId" class="databus-editor__chain-input" size="small" placeholder="databus_chain_1" />
      <div class="databus-editor__toolbar-right">
        <el-tooltip content="撤销 (Ctrl+Z)" placement="bottom">
          <el-button size="small" :disabled="!canUndo" @click="undo">
            <el-icon class="el-icon--left"><RefreshLeft /></el-icon>撤销
          </el-button>
        </el-tooltip>
        <el-tooltip content="重做 (Ctrl+Shift+Z)" placement="bottom">
          <el-button size="small" :disabled="!canRedo" @click="redo">
            <el-icon class="el-icon--left"><RefreshRight /></el-icon>重做
          </el-button>
        </el-tooltip>
        <el-dropdown trigger="click" popper-class="databus-mock-dropdown" @command="loadMock">
          <el-button size="small">
            <el-icon class="el-icon--left"><Files /></el-icon>载入示例
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="(preset, i) in MOCK_PRESETS"
                :key="preset.key"
                :command="preset.key"
              >
                <div class="databus-editor__mock-item">
                  <span class="databus-editor__mock-num">#{{ String(i + 1).padStart(2, '0') }}</span>
                  <span>{{ preset.name }}</span>
                  <span class="databus-editor__mock-desc">{{ preset.desc }}</span>
                </div>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button size="small" @click="resetCanvas">
          <el-icon class="el-icon--left"><Delete /></el-icon>清空
        </el-button>
        <el-tooltip content="执行引擎骨架完成后开放" placement="bottom">
          <span>
            <el-button size="small" disabled>
              <el-icon class="el-icon--left"><VideoPlay /></el-icon>试运行
            </el-button>
          </span>
        </el-tooltip>
        <el-button size="small" type="primary" :loading="saving" @click="saveAsEl">
          <el-icon class="el-icon--left"><Check /></el-icon>保存生成 EL
        </el-button>
      </div>
    </div>

    <!-- 三栏：组件面板 / 画布 / 参数表单 -->
    <div class="databus-editor__body">
      <div class="databus-editor__palette" :class="{ 'is-collapsed': paletteCollapsed }">
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
      <div class="databus-editor__props" :class="{ 'is-collapsed': propsCollapsed }">
        <div class="databus-editor__props-header">
          <button
            type="button"
            class="databus-editor__props-fold"
            title="收起属性面板"
            @click="setPropsCollapsed(true)"
          >
            <el-icon><Fold /></el-icon>
          </button>
        </div>
        <el-tabs v-model="activeTab" class="databus-editor__tabs">
          <el-tab-pane label="属性" name="props">
            <CmpProps
              :node="selectedNode"
              :duplicate="selectedDuplicate"
              @delete="ctrl.requestDeleteNode($event)"
              @data-change="onPropsChange"
            />
          </el-tab-pane>
          <el-tab-pane label="EL 预览" name="el">
            <FlowElPreview />
          </el-tab-pane>
          <el-tab-pane label="大纲" name="outline">
            <FlowOutline />
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>

    <!-- EL 生成结果 -->
    <el-dialog v-model="resultVisible" title="画布已转换为 LiteFlow EL" width="640px" append-to-body>
      <el-descriptions :column="1" border size="small">
        <el-descriptions-item label="链路 ID">{{ chainId || '(未填写)' }}</el-descriptions-item>
        <el-descriptions-item label="EL 表达式">
          <el-input v-model="elResult" type="textarea" :rows="5" readonly />
        </el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <span class="databus-editor__dialog-hint">阶段 1 仅做 JSON→EL 转换；落库与试运行将在执行引擎骨架完成后接入。</span>
        <el-button type="primary" @click="resultVisible = false">知道了</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useVueFlow, type Node } from '@vue-flow/core';
import { ArrowDown, Check, Delete, Expand, Files, Fold, RefreshLeft, RefreshRight, VideoPlay } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { generateEl } from '@/api/databus/el';
import CmpPalette from './components/CmpPalette.vue';
import FlowCanvas from './components/FlowCanvas.vue';
import CmpProps from './components/CmpProps.vue';
import FlowElPreview from './components/FlowElPreview.vue';
import FlowOutline from './components/FlowOutline.vue';
import { type CmpNodeData } from './cmp-tree';
import { getMockPreset, MOCK_PRESETS } from './mock-presets';
import { useFlowHistory } from './composables/useFlowHistory';
import { provideCanvasController } from './composables/useCanvasController';
import { provideEditorFullscreen } from './composables/useEditorFullscreen';
import { provideElPreview } from './composables/useElPreview';
import { provideElTreeModel } from './composables/useElTreeModel';
import { useAutoLayout } from './composables/useAutoLayout';

defineOptions({ name: 'DatabusEditor' });

// 方案 B：ElNode 模型树是唯一数据源，画布是其投影
const treeModel = provideElTreeModel();

const chainId = ref('databus_chain_1');
// 初始画布：project 空树 → 仅 start 虚拟节点
const initial = treeModel.project();

// 物料区收起态：持久化到 localStorage，下次进入保持
const PALETTE_COLLAPSED_KEY = 'databus.palette.collapsed';
const paletteCollapsed = ref(localStorage.getItem(PALETTE_COLLAPSED_KEY) === '1');
function setPaletteCollapsed(collapsed: boolean) {
  paletteCollapsed.value = collapsed;
  localStorage.setItem(PALETTE_COLLAPSED_KEY, collapsed ? '1' : '0');
}

// 属性面板收起态：与物料区同款逻辑（图标触发、画布浮动展开钮、localStorage 记忆）
const PROPS_COLLAPSED_KEY = 'databus.props.collapsed';
const propsCollapsed = ref(localStorage.getItem(PROPS_COLLAPSED_KEY) === '1');
function setPropsCollapsed(collapsed: boolean) {
  propsCollapsed.value = collapsed;
  localStorage.setItem(PROPS_COLLAPSED_KEY, collapsed ? '1' : '0');
}

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

// dagre 自动排列：提升到顶层，供 history（undo/redo）和 canvasController（结构变更后）共用
const { autoLayout: runAutoLayout } = useAutoLayout(treeModel);

// 撤销/重做历史栈：数据源切换到 ElNode 树快照
const { undo, redo, canUndo, canRedo, push, reset, isDirty } = useFlowHistory({
  treeModel,
  getNodes,
  setNodes,
  setEdges,
  autoLayout: () => runAutoLayout({ fitView: false })
});

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

// 右侧栏三 Tab：属性 / EL 预览 / 大纲。选中/取消选中自动切换仅在 props↔el 之间，
// 大纲 Tab 手动切，不被覆盖。EL 预览刷新仅在 el Tab 可见时触发省请求。
const activeTab = ref<'props' | 'el' | 'outline'>('el');
watch(
  () => !!selectedNode.value,
  (hasSel) => {
    if (hasSel && activeTab.value === 'el') activeTab.value = 'props';
    else if (!hasSel && activeTab.value === 'props') activeTab.value = 'el';
  },
  { immediate: true }
);
watch(
  activeTab,
  (tab) => {
    elPreview.active.value = tab === 'el';
    if (tab === 'el') elPreview.refresh();
  },
  { immediate: true }
);

const selectedDuplicate = computed(() => {
  const current = selectedNode.value;
  if (!current || current.data.virtual) {
    return false;
  }
  return getNodes.value.some(
    (n) => n.id !== current.id && !n.data.virtual && (n.data as CmpNodeData).cmpId === current.data.cmpId
  );
});

/** CmpProps 改参：重投影 + 入栈 + EL 预览刷新 */
function onPropsChange() {
  ctrl.commit();
}

function onDropNode(payload: { type: string; x: number; y: number }) {
  ctrl.insertNodeAt(payload.type, payload.x, payload.y);
}

async function resetCanvas() {
  try {
    await ElMessageBox.confirm('清空将撤销当前画布上的全部组件与连线，确定继续？', '清空画布', {
      type: 'warning'
    });
  } catch {
    return;
  }
  treeModel.loadFromCmpProperty(null);
  const { nodes, edges } = treeModel.project();
  setNodes(nodes);
  setEdges(edges);
  ctrl.select(null);
}

/** 载入预设示例链路：解析 CmpProperty → 投影 → 替换画布 → 重建历史基线 → 自适应视口 */
async function loadMock(key: string) {
  const preset = getMockPreset(key);
  if (!preset) {
    return;
  }
  if (isDirty()) {
    try {
      await ElMessageBox.confirm(`载入「${preset.name}」将替换当前画布内容，确定继续？`, '载入示例', {
        type: 'warning'
      });
    } catch {
      return;
    }
  }
  treeModel.loadFromCmpProperty(preset.build());
  const { nodes, edges } = treeModel.project();
  setNodes(nodes);
  setEdges(edges);
  ctrl.select(null);
  nextTick(() => {
    reset();
    // 载入示例必须 dagre 重排：投影默认坐标是顺序摆放，分支结构会绕圈
    // 拖拽/编辑时不自动重排（保留用户位置控制），仅载入示例时自动
    ctrl.autoLayout();
  });
}

async function saveAsEl() {
  const realNodes = getNodes.value.filter((n) => !(n.data as CmpNodeData).virtual);
  if (realNodes.length === 0) {
    ElMessage.warning('画布上还没有真实组件，先从左侧拖入桩组件');
    return;
  }
  const missingId = realNodes.find((n) => !(n.data as CmpNodeData).cmpId.trim());
  if (missingId) {
    ctrl.select(missingId.id);
    ElMessage.error(`「${missingId.data.label}」的组件 ID 不能为空`);
    return;
  }
  const idCount = new Map<string, number>();
  realNodes.forEach((n) =>
    idCount.set((n.data as CmpNodeData).cmpId, (idCount.get((n.data as CmpNodeData).cmpId) ?? 0) + 1)
  );
  let duplicatedId: string | null = null;
  idCount.forEach((count, id) => {
    if (duplicatedId === null && count > 1) {
      duplicatedId = id;
    }
  });
  if (duplicatedId) {
    ElMessage.error(`组件 ID「${duplicatedId}」重复，节点 ID 在同一链路中必须唯一`);
    return;
  }

  // 方案 B：直接从模型树序列化，不读画布 nodes/edges
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

// 键盘快捷键组
function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) {
    return false;
  }
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

function onKeyDown(e: KeyboardEvent) {
  const key = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;

  if (key === 'escape' && !isEditableTarget(e.target)) {
    e.preventDefault();
    ctrl.deselect();
    return;
  }

  // Delete/Backspace：删除选中节点（走控制器，改树+入栈）
  if ((key === 'delete' || key === 'backspace') && !isEditableTarget(e.target)) {
    e.preventDefault();
    void ctrl.requestDeleteNode();
    return;
  }

  if (!mod || e.altKey) {
    return;
  }

  switch (key) {
    case 'z':
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
      break;
    case 'y':
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      redo();
      break;
    case 'a':
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      ctrl.selectAll();
      break;
    case 'c':
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      ctrl.copy();
      break;
    case 'v':
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      ctrl.paste();
      break;
    case 's':
      e.preventDefault();
      saveAsEl();
      break;
  }
}

onMounted(() => {
  // 建立历史基线，保证撤销按钮初始禁用且首次编辑可撤销
  nextTick(reset);
  window.addEventListener('keydown', onKeyDown);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown));
</script>

<style scoped>
.databus-editor {
  display: flex;
  flex-direction: column;
  /* 跟随 plus-ui 满高页面惯例（workflow 设计器/AI 聊天页同值） */
  height: calc(100vh - 123px);
  background-color: var(--el-bg-color);
}

/* 全屏态脱离 RuoYi 外壳后需撑满整个屏幕（否则底部露出 123px 空带）；
   UA 样式表对 :fullscreen 元素默认黑底，显式跟随页面背景色 */
.databus-editor:fullscreen {
  height: 100%;
  background-color: var(--el-bg-color);
}

.databus-editor__toolbar {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 48px;
  padding: 0 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.databus-editor__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.databus-editor__field-label {
  margin-right: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.databus-editor__chain-input {
  width: 200px;
}

.databus-editor__toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.databus-editor__body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.databus-editor__palette {
  flex-shrink: 0;
  width: 248px;
  overflow: hidden auto;
  border-right: 1px solid var(--el-border-color-lighter);
  transition: width 0.2s ease, border-right-width 0.2s ease;
}

/* 收起：宽度过渡到 0 还画布全宽；内容固定 248px 不参与挤压回流 */
.databus-editor__palette.is-collapsed {
  width: 0;
  border-right-width: 0;
}

.databus-editor__palette :deep(.cmp-palette) {
  width: 248px;
}

.databus-editor__canvas-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
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

.databus-editor__props {
  position: relative;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 300px;
  overflow: hidden;
  border-left: 1px solid var(--el-border-color-lighter);
  transition: width 0.2s ease, border-left-width 0.2s ease;
}

/* 收起：宽度过渡到 0 还画布全宽；内容固定 300px 不参与挤压回流 */
.databus-editor__props.is-collapsed {
  width: 0;
  border-left-width: 0;
}

.databus-editor__props :deep(.databus-editor__tabs) {
  width: 300px;
}

/* 面板顶部工具行：收起钮右对齐独占一行（不与页签标题同行，与左面板结构对称） */
.databus-editor__props-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  padding: 8px 8px 0;
}

/* 收起钮：24×24 描边小钮，与物料区折叠钮同款 */
.databus-editor__props-fold {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  background-color: transparent;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  transition: color 0.15s, border-color 0.15s;
}

.databus-editor__props-fold:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
}

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

.databus-editor__tabs {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.databus-editor__tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 8px;
}

/* 页签样式与左侧物料区保持一致（12px 字号、30px 高、1px 细底线） */
.databus-editor__tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
}

.databus-editor__tabs :deep(.el-tabs__item) {
  height: 30px;
  padding: 0 10px;
  font-size: 12px;
  line-height: 30px;
}

.databus-editor__tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.databus-editor__tabs :deep(.el-tab-pane) {
  height: 100%;
}

.databus-editor__dialog-hint {
  float: left;
  padding-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.databus-editor__mock-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.4;
}

.databus-editor__mock-num {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 11px;
  color: var(--el-color-primary);
  min-width: 28px;
}

.databus-editor__mock-desc {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
</style>

<!-- 非 scoped：el-dropdown 浮层渲染在 body，需用 popper-class 全局命中 -->
<style>
.databus-mock-dropdown.el-popper {
  /* 限制最大高度避免下拉过长溢出视口；超出滚动 */
  max-height: 60vh;
  overflow-y: auto;
}

/* 滚动条样式与 Element Plus 风格一致 */
.databus-mock-dropdown.el-popper::-webkit-scrollbar {
  width: 6px;
}

.databus-mock-dropdown.el-popper::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color);
  border-radius: 3px;
}

.databus-mock-dropdown.el-popper::-webkit-scrollbar-track {
  background-color: transparent;
}
</style>
