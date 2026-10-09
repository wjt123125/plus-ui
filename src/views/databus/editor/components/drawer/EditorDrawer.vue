<template>
  <div class="editor-drawer" :class="{ 'is-collapsed': collapsed }">
    <el-tabs v-model="activeTab" class="editor-drawer__tabs">
      <!-- 链路树 tab 仅工作台宿主出现（全屏编辑器无跨链导航）；内容由宿主经 slot 注入 -->
      <el-tab-pane v-if="showTreeTab" label="链路树" name="tree" lazy>
        <div class="editor-drawer__tree">
          <slot name="tree" />
        </div>
      </el-tab-pane>
      <el-tab-pane label="属性" name="props" lazy>
        <!-- 桥接子树：属性组件仍 inject treeModel/canvasController；key 随画布切换重建 -->
        <DrawerPortBridge v-if="port" :key="port.uid" :port="port">
          <CmpProps
            v-if="selectedNode"
            :node="selectedNode"
            @delete="port.deleteNode($event)"
            @data-change="port.commit()"
          />
          <EdgeProps v-else :edge="selectedEdge" />
        </DrawerPortBridge>
        <el-empty v-else :image-size="56" description="先从链路树打开一条链路" />
      </el-tab-pane>
      <el-tab-pane label="EL 预览" name="el" lazy>
        <FlowElPreview v-if="port" :preview="port.elPreview" />
        <el-empty v-else :image-size="56" description="先从链路树打开一条链路" />
      </el-tab-pane>
      <el-tab-pane label="大纲" name="outline" lazy>
        <FlowOutline
          v-if="port"
          :items="outlineItems"
          :selected-id="outlineSelectedId"
          @locate="port.outline.locate($event)"
        />
        <el-empty v-else :image-size="56" description="先从链路树打开一条链路" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Fold } from '@element-plus/icons-vue';
import type { Edge, Node } from '@vue-flow/core';
import DrawerPortBridge from './DrawerPortBridge.vue';
import CmpProps from '../panels/CmpProps.vue';
import EdgeProps from '../panels/EdgeProps.vue';
import FlowElPreview from '../panels/FlowElPreview.vue';
import FlowOutline from '../panels/FlowOutline.vue';
import type { CmpNodeData } from '../../composables/useElTreeModel';
import type { DrawerPort } from '../../composables/useDrawerPort';
import type { OutlineItem } from '../../composables/useOutlineItems';

defineOptions({ name: 'EditorDrawer' });

type DrawerTabKey = 'tree' | 'props' | 'el' | 'outline';

const props = withDefaults(
  defineProps<{
    /** 当前激活画布的名片；无画布时属性/EL/大纲显示空态（树 tab 不受影响） */
    port: DrawerPort | null;
    collapsed?: boolean;
    /** 是否显示链路树 tab：工作台 true、全屏编辑器 false */
    showTreeTab?: boolean;
    /** 初始停留 tab：工作台 'tree'、编辑器 'el' */
    defaultTab?: DrawerTabKey;
  }>(),
  { collapsed: false, showTreeTab: false, defaultTab: 'el' }
);

const emit = defineEmits<{ fold: [] }>();

// 抽屉壳单例，tab 状态只此一份；树/大纲手动停靠不被选中态抢走
const activeTab = ref<DrawerTabKey>(props.defaultTab);

// port 内字段多为 Ref，模板经普通对象访问不会自动解包，统一在这里显式解包
const selectedNode = computed<Node<CmpNodeData> | null>(() => props.port?.selectedNode.value ?? null);
const selectedEdge = computed<Edge | null>(() => props.port?.selectedEdge.value ?? null);
const outlineItems = computed<OutlineItem[]>(() => props.port?.outline.items.value ?? []);
const outlineSelectedId = computed<string | null>(() => props.port?.outline.selectedId.value ?? null);

// 选中/取消选中自动切换仅在 props↔el 之间；停在 tree/outline 时不抢 tab。
// 源随 port 切换重算：切到有选中节点的画布也会联动。
watch(
  () => {
    const p = props.port;
    return p ? !!(p.selectedNode.value || p.selectedEdge.value) : false;
  },
  (hasSel) => {
    if (hasSel && activeTab.value === 'el') activeTab.value = 'props';
    else if (!hasSel && activeTab.value === 'props') activeTab.value = 'el';
  },
  { immediate: true }
);

// EL 预览刷新门闸：仅 el tab 可见且画布激活时刷新（省请求）；切 tab/换画布即时同步
watch(
  [activeTab, () => props.port],
  () => {
    const p = props.port;
    if (!p) return;
    if (activeTab.value === 'el') {
      p.elPreview.active.value = true;
      void p.elPreview.refresh();
    } else {
      p.elPreview.active.value = false;
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.editor-drawer {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background-color: var(--el-bg-color);
  border-left: 1px solid var(--el-border-color-lighter);
  transition: border-left-color 0.2s ease;
}

/* 轨道收 0 时隐掉竖边，避免画布右缘残留一根线 */
.editor-drawer.is-collapsed {
  border-left-color: transparent;
}

/* 链路树 slot 容器：撑满 pane，树内部自理滚动 */
.editor-drawer__tree {
  height: 100%;
  min-height: 0;
}

.editor-drawer__tabs {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.editor-drawer__tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 8px;
}

/* 页签样式与左侧物料区保持一致（12px 字号、30px 高、1px 细底线）；
   四 tab 共存时压缩左右内边距防溢出 */
.editor-drawer__tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
}

.editor-drawer__tabs :deep(.el-tabs__item) {
  height: 30px;
  padding: 0 8px;
  font-size: 12px;
  line-height: 30px;
}

.editor-drawer__tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.editor-drawer__tabs :deep(.el-tab-pane) {
  height: 100%;
}

/* 收起钮：24×24 描边小钮，与物料区折叠钮同款 */
.editor-drawer__fold {
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
  transition:
    color 0.15s,
    border-color 0.15s;
}

.editor-drawer__fold:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
}
</style>
