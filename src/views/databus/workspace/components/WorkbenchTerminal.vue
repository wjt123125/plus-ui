<!--
  工作区底部终端（执行 / 编译双小 tab，Trae terminal 范式）：
  与两侧 console 的独立卡片不同，这里把两种流收进同一卡片，头部小 tab 切换展示哪一条。
  两条 console（ExecuteConsole / CompileConsole）以 bare 模式渲染日志体，头部（tab 条 + 清空/收起）
  由本容器统一提供；自动弹出仍由各自 append 驱动（见 useWorkspaceTerminal）。
-->
<template>
  <section v-if="open" class="ws-term" aria-label="终端">
    <header class="ws-term__head">
      <nav class="ws-term__tabs">
        <button
          type="button"
          class="ws-term__tab"
          :class="{ 'is-active': tab === 'execute' }"
          @click="switchTab('execute')"
        >
          执行
          <i v-if="exec.errorCount.value" class="ws-term__badge">{{ exec.errorCount.value }}</i>
        </button>
        <button
          type="button"
          class="ws-term__tab"
          :class="{ 'is-active': tab === 'compile' }"
          @click="switchTab('compile')"
        >
          编译
          <i v-if="comp.errorCount.value" class="ws-term__badge">{{ comp.errorCount.value }}</i>
        </button>
      </nav>
      <span class="ws-term__spacer" />
      <el-tooltip content="清空" placement="top" :show-after="300">
        <button type="button" class="ws-term__btn" @click="clearActive">
          <SvgIcon icon-class="lucide:trash" />
        </button>
      </el-tooltip>
      <el-tooltip content="收起终端" placement="top" :show-after="300">
        <button type="button" class="ws-term__btn" @click="close">
          <SvgIcon icon-class="lucide:x" />
        </button>
      </el-tooltip>
    </header>

    <div class="ws-term__body">
      <ExecuteConsole v-show="tab === 'execute'" bare />
      <CompileConsole v-show="tab === 'compile'" bare />
    </div>
  </section>
</template>

<script setup lang="ts">
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';
import ExecuteConsole from '@/views/databus/workbench/components/ExecuteConsole.vue';
import CompileConsole from '@/views/databus/workbench/components/CompileConsole.vue';
import { useWorkspaceTerminal } from '../composables/useWorkspaceTerminal';

defineOptions({ name: 'WorkbenchTerminal' });

const { open, tab, exec, comp, switchTab, close, clearActive } = useWorkspaceTerminal();

useLucideSubset();
</script>

<style lang="scss" scoped>
.ws-term {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  height: 200px;
  /* 宿主是中栏容器（工作面板下方）：左右 8px 与 tab strip 的内缩对齐，卡片不贴工作台边框 */
  margin: 6px 8px 8px;
  border-radius: var(--app-radius-lg, 14px);
  background: var(--el-bg-color, #fff);
  box-shadow: var(--wb-tab-card-shadow);
  overflow: hidden;
}

.ws-term__head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 6px 0 8px;
}
.ws-term__tabs {
  display: flex;
  align-items: center;
  gap: 4px;
}
.ws-term__tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 10px;
  border: none;
  border-radius: var(--app-radius-md, 10px);
  background: transparent;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;

  &:hover {
    background: var(--el-fill-color-light, #f5f7fa);
  }

  &.is-active {
    background: var(--wb-tab-card-bg);
    color: var(--el-text-color-primary, #1d2129);
    font-weight: 600;
    box-shadow: var(--wb-tab-card-shadow);
  }
}
.ws-term__badge {
  min-width: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--el-color-danger-light-9, #fef0f0);
  color: var(--el-color-danger, #f56c6c);
  font-size: 11px;
  font-style: normal;
  font-weight: 600;
  line-height: 15px;
  text-align: center;
}
.ws-term__spacer {
  flex: 1;
}
.ws-term__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--el-text-color-secondary);
  font-size: 14px;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;

  &:hover {
    background: var(--el-fill-color-light, #f5f7fa);
    color: var(--el-color-primary);
  }
}
.ws-term__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
