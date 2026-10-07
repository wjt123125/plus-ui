<template>
  <template v-if="menu.visible && menu.node">
    <div class="cmp-tree-ctx-mask" @click="emit('close')" @contextmenu.prevent="emit('close')" />
    <ul
      class="cmp-tree-ctx"
      :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
      @click.stop
      @contextmenu.prevent
    >
      <!-- 叶子（组件）：三个 tab 入口 · 启停 · 删除 · 复制编码（§2.3） -->
      <template v-if="menu.node.kind === 'leaf'">
        <li class="cmp-tree-ctx__item" @click="onLeaf('view')">
          <SvgIcon icon-class="lucide:file-text" /><span>查看</span>
        </li>
        <template v-if="row">
          <li v-hasPermi="['databus:component:edit']" class="cmp-tree-ctx__item" @click="onLeaf('edit')">
            <SvgIcon icon-class="lucide:file-pen" /><span>编辑</span>
          </li>
          <li class="cmp-tree-ctx__item" @click="onLeaf('changes')">
            <SvgIcon icon-class="lucide:file-diff" /><span>代码变更</span>
          </li>
          <li class="cmp-tree-ctx__divider" />
          <li v-hasPermi="['databus:component:edit']" class="cmp-tree-ctx__item" @click="onToggle">
            <SvgIcon icon-class="lucide:power" /><span>{{ row.disabled ? '启用' : '停用' }}</span>
          </li>
          <li
            v-hasPermi="['databus:component:remove']"
            class="cmp-tree-ctx__item is-danger"
            @click="onLeaf('delete')"
          >
            <SvgIcon icon-class="lucide:trash" /><span>删除</span>
          </li>
        </template>
        <li class="cmp-tree-ctx__divider" />
        <li class="cmp-tree-ctx__item" @click="onCopy">
          <SvgIcon icon-class="lucide:copy" /><span>复制组件编码</span>
        </li>
      </template>

      <!-- 分组/业务域目录、虚拟节点：只有新建组件（携带目录上下文）；展开折叠走节点箭头，不进菜单 -->
      <template v-else>
        <li v-hasPermi="['databus:component:add']" class="cmp-tree-ctx__item" @click="onAdd">
          <SvgIcon icon-class="lucide:plus" /><span>新建组件</span>
        </li>
      </template>
    </ul>
  </template>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import type { ComponentRegistryRow } from '../../model/registry';
import type { FormPreset, TreeMenuState } from '../workbench.types';

defineOptions({ name: 'CmpTreeContextMenu' });

const props = defineProps<{ menu: TreeMenuState }>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'view', row: ComponentRegistryRow): void;
  (e: 'edit', row: ComponentRegistryRow): void;
  (e: 'changes', row: ComponentRegistryRow): void;
  (e: 'toggle', row: ComponentRegistryRow, enabled: boolean): void;
  (e: 'delete', row: ComponentRegistryRow): void;
  (e: 'copy', code: string): void;
  (e: 'add', preset?: FormPreset): void;
}>();

/** 纯内置件（SYSTEM）无 DB 行，编辑/代码变更/启停/删除全部无意义，只留查看与复制 */
const row = computed(() => (props.menu.node?.row?.db ? props.menu.node.row : undefined));

function close() {
  emit('close');
}

/** 叶子动作四选一，载荷同为台账行；联合类型喂不进 emit 重载，只能显式分派 */
function onLeaf(action: 'view' | 'edit' | 'changes' | 'delete') {
  const target = props.menu.node?.row;
  close();
  if (!target) {
    return;
  }
  switch (action) {
    case 'view':
      emit('view', target);
      break;
    case 'edit':
      emit('edit', target);
      break;
    case 'changes':
      emit('changes', target);
      break;
    default:
      emit('delete', target);
  }
}

function onToggle() {
  const target = row.value;
  close();
  if (target) {
    emit('toggle', target, target.disabled);
  }
}

function onCopy() {
  const code = props.menu.node?.row?.code;
  close();
  if (code) {
    emit('copy', code);
  }
}

/** 新建组件：目录节点携带自身 group/domain；虚拟节点无上下文，开空表单 */
function onAdd() {
  const node = props.menu.node;
  close();
  if (!node || node.kind === 'virtual') {
    emit('add');
    return;
  }
  emit('add', { group: node.group, domain: node.domain ?? null });
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.menu.visible) {
    close();
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
/* 视觉与交互逐字照搬 editor/components/canvas/CmpContextMenu.vue（组件不复用，见 §2.3） */
.cmp-tree-ctx-mask {
  position: fixed;
  inset: 0;
  z-index: 1997;
}

.cmp-tree-ctx {
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

.cmp-tree-ctx__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  font-size: 13px;
  color: var(--el-text-color-primary);
  cursor: pointer;
  border-radius: 5px;
}

.cmp-tree-ctx__item:hover {
  background-color: var(--el-fill-color-light);
}

.cmp-tree-ctx__item.is-danger {
  color: var(--el-color-danger);
}

.cmp-tree-ctx__divider {
  height: 1px;
  margin: 4px 6px;
  background-color: var(--el-border-color-lighter);
}
</style>
