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
        <el-button size="small" type="success" @click="openPreview">
          <el-icon class="el-icon--left"><VideoPlay /></el-icon>试运行
        </el-button>
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
        <span class="databus-editor__dialog-hint">当前仅生成 EL 表达式，链路尚未落库；可点「试运行」按 EL 真跑一次。</span>
        <el-button type="primary" @click="resultVisible = false">知道了</el-button>
      </template>
    </el-dialog>

    <!-- 试运行：入参 JSON -->
    <el-dialog v-model="previewVisible" title="试运行" width="620px" append-to-body>
      <el-alert
        title="按当前画布生成 EL 并直接真执行（不落库）。下方 JSON 即链路入参，作为上下文文档根。"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 10px"
      />
      <el-input
        v-model="previewRequest"
        type="textarea"
        :rows="10"
        placeholder='链路入参 JSON，如 {"flag":true}'
        class="databus-editor__preview-input"
      />
      <template #footer>
        <el-button @click="previewVisible = false">取消</el-button>
        <el-button type="success" :loading="previewRunning" @click="runPreview">执行</el-button>
      </template>
    </el-dialog>

    <!-- 试运行：执行结果 -->
    <el-dialog v-model="previewResultVisible" title="试运行结果" width="860px" append-to-body>
      <template v-if="previewResult">
        <el-alert
          :title="resultBanner"
          :type="previewResult.executed ? (previewResult.success ? 'success' : 'error') : 'warning'"
          :closable="false"
          show-icon
          style="margin-bottom: 10px"
        />
        <el-alert
          v-if="previewResult.errorMessage"
          :title="previewResult.errorMessage"
          type="error"
          :closable="false"
          show-icon
          style="margin-bottom: 10px"
        />
        <el-alert
          v-if="previewResult.valid === false && previewResult.message"
          :title="previewResult.message"
          type="warning"
          :closable="false"
          show-icon
          style="margin-bottom: 10px"
        />

        <el-descriptions :column="1" border size="small" style="margin-bottom: 10px">
          <el-descriptions-item label="EL 表达式">
            <el-input :model-value="previewResult.elStr" type="textarea" :rows="3" readonly />
          </el-descriptions-item>
        </el-descriptions>

        <template v-if="previewResult.executed">
          <!-- response 组件产出 $.response 置顶高亮 -->
          <template v-if="responsePart !== null">
            <div class="databus-editor__response-title">$.response（流程响应）</div>
            <el-input
              :model-value="JSON.stringify(responsePart, null, 2)"
              type="textarea"
              :rows="4"
              readonly
              class="databus-editor__response-box"
            />
          </template>

          <div class="databus-editor__section-title">
            执行步骤（{{ previewResult.steps?.length ?? 0 }}）
          </div>
          <el-table :data="previewResult.steps ?? []" size="small" border style="margin-bottom: 10px">
            <el-table-column type="index" label="#" width="42" />
            <el-table-column label="数据空间" prop="tag" min-width="120" show-overflow-tooltip />
            <el-table-column label="组件" prop="nodeId" min-width="100" show-overflow-tooltip />
            <el-table-column label="结果" width="70">
              <template #default="{ row }">
                <el-tag size="small" :type="row.success ? 'success' : 'danger'">
                  {{ row.success ? '成功' : '失败' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="耗时(ms)" prop="timeSpent" width="84" />
            <el-table-column label="错误信息" prop="errorMessage" min-width="160" show-overflow-tooltip />
          </el-table>

          <div class="databus-editor__section-title">执行后上下文（JSON 快照）</div>
          <el-input
            :model-value="prettyContext"
            type="textarea"
            :rows="10"
            readonly
          />
        </template>
      </template>
      <template #footer>
        <el-button @click="previewResultVisible = false">关闭</el-button>
        <el-button type="success" @click="reopenPreview">再跑一次</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useVueFlow, type Node } from '@vue-flow/core';
import { ArrowDown, Check, Delete, Expand, Files, Fold, RefreshLeft, RefreshRight, VideoPlay } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { generateEl, previewRun } from '@/api/databus/el';
import type { PreviewRunVo } from '@/api/databus/el/types';
import CmpPalette from './components/CmpPalette.vue';
import FlowCanvas from './components/FlowCanvas.vue';
import CmpProps from './components/CmpProps.vue';
import FlowElPreview from './components/FlowElPreview.vue';
import FlowOutline from './components/FlowOutline.vue';
import { type CmpNodeData } from './composables/useElTreeModel';
import { getMockPreset, MOCK_PRESETS } from './mock-presets';
import { useFlowHistory } from './composables/useFlowHistory';
import { provideCanvasController } from './composables/useCanvasController';
import { provideEditorFullscreen } from './composables/useEditorFullscreen';
import { provideElPreview } from './composables/useElPreview';
import { provideElTreeModel } from './composables/useElTreeModel';
import { useAutoLayout } from './composables/useAutoLayout';

defineOptions({ name: 'DatabusEditor' });

// ElNode 模型树是唯一数据源，画布是它的投影
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

/** 画布上至少有一个真实（非虚拟）节点 */
function ensureCanvasHasNodes(): boolean {
  const realNodes = getNodes.value.filter((n) => !(n.data as CmpNodeData).virtual);
  if (realNodes.length === 0) {
    ElMessage.warning('画布上还没有真实组件，先从左侧拖入或「载入示例」');
    return false;
  }
  return true;
}

/** 业务叶子数据空间名非空且唯一；有问题则选中并提示 */
function ensureDataSpacesValid(): boolean {
  const result = treeModel.validateDataSpaces();
  if (result.ok === false) {
    ctrl.select(result.nodeId);
    if (result.reason === 'empty') {
      ElMessage.error(`「${result.label}」的数据空间名不能为空`);
    } else {
      ElMessage.error(`数据空间名「${result.name}」重复，画布内必须唯一`);
    }
    return false;
  }
  return true;
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

// ── 试运行（1C：生成 EL → 校验 → 真执行，不落库） ──

const previewVisible = ref(false);
const previewRunning = ref(false);
const previewRequest = ref('{}');
const previewResultVisible = ref(false);
const previewResult = ref<PreviewRunVo | null>(null);

/** 打开试运行入参弹窗：画布非空且数据空间名合法 */
function openPreview() {
  if (!ensureCanvasHasNodes()) return;
  if (!ensureDataSpacesValid()) return;
  previewResult.value = null;
  previewVisible.value = true;
}

async function runPreview() {
  // 入参必须是合法 JSON（空文本按 {} 处理），顺手格式化回写
  let parsed: unknown;
  try {
    parsed = JSON.parse(previewRequest.value.trim() || '{}');
  } catch {
    ElMessage.error('入参不是合法 JSON，请检查后再执行');
    return;
  }
  previewRequest.value = JSON.stringify(parsed, null, 2);

  if (!ensureDataSpacesValid()) {
    previewVisible.value = false;
    return;
  }
  const cmpProperty = treeModel.toCmpProperty();
  if (!cmpProperty) {
    ElMessage.warning('画布上还没有真实组件');
    return;
  }
  previewRunning.value = true;
  try {
    const { data } = await previewRun({ jsonEl: cmpProperty, requestJson: previewRequest.value });
    previewResult.value = data;
    previewVisible.value = false;
    previewResultVisible.value = true;
  } finally {
    previewRunning.value = false;
  }
}

function reopenPreview() {
  previewResultVisible.value = false;
  previewVisible.value = true;
}

const resultBanner = computed(() => {
  const r = previewResult.value;
  if (!r) return '';
  if (r.executed) return r.success ? '执行成功' : '执行失败（见步骤表与错误信息）';
  return r.valid === false ? 'EL 校验未通过，未执行' : '未执行';
});

/** 上下文快照解析为对象（后端给的是 JSON 字符串） */
const contextObj = computed<unknown>(() => {
  const raw = previewResult.value?.contextJson;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

/** $.response 片段（response 组件固定写这里），置顶单独展示 */
const responsePart = computed<unknown>(() => {
  const obj = contextObj.value;
  if (obj && typeof obj === 'object' && 'response' in obj) {
    return (obj as Record<string, unknown>).response;
  }
  return null;
});

const prettyContext = computed(() => {
  const obj = contextObj.value;
  if (obj === null) return previewResult.value?.contextJson ?? '';
  return JSON.stringify(obj, null, 2);
});

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

.databus-editor__preview-input :deep(textarea) {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
}

.databus-editor__section-title {
  margin: 4px 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.databus-editor__response-title {
  margin: 4px 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-success);
}

.databus-editor__response-box {
  margin-bottom: 10px;
}

.databus-editor__response-box :deep(textarea) {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  background-color: var(--el-color-success-light-9);
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
