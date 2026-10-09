<template>
  <template v-if="menu.visible && menu.node">
    <div class="chain-tree-ctx-mask" @click="emit('close')" @contextmenu.prevent="emit('close')" />
    <ul
      class="chain-tree-ctx"
      :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
      @click.stop
      @contextmenu.prevent
    >
      <!-- 链路叶子：打开画布/编辑/复制 · 发布或下线/执行 · 移动归属 · 复制编码 · 删除
           （原链路管理卡片五操作下沉至此；显隐按状态，权限与卡片按钮同源） -->
      <template v-if="menu.node.type === 'chain'">
        <li class="chain-tree-ctx__item" @click="onCommand('open-chain')">
          <SvgIcon icon-class="lucide:spline" /><span>打开画布</span>
        </li>
        <li
          v-hasPermi="['databus:editor:edit']"
          class="chain-tree-ctx__item"
          @click="onCommand('edit-chain')"
        >
          <SvgIcon icon-class="lucide:file-pen" /><span>编辑</span>
        </li>
        <li
          v-hasPermi="['databus:editor:add']"
          class="chain-tree-ctx__item"
          @click="onCommand('copy-chain')"
        >
          <SvgIcon icon-class="lucide:copy" /><span>复制链路</span>
        </li>
        <li class="chain-tree-ctx__divider" />
        <li
          v-if="menu.node.status !== STATUS_PUBLISHED"
          v-hasPermi="['databus:editor:publish']"
          class="chain-tree-ctx__item"
          @click="onCommand('publish-chain')"
        >
          <SvgIcon icon-class="lucide:send" /><span>发布</span>
        </li>
        <li
          v-else
          v-hasPermi="['databus:editor:offline']"
          class="chain-tree-ctx__item"
          @click="onCommand('offline-chain')"
        >
          <SvgIcon icon-class="lucide:power" /><span>下线</span>
        </li>
        <li
          v-if="menu.node.status === STATUS_PUBLISHED"
          v-hasPermi="['databus:execution:execute']"
          class="chain-tree-ctx__item"
          @click="onCommand('execute-chain')"
        >
          <SvgIcon icon-class="lucide:play" /><span>执行</span>
        </li>
        <li class="chain-tree-ctx__divider" />
        <li
          v-hasPermi="['databus:chain:directory:edit']"
          class="chain-tree-ctx__item"
          @click="onCommand('move-chain')"
        >
          <SvgIcon icon-class="lucide:folder-input" /><span>移动到目录…</span>
        </li>
        <li class="chain-tree-ctx__item" @click="onCopy">
          <SvgIcon icon-class="lucide:copy" /><span>复制链路编码</span>
        </li>
        <li class="chain-tree-ctx__divider" />
        <li
          v-hasPermi="['databus:editor:remove']"
          class="chain-tree-ctx__item is-danger"
          @click="onCommand('delete-chain')"
        >
          <SvgIcon icon-class="lucide:trash" /><span>删除</span>
        </li>
      </template>

      <!-- 模板叶子：使用模板（复制副本开画布）· 编辑（含取消精选等模板运营）· 复制编码 · 删除 -->
      <template v-else-if="menu.node.type === 'template'">
        <li
          v-hasPermi="['databus:editor:add']"
          class="chain-tree-ctx__item"
          @click="onCommand('use-template')"
        >
          <SvgIcon icon-class="lucide:sparkles" /><span>使用模板</span>
        </li>
        <li
          v-hasPermi="['databus:editor:edit']"
          class="chain-tree-ctx__item"
          @click="onCommand('edit-chain')"
        >
          <SvgIcon icon-class="lucide:file-pen" /><span>编辑</span>
        </li>
        <li class="chain-tree-ctx__divider" />
        <li class="chain-tree-ctx__item" @click="onCopy">
          <SvgIcon icon-class="lucide:copy" /><span>复制链路编码</span>
        </li>
        <li class="chain-tree-ctx__divider" />
        <li
          v-hasPermi="['databus:editor:remove']"
          class="chain-tree-ctx__item is-danger"
          @click="onCommand('delete-chain')"
        >
          <SvgIcon icon-class="lucide:trash" /><span>删除</span>
        </li>
      </template>

      <!-- 目录节点：新建链路（挂本目录）· 新建子目录 · 重命名 · 删除（删除受子目录/挂链双拦截保护） -->
      <template v-else-if="menu.node.type === 'directory'">
        <li
          v-hasPermi="['databus:editor:add']"
          class="chain-tree-ctx__item"
          @click="onCommand('add-chain')"
        >
          <SvgIcon icon-class="lucide:file-plus" /><span>新建链路</span>
        </li>
        <li
          v-hasPermi="['databus:chain:directory:add']"
          class="chain-tree-ctx__item"
          @click="onCommand('add-child')"
        >
          <SvgIcon icon-class="lucide:plus" /><span>新建子目录</span>
        </li>
        <li
          v-hasPermi="['databus:chain:directory:edit']"
          class="chain-tree-ctx__item"
          @click="onCommand('rename')"
        >
          <SvgIcon icon-class="lucide:file-pen" /><span>重命名/排序</span>
        </li>
        <li class="chain-tree-ctx__divider" />
        <li
          v-hasPermi="['databus:chain:directory:remove']"
          class="chain-tree-ctx__item is-danger"
          @click="onCommand('remove-directory')"
        >
          <SvgIcon icon-class="lucide:trash" /><span>删除目录</span>
        </li>
      </template>
    </ul>
  </template>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import type { ChainTreeMenuCommand, ChainTreeMenuState } from '../workbench.types';

defineOptions({ name: 'ChainTreeContextMenu' });

/** 已发布状态（发布/下线/执行菜单项按此显隐，与 DatabusChainVo.status 对齐） */
const STATUS_PUBLISHED = '1';

const props = defineProps<{ menu: ChainTreeMenuState }>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'command', command: ChainTreeMenuCommand, node: NonNullable<ChainTreeMenuState['node']>): void;
  (e: 'copy', code: string): void;
}>();

function onCommand(command: ChainTreeMenuCommand) {
  const node = props.menu.node;
  if (!node) return;
  emit('close');
  emit('command', command, node);
}

/** 复制链路编码 */
function onCopy() {
  const node = props.menu.node;
  emit('close');
  if (node?.chainCode) {
    emit('copy', node.chainCode);
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.menu.visible) {
    emit('close');
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
/* 视觉与交互照搬 CmpTreeContextMenu（同款工作台右键菜单范式） */
.chain-tree-ctx-mask {
  position: fixed;
  inset: 0;
  z-index: 1997;
}

.chain-tree-ctx {
  position: fixed;
  z-index: 1998;
  min-width: 148px;
  padding: 4px;
  margin: 0;
  list-style: none;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  box-shadow: 0 6px 24px rgb(0 0 0 / 14%);
}

.chain-tree-ctx__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  font-size: 13px;
  color: var(--el-text-color-primary);
  cursor: pointer;
  border-radius: 5px;
}

.chain-tree-ctx__item:hover {
  background-color: var(--el-fill-color-light);
}

.chain-tree-ctx__item.is-danger {
  color: var(--el-color-danger);
}

.chain-tree-ctx__divider {
  height: 1px;
  margin: 4px 6px;
  background-color: var(--el-border-color-lighter);
}
</style>
