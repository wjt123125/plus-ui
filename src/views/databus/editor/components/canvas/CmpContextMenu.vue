<template>
  <template v-if="ctrl.menu.visible">
    <div class="cmp-ctx-menu-mask" @click="ctrl.closeMenu()" @contextmenu.prevent="ctrl.closeMenu()" />
    <ul
      class="cmp-ctx-menu"
      :style="{ left: `${ctrl.menu.x}px`, top: `${ctrl.menu.y}px` }"
      @click.stop
      @contextmenu.prevent
    >
      <template v-if="ctrl.menu.scene === 'node'">
        <li class="cmp-ctx-menu__item" @click="openPickerAt('prepend')">
          <el-icon><ArrowLeftBold /></el-icon><span>在左边插入节点</span>
        </li>
        <li class="cmp-ctx-menu__item" @click="openPickerAt('append')">
          <el-icon><ArrowRightBold /></el-icon><span>在右边插入节点</span>
        </li>
        <li class="cmp-ctx-menu__item" @click="openPickerAt('replace')">
          <el-icon><Switch /></el-icon><span>替换节点</span>
        </li>
        <li class="cmp-ctx-menu__divider" />
        <li class="cmp-ctx-menu__item" @click="onCopy">
          <el-icon><CopyDocument /></el-icon><span>复制</span>
        </li>
        <li class="cmp-ctx-menu__item is-danger" @click="onDeleteNode">
          <el-icon><Delete /></el-icon><span>删除节点</span>
        </li>
      </template>

      <template v-else-if="ctrl.menu.scene === 'edge'">
        <li class="cmp-ctx-menu__item" @click="openPickerAt('insertEdge')">
          <el-icon><Plus /></el-icon><span>插入节点</span>
        </li>
      </template>

      <!-- 空白：文档动作（撤销/清空/保存…）+ 剪贴；与树右键铁律一致：只放当前文档相关动作 -->
      <template v-else>
        <li class="cmp-ctx-menu__item" :class="{ 'is-disabled': !act.canUndo.value }" @click="onUndo">
          <el-icon><RefreshLeft /></el-icon><span>撤销</span>
          <span class="cmp-ctx-menu__shortcut">Ctrl+Z</span>
        </li>
        <li class="cmp-ctx-menu__item" :class="{ 'is-disabled': !act.canRedo.value }" @click="onRedo">
          <el-icon><RefreshRight /></el-icon><span>重做</span>
          <span class="cmp-ctx-menu__shortcut">Ctrl+Shift+Z</span>
        </li>
        <li class="cmp-ctx-menu__item is-danger" @click="onReset">
          <el-icon><Delete /></el-icon><span>清空画布</span>
        </li>
        <li class="cmp-ctx-menu__divider" />
        <li class="cmp-ctx-menu__item" @click="onSelectAll">
          <el-icon><Select /></el-icon><span>全选</span>
          <span class="cmp-ctx-menu__shortcut">Ctrl+A</span>
        </li>
        <li class="cmp-ctx-menu__item" :class="{ 'is-disabled': !ctrl.canPaste.value }" @click="onPaste">
          <el-icon><DocumentCopy /></el-icon><span>粘贴</span>
          <span class="cmp-ctx-menu__shortcut">Ctrl+V</span>
        </li>
        <li class="cmp-ctx-menu__divider" />
        <li class="cmp-ctx-menu__item" @click="onSave">
          <el-icon><FolderChecked /></el-icon><span>保存链路</span>
          <span class="cmp-ctx-menu__shortcut">Ctrl+S</span>
        </li>
        <li class="cmp-ctx-menu__item" @click="onPreview">
          <el-icon><VideoPlay /></el-icon><span>试运行</span>
        </li>
        <li class="cmp-ctx-menu__item" @click="onInputParams">
          <el-icon><Operation /></el-icon><span>入参登记</span>
        </li>
        <li class="cmp-ctx-menu__item" @click="onSaveAsEl">
          <el-icon><Check /></el-icon><span>生成 EL</span>
          <span class="cmp-ctx-menu__shortcut">Ctrl+Shift+S</span>
        </li>
      </template>
    </ul>
  </template>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { useVueFlow } from '@vue-flow/core';
import {
  ArrowLeftBold,
  ArrowRightBold,
  Check,
  CopyDocument,
  Delete,
  DocumentCopy,
  FolderChecked,
  Operation,
  Plus,
  RefreshLeft,
  RefreshRight,
  Select,
  Switch,
  VideoPlay
} from '@element-plus/icons-vue';
import type { CmpNodeData } from '../../composables/useElTreeModel';
import type { PickerMode } from '../../composables/useCanvasController';
import { useCanvasController } from '../../composables/useCanvasController';
import { useEditorActions } from '../../composables/useEditorActions';

defineOptions({ name: 'CmpContextMenu' });

const ctrl = useCanvasController();
/** 文档级动作（撤销/保存/试运行…）由 ChainCanvasPane 装配注入 */
const act = useEditorActions();
const { onPaneContextMenu, onNodeContextMenu, onEdgeContextMenu } = useVueFlow();

/**
 * VueFlow 回调事件类型是 MouseEvent | TouchEvent，TouchEvent 上没有 clientX/clientY。
 * 右键菜单实际只由鼠标（contextmenu）触发；触摸分支取触点坐标仅为类型完整与长按兜底。
 */
function getEventClientPos(event: MouseEvent | TouchEvent): { x: number; y: number } {
  if ('clientX' in event) {
    return { x: event.clientX, y: event.clientY };
  }
  const touch = event.touches[0] ?? event.changedTouches[0];
  return { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 };
}

// 组件自包含注册右键事件，FlowCanvas 只需放一个标签
onPaneContextMenu((event) => {
  event.preventDefault();
  ctrl.deselect();
  ctrl.openMenu({ ...getEventClientPos(event), scene: 'blank' });
});

onNodeContextMenu(({ event, node }) => {
  event.preventDefault();
  ctrl.select(node.id);
  ctrl.openMenu({ ...getEventClientPos(event), scene: 'node', nodeId: node.id });
});

onEdgeContextMenu(({ event, edge }) => {
  event.preventDefault();
  ctrl.openMenu({ ...getEventClientPos(event), scene: 'edge', edgeId: edge.id });
});

function openPickerAt(mode: PickerMode) {
  const { x, y, nodeId, edgeId } = ctrl.menu;
  ctrl.closeMenu();
  ctrl.openPicker({ x, y, mode, nodeId, edgeId });
}

function onCopy() {
  const nodeId = ctrl.menu.nodeId ?? undefined;
  ctrl.closeMenu();
  ctrl.copy(nodeId);
}

function onDeleteNode() {
  const nodeId = ctrl.menu.nodeId ?? undefined;
  ctrl.closeMenu();
  void ctrl.requestDeleteNode(nodeId);
}

function onSelectAll() {
  ctrl.closeMenu();
  ctrl.selectAll();
}

function onPaste() {
  if (!ctrl.canPaste.value) {
    return;
  }
  ctrl.closeMenu();
  ctrl.paste();
}

// ── 空白菜单：文档级动作（先关菜单再执行，避免确认框/弹层与菜单残留互叠） ──

function onUndo() {
  if (!act.canUndo.value) return;
  ctrl.closeMenu();
  act.undo();
}

function onRedo() {
  if (!act.canRedo.value) return;
  ctrl.closeMenu();
  act.redo();
}

function onReset() {
  ctrl.closeMenu();
  act.reset();
}

function onSave() {
  ctrl.closeMenu();
  void act.save();
}

function onPreview() {
  ctrl.closeMenu();
  act.preview();
}

function onInputParams() {
  ctrl.closeMenu();
  act.openInputParams();
}

function onSaveAsEl() {
  ctrl.closeMenu();
  void act.saveAsEl();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && ctrl.menu.visible) {
    ctrl.closeMenu();
  }
}
window.addEventListener('keydown', onKeydown);
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
.cmp-ctx-menu-mask {
  position: fixed;
  inset: 0;
  z-index: 1997;
}

.cmp-ctx-menu {
  position: fixed;
  z-index: 1998;
  /* 空白场景含快捷键后缀（保存链路 + Ctrl+Shift+S 最宽），148 会折行 */
  min-width: 190px;
  padding: 4px;
  margin: 0;
  list-style: none;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  box-shadow: 0 6px 24px rgb(0 0 0 / 14%);
}

/* 菜单项右侧快捷键提示（IDE 右键菜单范式），弱化为占位文本色 */
.cmp-ctx-menu__shortcut {
  margin-left: auto;
  padding-left: 18px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  white-space: nowrap;
}

.cmp-ctx-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  font-size: 13px;
  color: var(--el-text-color-primary);
  cursor: pointer;
  border-radius: 5px;
}

.cmp-ctx-menu__item:hover {
  background-color: var(--el-fill-color-light);
}

.cmp-ctx-menu__item.is-danger {
  color: var(--el-color-danger);
}

.cmp-ctx-menu__item.is-disabled {
  color: var(--el-text-color-disabled);
  cursor: not-allowed;
}

.cmp-ctx-menu__item.is-disabled:hover {
  background: transparent;
}

.cmp-ctx-menu__divider {
  height: 1px;
  margin: 4px 6px;
  background-color: var(--el-border-color-lighter);
}
</style>
