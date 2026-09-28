<template>
  <div class="editor-toolbar">
    <!-- display:contents 让位：三段直接成为编辑器网格条目，共用列轨道 -->
    <!-- 左段：第一列，宽度与下方物料区共用同一变量，竖线即列分界 -->
    <div class="editor-toolbar__left">
      <el-button
        v-if="editingId"
        size="small"
        title="返回链路列表"
        @click="emit('back')"
      >
        <el-icon class="el-icon--left"><ArrowLeft /></el-icon>返回
      </el-button>
      <el-input
        :model-value="chainId"
        class="editor-toolbar__chain-input"
        size="small"
        title="链路编码"
        placeholder="链路编码，如 databus_chain_1"
        :readonly="!!editingId"
        @update:model-value="emit('update:chainId', $event)"
      />
    </div>
    <div class="editor-toolbar__right">
      <el-tooltip content="撤销 (Ctrl+Z)" placement="bottom">
        <el-button size="small" :disabled="!canUndo" @click="emit('undo')">
          <el-icon class="el-icon--left"><RefreshLeft /></el-icon>撤销
        </el-button>
      </el-tooltip>
      <el-tooltip content="重做 (Ctrl+Shift+Z)" placement="bottom">
        <el-button size="small" :disabled="!canRedo" @click="emit('redo')">
          <el-icon class="el-icon--left"><RefreshRight /></el-icon>重做
        </el-button>
      </el-tooltip>
      <el-button size="small" @click="emit('reset')">
        <el-icon class="el-icon--left"><Delete /></el-icon>清空
      </el-button>
      <!-- 弹性间隔：撤销/重做/清空留左，入参登记/试运行/保存/生成EL 推到右侧 -->
      <div class="editor-toolbar__spacer" />
      <el-button size="small" @click="emit('openInputParams')">
        <el-icon class="el-icon--left"><Operation /></el-icon>入参登记
      </el-button>
      <el-button size="small" type="success" @click="emit('openPreview')">
        <el-icon class="el-icon--left"><VideoPlay /></el-icon>试运行
      </el-button>
      <el-button
        v-if="editingId"
        size="small"
        type="primary"
        :loading="chainSaving"
        @click="emit('saveChain')"
      >
        <el-icon class="el-icon--left"><Select /></el-icon>保存链路
      </el-button>
      <el-button size="small" :type="editingId ? 'info' : 'primary'" plain :loading="saving" @click="emit('saveAsEl')">
        <el-icon class="el-icon--left"><Check /></el-icon>生成 EL
      </el-button>
    </div>
    <!-- 左缘短竖线（伪元素）在列轨道分界上，与下方属性区左边缘天然对齐 -->
    <div class="editor-toolbar__switcher">
      <ChainSwitcher
        :current-id="editingId"
        :current-name="editingId ? chainName : ''"
        @select="emit('select', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ArrowLeft, Check, Delete, Operation, RefreshLeft, RefreshRight, Select, VideoPlay } from '@element-plus/icons-vue';
import ChainSwitcher from './ChainSwitcher.vue';
import type { DatabusChainVo } from '@/api/databus/chain/types';

defineProps<{
  editingId: number | string | null;
  chainId: string;
  chainName: string;
  canUndo: boolean;
  canRedo: boolean;
  chainSaving: boolean;
  saving: boolean;
}>();

const emit = defineEmits<{
  'update:chainId': [value: string];
  back: [];
  undo: [];
  redo: [];
  reset: [];
  openInputParams: [];
  openPreview: [];
  saveChain: [];
  saveAsEl: [];
  select: [row: DatabusChainVo];
}>();
</script>

<style scoped>
.editor-toolbar {
  display: contents;
}

/* 左段：返回 + 链路编码。宽度取物料区常量；
   折叠时轨道为 0，本格宽度固定、原位悬浮在画布上方（overflow 默认可见） */
.editor-toolbar__left {
  position: relative;
  display: flex;
  grid-row: 1;
  grid-column: 1;
  align-items: center;
  gap: 4px;
  width: var(--palette-size);
  padding: 0 12px 0 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

/* 短竖线：伪元素 1em 高居中于右缘（同 el-divider--vertical），钉在列分界上 */
.editor-toolbar__left::after {
  position: absolute;
  top: 50%;
  right: 0;
  width: 1px;
  height: 1em;
  content: '';
  background-color: var(--el-border-color);
  transform: translateY(-50%);
}

/* 链路编码框：占据左段切换器原位置（24px 高、圆角、细边），编辑态只读 */
.editor-toolbar__chain-input {
  flex: 1;
  min-width: 0;

  :deep(.el-input__wrapper) {
    height: 24px;
    padding: 0 8px;
    border-radius: 4px;
    box-shadow: 0 0 0 1px var(--el-border-color, #e8eaec) inset;
    background: transparent;
    transition: box-shadow 0.2s ease;
  }

  :deep(.el-input__inner) {
    font-size: 13px;
    font-family: 'JetBrains Mono', Consolas, monospace;
    color: var(--el-text-color-primary);
  }

  &:hover :deep(.el-input__wrapper) {
    box-shadow: 0 0 0 1px var(--el-color-primary) inset;
  }
}

/* 中段按钮组：第二列。左右内边距取折叠预留变量，随折叠态 0.2s 等速过渡：
   列轨道收缩多少，同侧内边距就增加多少，两组按钮全程钉在原绝对位置 */
.editor-toolbar__right {
  display: flex;
  grid-row: 1;
  grid-column: 2;
  align-items: center;
  gap: 8px;
  padding: 0 var(--toolbar-pr) 0 var(--toolbar-pl);
  border-bottom: 1px solid var(--el-border-color-lighter);
  transition: padding 0.2s ease;
}

/* 弹性间隔吃掉中间剩余空间，把操作组推到右缘；保留最小间隙防止两组贴死 */
.editor-toolbar__spacer {
  flex: 1;
  min-width: 16px;
}

/* 右缘链路切换器：第三列，宽度取属性区常量；justify-self:end 保证折叠
   轨道为 0 时本格贴着右缘、向左溢出悬浮，内部触发钮撑满整宽 */
.editor-toolbar__switcher {
  position: relative;
  display: flex;
  grid-row: 1;
  grid-column: 3;
  align-items: center;
  justify-self: end;
  width: var(--props-size);
  padding: 0 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

/* 短竖线：伪元素 1em 高居中于左缘（同 el-divider--vertical），钉在列分界上，
   与下方属性区左边缘天然对齐 */
.editor-toolbar__switcher::before {
  position: absolute;
  top: 50%;
  left: 0;
  width: 1px;
  height: 1em;
  content: '';
  background-color: var(--el-border-color);
  transform: translateY(-50%);
}
</style>
