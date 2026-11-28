<template>
  <template v-if="menu.visible && menu.node">
    <div class="res-tree-ctx-mask" @click="emit('close')" @contextmenu.prevent="emit('close')" />
    <ul
      class="res-tree-ctx"
      :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
      @click.stop
      @contextmenu.prevent
    >
      <!-- 链路叶子：打开画布/编辑/复制 · 发布或下线/执行 · 移动归属/收藏 · 复制编码 · 删除 -->
      <template v-if="kind === DATABUS_RESOURCE_TYPE_CHAIN">
        <li class="res-tree-ctx__item is-primary" @click="onCommand('open')">
          <SvgIcon icon-class="lucide:spline" /><span>打开画布</span>
        </li>
        <li v-hasPermi="['databus:editor:edit']" class="res-tree-ctx__item is-primary" @click="onCommand('edit-chain')">
          <SvgIcon icon-class="lucide:file-pen" /><span>编辑</span>
        </li>
        <li v-hasPermi="['databus:editor:add']" class="res-tree-ctx__item is-primary" @click="onCommand('copy-chain')">
          <SvgIcon icon-class="lucide:copy" /><span>复制链路</span>
        </li>
        <li class="res-tree-ctx__item is-primary" @click="onCommand('add-to-agent')">
          <SvgIcon icon-class="lucide:sparkles" /><span>加入会话</span>
        </li>
        <li class="res-tree-ctx__divider" />
        <li
          v-if="menu.node.status !== CHAIN_STATUS.ENABLED"
          v-hasPermi="['databus:editor:publish']"
          class="res-tree-ctx__item is-success"
          @click="onCommand('publish-chain')"
        >
          <SvgIcon icon-class="lucide:send" /><span>发布</span>
        </li>
        <li
          v-else
          v-hasPermi="['databus:editor:offline']"
          class="res-tree-ctx__item is-warning"
          @click="onCommand('offline-chain')"
        >
          <SvgIcon icon-class="lucide:power" /><span>下线</span>
        </li>
        <li
          v-if="menu.node.status === CHAIN_STATUS.ENABLED"
          v-hasPermi="['databus:execution:execute']"
          class="res-tree-ctx__item is-success"
          @click="onCommand('execute-chain')"
        >
          <SvgIcon icon-class="lucide:play" /><span>执行</span>
        </li>
        <li class="res-tree-ctx__divider" />
        <li v-hasPermi="['databus:directory:edit']" class="res-tree-ctx__item is-primary" @click="onCommand('move')">
          <SvgIcon icon-class="lucide:folder-input" /><span>移动到目录…</span>
        </li>
        <li v-if="!menu.node.favorited" class="res-tree-ctx__item is-warning" @click="onCommand('favorite-add')">
          <SvgIcon icon-class="lucide:star" /><span>收藏</span>
        </li>
        <li v-else class="res-tree-ctx__item" @click="onCommand('favorite-remove')">
          <SvgIcon icon-class="lucide:star-off" /><span>取消收藏</span>
        </li>
        <li class="res-tree-ctx__item is-primary" @click="onCopy">
          <SvgIcon icon-class="lucide:copy" /><span>复制链路编码</span>
        </li>
        <li class="res-tree-ctx__item is-primary" @click="onCommand('share-link')">
          <SvgIcon icon-class="lucide:share" /><span>复制分享链接</span>
        </li>
        <li class="res-tree-ctx__divider" />
        <li
          v-hasPermi="['databus:editor:remove']"
          class="res-tree-ctx__item is-danger"
          @click="onCommand('delete-chain')"
        >
          <SvgIcon icon-class="lucide:trash" /><span>删除</span>
        </li>
      </template>

      <!-- 自建组件叶子：查看/编辑/代码变更 · 移动归属/收藏 · 启停 · 复制编码 · 删除 -->
      <template v-else-if="kind === DATABUS_RESOURCE_TYPE_COMPONENT">
        <li class="res-tree-ctx__item is-primary" @click="onCommand('view-component')">
          <SvgIcon icon-class="lucide:file-text" /><span>查看</span>
        </li>
        <li v-hasPermi="['databus:component:edit']" class="res-tree-ctx__item is-primary" @click="onCommand('edit-component')">
          <SvgIcon icon-class="lucide:file-pen" /><span>编辑</span>
        </li>
        <li class="res-tree-ctx__item is-warning" @click="onCommand('changes-component')">
          <SvgIcon icon-class="lucide:file-diff" /><span>代码变更</span>
        </li>
        <div class="res-tree-ctx__divider" />
        <li class="res-tree-ctx__item is-primary" @click="onCommand('add-to-agent')">
          <SvgIcon icon-class="lucide:sparkles" /><span>加入会话</span>
        </li>
        <li class="res-tree-ctx__divider" />
        <li v-hasPermi="['databus:directory:edit']" class="res-tree-ctx__item is-primary" @click="onCommand('move')">
          <SvgIcon icon-class="lucide:folder-input" /><span>移动到目录…</span>
        </li>
        <li v-if="!menu.node.favorited" class="res-tree-ctx__item is-warning" @click="onCommand('favorite-add')">
          <SvgIcon icon-class="lucide:star" /><span>收藏</span>
        </li>
        <li v-else class="res-tree-ctx__item" @click="onCommand('favorite-remove')">
          <SvgIcon icon-class="lucide:star-off" /><span>取消收藏</span>
        </li>
        <li class="res-tree-ctx__divider" />
        <li
          v-hasPermi="['databus:component:toggle']"
          class="res-tree-ctx__item"
          :class="menu.node.disabled ? 'is-success' : 'is-warning'"
          @click="onCommand('toggle-component')"
        >
          <SvgIcon icon-class="lucide:power" /><span>{{ menu.node.disabled ? '启用' : '停用' }}</span>
        </li>
        <li class="res-tree-ctx__item is-primary" @click="onCopy">
          <SvgIcon icon-class="lucide:copy" /><span>复制组件编码</span>
        </li>
        <li class="res-tree-ctx__item is-primary" @click="onCommand('share-link')">
          <SvgIcon icon-class="lucide:share" /><span>复制分享链接</span>
        </li>
        <li class="res-tree-ctx__divider" />
        <li
          v-hasPermi="menu.node.lifecycle === 'draft' ? ['databus:component:edit'] : ['databus:component:remove']"
          class="res-tree-ctx__item is-danger"
          @click="onCommand('delete-component')"
        >
          <SvgIcon icon-class="lucide:trash" /><span>删除</span>
        </li>
      </template>

      <!-- 系统组件叶子（内置件只读）：查看 · 加入会话 -->
      <template v-else-if="kind === DATABUS_RESOURCE_TYPE_SYSTEM_LEAF">
        <li class="res-tree-ctx__item is-primary" @click="onCommand('view-component')">
          <SvgIcon icon-class="lucide:file-text" /><span>查看</span>
        </li>
        <li class="res-tree-ctx__item is-primary" @click="onCommand('add-to-agent')">
          <SvgIcon icon-class="lucide:sparkles" /><span>加入会话</span>
        </li>
        <li class="res-tree-ctx__divider" />
        <li class="res-tree-ctx__item is-primary" @click="onCopy">
          <SvgIcon icon-class="lucide:copy" /><span>复制组件编码</span>
        </li>
        <li class="res-tree-ctx__item is-primary" @click="onCommand('share-link')">
          <SvgIcon icon-class="lucide:share" /><span>复制分享链接</span>
        </li>
      </template>

      <!-- 市场引用叶（SHARED 安装组件）：打开 / 移动归属 / 收藏 / 卸载（不动源组件本体） -->
      <template v-else-if="kind === DATABUS_RESOURCE_TYPE_MARKET_REF">
        <li class="res-tree-ctx__item is-primary" @click="onCommand('open')">
          <SvgIcon icon-class="lucide:external-link" /><span>打开</span>
        </li>
        <li class="res-tree-ctx__item is-primary" @click="onCommand('add-to-agent')">
          <SvgIcon icon-class="lucide:sparkles" /><span>加入会话</span>
        </li>
        <li class="res-tree-ctx__divider" />
        <li v-hasPermi="['databus:directory:edit']" class="res-tree-ctx__item is-primary" @click="onCommand('move')">
          <SvgIcon icon-class="lucide:folder-input" /><span>移动到目录…</span>
        </li>
        <li v-if="!menu.node.favorited" class="res-tree-ctx__item is-warning" @click="onCommand('favorite-add')">
          <SvgIcon icon-class="lucide:star" /><span>收藏</span>
        </li>
        <li v-else class="res-tree-ctx__item" @click="onCommand('favorite-remove')">
          <SvgIcon icon-class="lucide:star-off" /><span>取消收藏</span>
        </li>
        <li class="res-tree-ctx__divider" />
        <li
          v-hasPermi="['databus:market:install']"
          class="res-tree-ctx__item is-danger"
          @click="onCommand('uninstall')"
        >
          <SvgIcon icon-class="lucide:trash" /><span>卸载</span>
        </li>
      </template>

      <!-- 目录节点：新建链路（挂本目录）· 新建组件（挂本目录）· 新建子目录 · 重命名 · 删除 -->
      <template v-else-if="kind === DATABUS_RESOURCE_TYPE_DIRECTORY">
        <li v-hasPermi="['databus:editor:add']" class="res-tree-ctx__item is-success" @click="onCommand('add-chain')">
          <SvgIcon icon-class="lucide:file-plus" /><span>新建链路</span>
        </li>
        <li v-hasPermi="['databus:component:add']" class="res-tree-ctx__item is-success" @click="onCommand('add-component')">
          <SvgIcon icon-class="lucide:file-plus-2" /><span>新建组件</span>
        </li>
        <li class="res-tree-ctx__divider" />
        <li v-hasPermi="['databus:directory:add']" class="res-tree-ctx__item is-success" @click="onCommand('add-child')">
          <SvgIcon icon-class="lucide:plus" /><span>新建子目录</span>
        </li>
        <li v-hasPermi="['databus:directory:edit']" class="res-tree-ctx__item is-primary" @click="onCommand('rename')">
          <SvgIcon icon-class="lucide:file-pen" /><span>重命名/排序</span>
        </li>
        <li class="res-tree-ctx__divider" />
        <li
          v-hasPermi="['databus:directory:remove']"
          class="res-tree-ctx__item is-danger"
          @click="onCommand('remove-directory')"
        >
          <SvgIcon icon-class="lucide:trash" /><span>删除目录</span>
        </li>
      </template>
    </ul>
  </template>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { CHAIN_STATUS } from '@/constants/databus';
import {
  DATABUS_RESOURCE_TYPE_CHAIN,
  DATABUS_RESOURCE_TYPE_COMPONENT,
  DATABUS_RESOURCE_TYPE_DIRECTORY,
  DATABUS_RESOURCE_TYPE_MARKET_REF,
  DATABUS_RESOURCE_TYPE_SYSTEM_LEAF
} from '@/constants/databus-common';
import type { ResourceMenuCommand, ResourceMenuState } from '../workbench.types';

defineOptions({ name: 'ResourceTreeContextMenu' });

const props = defineProps<{ menu: ResourceMenuState }>();

/**
 * 菜单形态按「资源身份」判定，而不是按所在分区：收藏 / 最近访问只是展示位置，
 * 同一个链路或组件无论出现在哪一节，右键看到的都是同一份菜单。
 * 身份字段优先级：链路 id → 组件 DB 行 id → 仅有编码（系统内置等只读件）。
 */
const kind = computed(() => {
  const node = props.menu.node;
  if (!node) {
    return null;
  }
  if (node.type === DATABUS_RESOURCE_TYPE_MARKET_REF || node.type === DATABUS_RESOURCE_TYPE_DIRECTORY) {
    return node.type;
  }
  if (node.chainId != null && node.chainId !== '') {
    return DATABUS_RESOURCE_TYPE_CHAIN;
  }
  if (node.dbId != null) {
    return DATABUS_RESOURCE_TYPE_COMPONENT;
  }
  return node.componentCode ? DATABUS_RESOURCE_TYPE_SYSTEM_LEAF : null;
});

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'command', command: ResourceMenuCommand, node: NonNullable<ResourceMenuState['node']>): void;
  (e: 'copy', code: string): void;
}>();

function onCommand(command: ResourceMenuCommand) {
  const node = props.menu.node;
  if (!node) return;
  emit('close');
  emit('command', command, node);
}

/** 复制资源编码（链路编码 / 组件编码） */
function onCopy() {
  const node = props.menu.node;
  emit('close');
  const code = node?.chainCode || node?.componentCode;
  if (code) {
    emit('copy', code);
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
/* 两条旧菜单（ChainTreeContextMenu / CmpTreeContextMenu）合并，视觉与交互逐字沿用 */
.res-tree-ctx-mask {
  position: fixed;
  inset: 0;
  z-index: 1997;
}

.res-tree-ctx {
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

.res-tree-ctx__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  font-size: 13px;
  color: var(--el-text-color-primary);
  cursor: pointer;
  border-radius: 5px;
}

.res-tree-ctx__item:hover {
  background-color: var(--el-fill-color-light);
}

.res-tree-ctx__item.is-danger {
  color: var(--el-color-danger);
}

/* 图标语义色：只染图标，文字保持主色（.svg-icon 走 currentColor） */
.res-tree-ctx__item.is-primary :deep(.svg-icon) {
  color: var(--el-color-primary);
}

.res-tree-ctx__item.is-success :deep(.svg-icon) {
  color: var(--el-color-success);
}

.res-tree-ctx__item.is-warning :deep(.svg-icon) {
  color: var(--el-color-warning);
}

.res-tree-ctx__divider {
  height: 1px;
  margin: 4px 6px;
  background-color: var(--el-border-color-lighter);
}
</style>
