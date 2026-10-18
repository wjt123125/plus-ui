
<template>
  <div class="ec-root">
    <!--
      执行控制台（链路工作台底部抽屉，Node-RED debug sidebar / IDE terminal 范式）：
      - 开合由 WorkbenchHeader 的 panel-bottom 开关控制（useExecuteConsole 单例，执行完自动弹出）；
      - 日志行 = 时间 + 链路编码 + 成败概要（成功带耗时，失败带错误消息）；
      - 有总账记录（recordId）时行尾可点「查看记录」，就地打开执行详情抽屉（不跳离工作台）。
      视觉对齐编译控制台：14px 圆角卡片 + mono 字体日志 + 尾部自动滚动。
    -->
    <!-- 外层 transition 要求单根：wrapper 用 display:contents 不生成布局盒，section 仍是原 flex 子项 -->
    <section v-if="bare || open" class="ec-console" :class="{ 'is-bare': bare }" aria-label="执行输出">
    <header v-if="!bare" class="ec-console__head">
      <span class="ec-console__title">执行记录</span>
      <span v-if="errorCount" class="ec-console__count">最近一次失败</span>
      <span class="ec-console__spacer" />
      <el-tooltip content="清空" placement="top" :show-after="300">
        <button type="button" class="ec-console__btn" :disabled="!entries.length" @click="clear">
          <SvgIcon icon-class="lucide:trash" />
        </button>
      </el-tooltip>
      <el-tooltip content="收起面板" placement="top" :show-after="300">
        <button type="button" class="ec-console__btn" @click="open = false">
          <SvgIcon icon-class="lucide:x" />
        </button>
      </el-tooltip>
    </header>
    <div ref="bodyRef" class="ec-console__body">
      <div v-if="!entries.length" class="ec-console__empty">
        暂无执行记录——在链路树右键已发布链路「执行」，结果会显示在这里
      </div>
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="ec-console__entry"
        :class="`is-${entry.level}`"
      >
        <span class="ec-console__time">{{ entry.time }}</span>
        <span class="ec-console__code">#{{ entry.chainCode || entry.chainId }}</span>
        <div class="ec-console__text">
          <div class="ec-console__line">
            <span class="ec-console__result">{{ entry.level === 'success' ? '执行成功' : '执行失败' }}</span>
            <span v-if="entry.costTime != null" class="ec-console__cost">{{ entry.costTime }} ms</span>
            <button
              v-if="entry.recordId"
              type="button"
              class="ec-console__record"
              title="查看执行记录详情"
              @click="openRecord(entry)"
            >
              查看记录
            </button>
          </div>
          <div v-if="entry.level === 'error' && entry.text" class="ec-console__error">{{ entry.text }}</div>
        </div>
      </div>
    </div>
    </section>
    <ExecutionDetailDrawer
      v-model:visible="detailVisible"
      :record-id="detailRecordId"
      @rerun="handleRerunDone"
    />
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import ExecutionDetailDrawer from '@/views/databus/execution/ExecutionDetailDrawer.vue';
import type { DatabusExecutionResult } from '@/api/databus/execution/types';
import { useLucideSubset } from '../composables/useLucideSubset';
import { useExecuteConsole, type ExecuteLogEntry } from '../composables/useExecuteConsole';

defineOptions({ name: 'ExecuteConsole' });

/** bare=true：由工作区终端容器统一提供头部（tab 条 + 清空/收起），本组件只渲日志体 */
withDefaults(defineProps<{ bare?: boolean }>(), { bare: false });

const { open, entries, errorCount, clear, append } = useExecuteConsole();

const bodyRef = ref<HTMLElement>();

/** 详情抽屉状态：点「查看记录」就地打开，不离开工作台 */
const detailVisible = ref(false);
const detailRecordId = ref<ExecuteLogEntry['recordId']>(null);
/** 当前详情所属日志行：重跑补日志时回填链路信息 */
const detailEntry = ref<ExecuteLogEntry>();

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

/** 打开执行记录详情抽屉（就地查看，不跳路由） */
function openRecord(entry: ExecuteLogEntry) {
  detailEntry.value = entry;
  detailRecordId.value = entry.recordId;
  detailVisible.value = true;
}

/** 抽屉内重跑完成：补一条执行日志（与手动执行同一反馈通道）+ 详情切到新记录 */
function handleRerunDone(result: DatabusExecutionResult) {
  append({
    level: result.success ? 'success' : 'error',
    chainId: result.chainId ?? detailEntry.value?.chainId,
    chainCode: detailEntry.value?.chainCode ?? String(result.chainId ?? ''),
    text: result.message ?? '',
    costTime: result.costTime,
    recordId: result.recordId ?? null
  });
  if (result.recordId) {
    detailRecordId.value = result.recordId;
  }
}
</script>

<style lang="scss" scoped>
/* 单根容器：不生成布局盒，子项直接参与宿主 flex 布局 */
.ec-root {
  display: contents;
}

.ec-console {
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

  /* 容器内嵌（工作区终端双小 tab）：褪去独立卡片样式，填满容器正文区 */
  &.is-bare {
    flex: 1;
    height: 100%;
    margin: 0;
    border-radius: 0;
    box-shadow: none;
  }

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
    &.is-error .ec-console__result {
      color: var(--el-color-danger, #f56c6c);
      font-weight: 600;
    }

    &.is-success .ec-console__result {
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

  &__line {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__cost {
    color: var(--el-text-color-secondary);
  }

  &__record {
    padding: 0 4px;
    border: none;
    background: transparent;
    color: var(--el-color-primary);
    font: inherit;
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }
  }

  &__error {
    color: var(--el-color-danger, #f56c6c);
  }
}
</style>
