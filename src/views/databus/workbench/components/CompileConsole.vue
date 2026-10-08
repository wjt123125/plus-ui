<!--
  编译控制台（工作台级底部抽屉，Trae terminal 范式）：
  - 开合由 WorkbenchHeader 的 panel-bottom 开关控制（useCompileConsole 单例，编译失败自动弹出）；
  - 日志行 = 时间 + 组件编码 + 概要，失败条目下挂 javac 诊断明细；
  - 诊断行可点击 → requestReveal → index.vue 激活对应 form tab → FormPane 切执行体 → ScriptTab 跳行居中。
  视觉对齐工作台 Safari 卡片语言：14px 圆角 + 浮起投影，mono 字体日志。
-->
<template>
  <section v-if="open" class="cc-console" aria-label="编译输出">
    <header class="cc-console__head">
      <span class="cc-console__title">编译输出</span>
      <span v-if="errorCount" class="cc-console__count">{{ errorCount }} 处错误</span>
      <span class="cc-console__spacer" />
      <el-tooltip content="清空" placement="top" :show-after="300">
        <button type="button" class="cc-console__btn" :disabled="!entries.length" @click="clear">
          <SvgIcon icon-class="lucide:trash" />
        </button>
      </el-tooltip>
      <el-tooltip content="收起面板" placement="top" :show-after="300">
        <button type="button" class="cc-console__btn" @click="open = false">
          <SvgIcon icon-class="lucide:x" />
        </button>
      </el-tooltip>
    </header>
    <div ref="bodyRef" class="cc-console__body">
      <div v-if="!entries.length" class="cc-console__empty">
        暂无编译输出——发布脚本后，编译结果会显示在这里
      </div>
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="cc-console__entry"
        :class="`is-${entry.level}`"
      >
        <span class="cc-console__time">{{ entry.time }}</span>
        <span class="cc-console__code">{{ entry.code || `#${entry.componentId}` }}</span>
        <div class="cc-console__text">
          <div class="cc-console__line">{{ entry.text }}</div>
          <button
            v-for="(d, i) in entry.diagnostics"
            :key="i"
            type="button"
            class="cc-console__diag"
            :disabled="d.line <= 0"
            :title="d.line > 0 ? `跳到第 ${d.line} 行` : '无行号信息'"
            @click="onReveal(entry, d)"
          >
            <template v-if="d.line > 0">[{{ d.line }}:{{ d.column }}] </template>{{ d.message }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { ScriptDiagnostic } from '@/api/databus/component/types';
import { useLucideSubset } from '../composables/useLucideSubset';
import { useCompileConsole, type CompileLogEntry } from '../composables/useCompileConsole';

defineOptions({ name: 'CompileConsole' });

const { open, entries, errorCount, clear, requestReveal } = useCompileConsole();

const bodyRef = ref<HTMLElement>();

useLucideSubset();

// 新日志到达自动滚到底部（terminal 惯例：尾部是最新输出）
watch(
  () => entries.value.length,
  async () => {
    await nextTick();
    if (bodyRef.value) {
      bodyRef.value.scrollTop = bodyRef.value.scrollHeight;
    }
  }
);

function onReveal(entry: CompileLogEntry, d: ScriptDiagnostic) {
  if (d.line <= 0) {
    return;
  }
  requestReveal({ componentId: entry.componentId, line: d.line, column: d.column });
}
</script>

<style lang="scss" scoped>
.cc-console {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  height: 200px;
  margin-top: 6px;
  border-radius: var(--app-radius-lg, 14px);
  background: var(--el-bg-color, #fff);
  box-shadow: var(--wb-tab-card-shadow);
  overflow: hidden;

  &__head {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    padding: 0 6px 0 12px;
  }

  &__title {
    font-size: 12px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  &__count {
    padding: 1px 8px;
    border-radius: 8px;
    background: var(--el-color-danger-light-9, #fef0f0);
    color: var(--el-color-danger, #f56c6c);
    font-size: 11px;
    font-weight: 600;
  }

  &__spacer {
    flex: 1;
  }

  &__btn {
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

    &:hover:not(:disabled) {
      background: var(--el-fill-color-light, #f5f7fa);
      color: var(--el-color-primary);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.4;
    }
  }

  &__body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 2px 0 8px;
    font-family: 'JetBrains Mono', Consolas, monospace;
    font-size: 12px;
    line-height: 1.7;
  }

  &__empty {
    padding: 24px 0;
    text-align: center;
    color: var(--el-text-color-placeholder);
  }

  &__entry {
    display: grid;
    grid-template-columns: 64px minmax(80px, auto) 1fr;
    column-gap: 12px;
    padding: 2px 12px;

    /* terminal 惯例：失败红、成功绿，概要行一眼分级 */
    &.is-error .cc-console__line {
      color: var(--el-color-danger, #f56c6c);
      font-weight: 600;
    }

    &.is-success .cc-console__line {
      color: var(--el-color-success, #67c23a);
    }
  }

  &__time {
    color: var(--el-text-color-placeholder);
  }

  &__code {
    color: var(--el-text-color-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__text {
    min-width: 0;
    word-break: break-all;
  }

  &__diag {
    display: block;
    width: 100%;
    padding: 0 4px;
    border: none;
    border-radius: 4px;
    background: transparent;
    text-align: left;
    color: var(--el-color-danger, #f56c6c);
    font: inherit;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--el-fill-color-light, #f5f7fa);
    }

    &:disabled {
      cursor: default;
      color: var(--el-text-color-secondary);
    }
  }
}
</style>
