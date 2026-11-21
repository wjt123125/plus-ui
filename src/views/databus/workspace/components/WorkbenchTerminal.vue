<!--
  工作区底部终端（运行 / 构建双小 tab，Trae terminal 范式）：
  与两侧 console 的独立卡片不同，这里把两种流收进同一卡片，头部小 tab 切换展示哪一条。
  「运行」内含链路执行与画布试运行两类行（按 source 分派），不再单独占一个 tab。
  两条 console（RunConsole / CompileConsole）以 bare 模式渲染日志体，头部（tab 条 + 清空/收起）
  由本容器统一提供；自动弹出仍由各自 append 驱动（见 useWorkspaceTerminal）。
-->
<template>
  <section v-if="open" class="ws-term" aria-label="终端">
    <header class="ws-term__head">
      <!-- 终端小页签：终端专属文字 tab（无胶囊轨道/滑块），激活靠字重+短下划线，与下方等宽日志同一套表达 -->
      <nav ref="tabsRef" class="ws-term__tabs" role="tablist" aria-label="终端流">
        <!-- 共享下划线：按激活段几何测量后平移，切段时滑过去而不是各段自己亮一下 -->
        <span class="ws-term__ink" :class="{ 'is-ready': inkReady }" :style="inkStyle" aria-hidden="true" />
        <button
          v-for="option in termOptions"
          :key="option.value"
          type="button"
          role="tab"
          class="ws-term__tab"
          :class="{ 'is-active': tab === option.value }"
          :aria-selected="tab === option.value"
          @click="onTabChange(option.value)"
        >
          {{ option.label }}
          <i v-if="option.badge" class="ws-term__badge">{{ option.badge }}</i>
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

    <div class="ws-term__body db-scroll">
      <RunConsole v-show="tab === 'run'" @view-record="onViewRecord" @view-preview="onViewPreview" />
      <CompileConsole v-show="tab === 'compile'" bare />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';
import RunConsole from '@/views/databus/workbench/components/RunConsole.vue';
import CompileConsole from '@/views/databus/workbench/components/CompileConsole.vue';
import { useWorkspaceTerminal } from '../composables/useWorkspaceTerminal';

defineOptions({ name: 'WorkbenchTerminal' });

/** 运行日志行「详情 ↗」上抛宿主：由工作台开 execution-record tab */
const emit = defineEmits<{
  (e: 'view-record', recordId: number | string, title?: string): void;
  (e: 'view-preview', runId: number, title?: string): void;
}>();

const { open, tab, run, comp, switchTab, close, clearActive } = useWorkspaceTerminal();

/** 段选项：错误角标并进选项，切段时滑块与角标一起跟手 */
const termOptions = computed(() => [
  { label: '运行', value: 'run', badge: run.errorCount.value || '' },
  { label: '构建', value: 'compile', badge: comp.errorCount.value || '' }
]);

/* 下划线滑块：段宽由文案决定，位移只能量不能算，量法与 DbSeg 一致 */
const tabsRef = ref<HTMLElement>();
const inkReady = ref(false);
const ink = reactive({ x: 0, w: 0 });

const inkStyle = computed(() => ({
  width: `${ink.w}px`,
  transform: `translate3d(${ink.x}px, 0, 0)`
}));

function measureInk() {
  const active = tabsRef.value?.querySelector<HTMLElement>('.ws-term__tab.is-active');
  if (!active) {
    return;
  }
  // 两端各内缩 2px，和下划线不长到文字外沿的观感一致
  ink.x = active.offsetLeft + 2;
  ink.w = Math.max(active.offsetWidth - 4, 8);
  if (!inkReady.value) {
    requestAnimationFrame(() => {
      inkReady.value = true;
    });
  }
}

watch(
  () => [tab.value, termOptions.value.map((o) => `${o.label}${o.badge ?? ''}`).join('|')],
  () => nextTick(measureInk)
);

let inkObserver: ResizeObserver | undefined;

onMounted(() => {
  void nextTick(measureInk);
  if (typeof ResizeObserver !== 'undefined' && tabsRef.value) {
    inkObserver = new ResizeObserver(() => measureInk());
    inkObserver.observe(tabsRef.value);
  }
  // 字体迟到会改变段宽（首次测量可能落在字体 swap 之前）
  void document.fonts?.ready.then(() => measureInk());
});

onBeforeUnmount(() => {
  inkObserver?.disconnect();
});

function onTabChange(value: string | number) {
  switchTab(value === 'compile' ? 'compile' : 'run');
}

function onViewRecord(recordId: number | string, title?: string) {
  emit('view-record', recordId, title);
}

function onViewPreview(runId: number, title?: string) {
  emit('view-preview', runId, title);
}

useLucideSubset();
</script>

<style lang="scss" scoped>
.ws-term {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  /* 与会话输入卡共用 --db-bottom-pane-h：两张底部卡片等高 */
  height: var(--db-bottom-pane-h, 150px);
  /* 宿主是中栏容器：四周留 8px，让终端成为一张独立浮岛卡片，而不是粘在画布底边 */
  margin: 8px;
  border-radius: var(--db-r-card);
  background: var(--db-bg-sunken, #f4f4f5);
  box-shadow: var(--db-shadow-sm), inset 0 0 0 0.5px var(--db-rule);
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
/* 终端小页签：终端专属文字 tab，起点与日志缩进对齐；下划线由共享滑块承担 */
.ws-term__tabs {
  position: relative;
  display: flex;
  align-self: stretch;
  align-items: stretch;
  gap: 16px;
}

/* 主题色下划线滑块：从激活段量出位移，切段时 0.22s 滑过去 */
.ws-term__ink {
  position: absolute;
  bottom: 0;
  left: 0;
  z-index: 0;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--app-accent-strong, var(--el-color-primary));
  opacity: 0;
  pointer-events: none;
  will-change: transform;

  /* 首帧直接落位，避免从左侧 0 位置滑入的假动画 */
  &.is-ready {
    opacity: 1;
    transition:
      transform 0.22s cubic-bezier(0.4, 0, 0.2, 1),
      width 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  }
}

.ws-term__tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 2px;
  border: 0;
  background: none;
  /* 字重恒定：切换时文字不重新排版，滑块宽度才稳 */
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: color 0.15s ease;

  &:hover {
    color: var(--el-text-color-primary);
  }

  &.is-active {
    color: var(--el-text-color-primary);
  }
}

/* 错误角标：上标式纯红数字，不占背景块，避免和文字抢注意力 */
.ws-term__badge {
  font-size: 10px;
  font-style: normal;
  font-weight: 600;
  line-height: 1;
  color: var(--el-color-danger, #f56c6c);
  transform: translateY(-5px);
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
