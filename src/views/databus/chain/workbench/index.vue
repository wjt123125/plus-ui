<template>
  <div class="chainwb-page">
    <!--
      链路工作台（三栏推拉布局，无遮罩抽屉，与组件工作台同构）：
        AI 助手栏 / 工作面板（链路画布多 tab，主内容区常驻） / 链路树（目录 + 链路）
      tab 身份 = 链路（canvas:{chainId}，同链单例），v-show 切换不销毁，切走草稿保留；
      关闭脏 tab 弹确认。分栏宽度与开合状态记 localStorage。
      高度由 wrapper 吃 calc(100vh - 123px)、header flex-shrink:0、.chainwb flex:1 三段式分配。
    -->
    <WorkbenchHeader
      v-model:ai-collapsed="aiCollapsed"
      v-model:nav-collapsed="treeCollapsed"
      ai-label="AI 助手"
      nav-label="链路树"
    />

    <div class="chainwb">
      <!-- 栏 1：AI 助手（v1 空壳预留，点击建议无动作） -->
      <AiAssistantRail
        :collapsed="aiCollapsed"
        :width="aiWidth"
        title="AI 助手"
        welcome-title="链路助手"
        welcome-desc="用自然语言定位链路、解释编排意图，辅助排查链路执行问题。"
      />
      <Splitter v-if="!aiCollapsed" v-model="aiWidth" />

      <!-- 栏 2：工作面板（主内容区，常驻不可折叠） -->
      <ChainWorkPanel
        v-model:active-key="activeKey"
        :tabs="tabs"
        @close="wb.close"
        @dirty-change="wb.setDirty"
      />

      <!-- 栏 3：链路树（可拖宽、可收起；点链路开画布 tab，右键管目录/移动归属） -->
      <Splitter v-if="!treeCollapsed" v-model="treeWidth" target="next" />
      <ChainTree
        v-if="!treeCollapsed"
        :active-chain-id="activeTab?.chainId ?? null"
        :style="{ width: treeWidth + 'px', flexShrink: 0 }"
        @open="wb.openCanvas"
      />
    </div>
  </div>
</template>

<script setup name="DatabusChainWorkbench" lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { usePersisted } from '../../workbench/composables/usePersisted';
import Splitter from '../../workbench/components/Splitter.vue';
import WorkbenchHeader from '../../workbench/components/WorkbenchHeader.vue';
import AiAssistantRail from '../../workbench/ai/AiAssistantRail.vue';
import ChainWorkPanel from './panel/ChainWorkPanel.vue';
import ChainTree from './tree/ChainTree.vue';
import { useChainTabs } from './composables/useChainTabs';

const wb = useChainTabs();
const { tabs, activeKey, activeTab } = wb;

/** 前端偏好：AI 栏与链路树的开合与宽度（工作面板是主内容区，不参与折叠） */
const aiCollapsed = usePersisted('databus.chainwb.aiCollapsed', true);
const aiWidth = usePersisted('databus.chainwb.aiWidth', 300);
const treeCollapsed = usePersisted('databus.chainwb.treeCollapsed', false);
const treeWidth = usePersisted('databus.chainwb.treeWidth', 240);

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

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<style lang="scss" scoped>
/* 页面级 wrapper：吃掉视口高度，header 与三栏区各取所需（§2.0 高度公式） */
.chainwb-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 123px);
}

.chainwb {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
  overflow: hidden;
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 8px;
}
</style>
