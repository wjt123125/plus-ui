<!--
  链路卡 — 单视图压扁版（对齐连接管理 mt-card 范式）。
  - 卡片宽度由父级 page-inner max-width 1000px 限制，单列每行一个。
  - 头部：图标块（按首组件类型映射 6 类：http/bo/branch/loop/script/default）+ 标题/code + 状态圆点。
  - 元信息行：logLevel 胶囊 + 迷你拓扑预览（按 cmpProperty 递归画叶子节点小圆点链）+ 时间。
  - 底部 link 操作常驻：发布或下线 / 编辑 / 复制 / 删除（破坏性递增）；编排＝点卡片主体。
  - 复制 chainCode 入口就近放在 code 文本旁（hover 显现）。
  状态用彩色圆点（§5 硬要求），不用文字标签。
-->
<template>
  <div class="chain-card" @click="handleCardClick">
    <!-- 头部：图标 + 标题/code + 状态圆点 -->
    <div class="card-head">
      <div class="card-icon" :class="iconClass">
        <el-icon :size="20"><component :is="cardIconComp" /></el-icon>
      </div>
      <div class="card-title-area">
        <div class="card-title">{{ row.chainName }}</div>
        <div class="card-code">
          <span class="card-code-text">#{{ row.chainCode }}</span>
          <button
            class="copy-btn"
            title="复制链路编码"
            @click.stop="$emit('copy-code', row)"
          >
            <el-icon><CopyDocument /></el-icon>
          </button>
        </div>
      </div>
      <div class="card-status-wrap">
        <span
          class="status-dot"
          :class="statusDotClass"
          :title="statusLabel"
        />
      </div>
    </div>

    <!-- 元信息：logLevel 胶囊 + 迷你拓扑预览 + 时间 -->
    <div class="card-meta">
      <span class="mt-badge">{{ logLevelLabel }}</span>
      <div class="topology">
        <template v-if="previewLeaves.length > 0">
          <template v-for="(leaf, idx) in previewLeaves" :key="idx">
            <span class="topo-dot" :class="dotClass(leaf)" />
            <span v-if="idx < previewLeaves.length - 1" class="topo-line" />
          </template>
          <span v-if="extraCount > 0" class="topo-more">+{{ extraCount }}</span>
        </template>
        <span v-else class="topo-empty">未编排</span>
      </div>
      <span class="card-time">{{ formatTime }}</span>
    </div>

    <!-- 底部操作（link 按钮，全程可见） -->
    <div class="card-actions" @click.stop>
      <el-button
        v-if="row.status !== STATUS_PUBLISHED"
        v-hasPermi="['databus:editor:publish']"
        link
        type="success"
        size="small"
        @click="$emit('publish', row)"
      >
        <el-icon><Promotion /></el-icon>发布
      </el-button>
      <el-button
        v-else
        v-hasPermi="['databus:editor:offline']"
        link
        type="warning"
        size="small"
        @click="$emit('offline', row)"
      >
        <el-icon><TurnOff /></el-icon>下线
      </el-button>
      <el-button
        v-hasPermi="['databus:editor:edit']"
        link
        type="primary"
        size="small"
        @click="$emit('edit', row)"
      >
        <el-icon><Edit /></el-icon>编辑
      </el-button>
      <el-button
        v-hasPermi="['databus:editor:add']"
        link
        type="info"
        size="small"
        @click="$emit('copy-chain', row)"
      >
        <el-icon><CopyDocument /></el-icon>复制
      </el-button>
      <el-button
        v-hasPermi="['databus:editor:remove']"
        link
        type="danger"
        size="small"
        @click="$emit('delete', row)"
      >
        <el-icon><Delete /></el-icon>删除
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Coin, Connection, CopyDocument, DataLine, Delete, Document, Edit, Folder, MagicStick, Promotion, Refresh, Switch, TurnOff, Upload } from '@element-plus/icons-vue';
import type { Component } from 'vue';
import type { CmpProperty } from '@/api/databus/el/types';
import type { DatabusChainVo } from '@/api/databus/chain/types';

const STATUS_DRAFT = '0';
const STATUS_PUBLISHED = '1';
const STATUS_OFFLINE = '2';

const OPERATOR_TYPES = new Set([
  'THEN', 'WHEN', 'IF', 'SWITCH', 'FOR', 'WHILE', 'ITERATOR', 'CATCH', 'AND', 'OR', 'NOT', 'CHAIN'
]);

const MAX_PREVIEW = 5;

const LOG_LEVEL_LABELS: Record<string, string> = {
  OFF: '关闭记录',
  BASIC: '基础记录',
  FULL: '完整记录'
};

const props = defineProps<{
  row: DatabusChainVo;
}>();

const emit = defineEmits<{
  (e: 'arrange', row: DatabusChainVo): void;
  (e: 'edit', row: DatabusChainVo): void;
  (e: 'copy-chain', row: DatabusChainVo): void;
  (e: 'publish', row: DatabusChainVo): void;
  (e: 'offline', row: DatabusChainVo): void;
  (e: 'delete', row: DatabusChainVo): void;
  (e: 'copy-code', row: DatabusChainVo): void;
}>();

const { row } = toRefs(props);

const collectLeaves = (node: CmpProperty | null | undefined, out: CmpProperty[]) => {
  if (!node) return;
  if (!OPERATOR_TYPES.has(node.type)) {
    out.push(node);
    return;
  }
  if (node.condition) {
    collectLeaves(node.condition, out);
  }
  if (node.children) {
    for (const child of node.children) {
      collectLeaves(child, out);
    }
  }
};

const allLeaves = computed<CmpProperty[]>(() => {
  const out: CmpProperty[] = [];
  collectLeaves(row.value.cmpProperty, out);
  return out;
});

const previewLeaves = computed(() => allLeaves.value.slice(0, MAX_PREVIEW));
const extraCount = computed(() => Math.max(0, allLeaves.value.length - MAX_PREVIEW));

/** 头部图标按首组件类型映射（9 类，覆盖 cmp-defs 全部叶子组件类型） */
type IconKind = 'http' | 'bo' | 'branch' | 'loop' | 'script' | 'data' | 'workflow' | 'file' | 'response' | 'default';

const TYPE_TO_KIND: Record<string, IconKind> = {
  httpRequest: 'http',
  boCreate: 'bo',
  boQuery: 'bo',
  boUpdate: 'bo',
  boDelete: 'bo',
  rdsExecute: 'bo',
  condition: 'branch',
  booleanScript: 'branch',
  switchRoute: 'branch',
  forLoop: 'loop',
  iteratorLoop: 'loop',
  script: 'script',
  setValue: 'data',
  fieldMap: 'data',
  dataPatch: 'data',
  sessionCreate: 'workflow',
  processStart: 'workflow',
  processTerminate: 'workflow',
  taskComplete: 'workflow',
  fileUpload: 'file',
  fileDownload: 'file',
  response: 'response'
};

const KIND_ICON: Record<IconKind, Component> = {
  http: Connection,
  bo: Coin,
  branch: Switch,
  loop: Refresh,
  script: Document,
  data: DataLine,
  workflow: Promotion,
  file: Folder,
  response: Upload,
  default: MagicStick
};

const iconKind = computed<IconKind>(() => {
  const t = allLeaves.value[0]?.type;
  return (t && TYPE_TO_KIND[t]) || 'default';
});
const cardIconComp = computed(() => KIND_ICON[iconKind.value]);
const iconClass = computed(() => `icon-${iconKind.value}`);

const dotClass = (leaf: CmpProperty) => {
  const t = leaf.type;
  if (t === 'httpRequest' || t === 'boCreate' || t === 'boQuery' || t === 'boUpdate' || t === 'boDelete') {
    return 'dot-blue';
  }
  if (t === 'condition' || t === 'booleanScript') {
    return 'dot-amber';
  }
  if (t === 'forLoop' || t === 'iteratorLoop' || t === 'switchRoute') {
    return 'dot-violet';
  }
  if (t === 'script') {
    return 'dot-teal';
  }
  return 'dot-primary';
};

const statusDotClass = computed(() => {
  const s = row.value.status;
  if (s === STATUS_PUBLISHED) return 'status-online';
  if (s === STATUS_DRAFT) return 'status-draft';
  return 'status-offline';
});

const statusLabel = computed(() => {
  const s = row.value.status;
  if (s === STATUS_DRAFT) return '草稿';
  if (s === STATUS_PUBLISHED) return '已发布';
  if (s === STATUS_OFFLINE) return '已下线';
  return '未知状态';
});

const logLevelLabel = computed(() => {
  const code = row.value.logLevel;
  return code ? (LOG_LEVEL_LABELS[code] ?? code) : LOG_LEVEL_LABELS.BASIC;
});

const formatTime = computed(() => {
  const t = row.value.updateTime;
  return t ? t.replace('T', ' ').slice(0, 16) : '未保存过';
});

/** 点击卡片主体 = 编排（项目内"预览"映射）；actions 区 @click.stop 阻断冒泡 */
const handleCardClick = () => {
  emit('arrange', row.value);
};
</script>

<style lang="scss" scoped>
.chain-card {
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--el-border-color, #e2e8f0);
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: pointer;
  transition: all 0.25s ease;

  &:hover {
    box-shadow: 0 8px 22px rgba(var(--el-color-primary-rgb, 22, 104, 220), 0.14);
    border-color: var(--el-color-primary);
    transform: translateY(-1px);

    .copy-btn {
      opacity: 0.7;
    }
  }
}

.card-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.card-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: linear-gradient(
    135deg,
    rgba(var(--el-color-primary-rgb, 22, 104, 220), 0.12) 0%,
    rgba(var(--el-color-primary-rgb, 22, 104, 220), 0.22) 100%
  );
  color: var(--el-color-primary);
  transition: color 0.2s ease;

  &.icon-http { color: var(--el-color-primary); }
  &.icon-bo { color: var(--el-color-primary-light-3, #409eff); }
  &.icon-branch { color: var(--el-color-warning, #f59e0b); }
  &.icon-loop { color: var(--el-color-success, #10b981); }
  &.icon-script { color: var(--el-color-info, #909399); }
  &.icon-data { color: var(--el-color-primary-dark-2, #16529b); }
  &.icon-workflow { color: var(--el-color-warning-light-3, #f6c96c); }
  &.icon-file { color: var(--el-color-info-light-3, #c0c4cc); }
  &.icon-response { color: var(--el-color-danger-light-3, #fab6b6); }
  &.icon-default { color: var(--el-color-primary); }
}

.card-title-area {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary, #1d2129);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-code {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: 'JetBrains Mono', Consolas, monospace;
  min-width: 0;
}

.card-code-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s ease;
  flex-shrink: 0;

  .el-icon {
    font-size: 12px;
  }

  &:hover {
    background: rgba(var(--el-color-primary-rgb, 22, 104, 220), 0.1);
    color: var(--el-color-primary);
    opacity: 1;
  }
}

.card-status-wrap {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

/* 状态彩色圆点（不用文字标签） */
.status-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.8);
  transition: transform 0.15s ease;
  cursor: help;

  &:hover {
    transform: scale(1.3);
  }

  &.status-online {
    background: var(--el-color-success, #10b981);
  }
  &.status-draft {
    background: var(--el-color-warning, #f59e0b);
  }
  &.status-offline {
    background: var(--el-color-info, #9ca3af);
  }
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.mt-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(var(--el-color-primary-rgb, 22, 104, 220), 0.1);
  color: var(--el-color-primary);
}

.topology {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  min-width: 0;
}

.topo-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;

  &.dot-primary {
    background: var(--el-color-primary);
  }
  &.dot-blue {
    background: var(--el-color-primary-light-3, #409eff);
  }
  &.dot-amber {
    background: var(--el-color-warning, #f59e0b);
  }
  &.dot-violet {
    background: #8b5cf6;
  }
  &.dot-teal {
    background: #14b8a6;
  }
}

.topo-line {
  flex: 1;
  height: 1px;
  background: var(--el-border-color, #d0d5dd);
  min-width: 8px;
  max-width: 20px;
}

.topo-more {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: 500;
  margin-left: 2px;
}

.topo-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.card-time {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: 'JetBrains Mono', Consolas, monospace;
  flex-shrink: 0;
}

.card-actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  border-top: 1px solid var(--el-border-color-lighter, #ebeef5);
  padding-top: 8px;
}
</style>
