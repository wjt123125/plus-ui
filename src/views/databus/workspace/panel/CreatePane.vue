<template>
  <div class="create">
    <header class="create__head">
      <div class="create__titles">
        <h2 class="create__title">新建</h2>
        <p class="create__sub">选择资源类型填写保存，保存后表单复位可连续新建；草稿随 tab 保留</p>
      </div>
    </header>
    <nav class="create__bar">
      <div v-if="visibleSegs.length" class="create__seg">
        <button
          v-for="seg in visibleSegs"
          :key="seg.value"
          type="button"
          class="create__seg-item"
          :class="{ 'is-active': currentFiletype === seg.value }"
          @click="switchFiletype(seg.value)"
        >
          {{ seg.label }}
        </button>
      </div>
    </nav>
    <main class="create__body">
      <template v-if="visibleSegs.length">
        <ChainFormBody
          v-if="currentFiletype === 'chain'"
          ref="chainBodyRef"
          :chain-id="null"
          :preset="preset"
          @saved="onChainSaved"
          @cancel="emit('cancel')"
          @dirty-change="onDirtyChange"
        />
        <FormPane
          v-else-if="currentFiletype === 'component'"
          ref="formPaneRef"
          :preset="preset"
          :tag-suggestions="tagSuggestions"
          @saved="onComponentSaved"
          @cancel="emit('cancel')"
          @dirty-change="onDirtyChange"
        />
        <DirectoryFormBody
          v-else-if="currentFiletype === 'directory'"
          ref="directoryBodyRef"
          :directory-id="null"
          :preset="preset"
          @saved="onDirectorySaved"
          @cancel="emit('cancel')"
          @dirty-change="onDirtyChange"
        />
        <ConnectionFormBody
          v-else
          ref="connectionBodyRef"
          connection-id="new"
          @saved="onConnectionSaved"
          @cancel="emit('cancel')"
          @dirty-change="onDirtyChange"
        />
      </template>
      <p v-else class="create__empty">当前账号无任何新增权限</p>
    </main>
  </div>
</template>

<script setup lang="ts">
/**
 * 新建向导面板（decisions.md §10「新建向导统一入口」，2026-10-21 新建路径收敛）：
 * 物料市场范式——顶部常驻 filetype 分段（链路/组件/目录/连接器）+ 限宽居中表单体区；
 * 单例 create tab 宿主（key 固定 'create'，草稿随 v-show 保活）。
 * 四段表单体与各自编辑壳（抽屉/dialog）共用一份代码，本面板只做新增态分发。
 */
import ChainFormBody, { type ChainFormSuccessPayload } from '../../chain/ChainFormBody.vue';
import FormPane from './FormPane.vue';
import DirectoryFormBody from './DirectoryFormBody.vue';
import ConnectionFormBody from './ConnectionFormBody.vue';
import modal from '@/plugins/modal';
import { checkPermi } from '@/utils/permission';
import type { ComponentSaved, ConnectionSaved, CreateFileType, CreateSavedPayload, FormPreset } from '../workbench.types';

const props = defineProps<{
  /** 当前分段资源类型（受控：宿主 tab.filetype；切段确认/回滚经 filetype-change 双向同步） */
  filetype: CreateFileType;
  /** 新建预设（树右键入口携带归属目录/分组/业务域；各表单体自行 watch 应用） */
  preset?: FormPreset;
  /** 组件段：标签建议词（透传 FormPane） */
  tagSuggestions?: string[];
}>();

const emit = defineEmits<{
  (e: 'saved', payload: CreateSavedPayload): void;
  (e: 'cancel'): void;
  (e: 'dirty-change', dirty: boolean): void;
  (e: 'filetype-change', filetype: CreateFileType): void;
}>();

/** 分段定义：label + 段级新增权限（无权限段不渲染；权限收回后会话恢复时兜底空态） */
const SEGS: ReadonlyArray<{ value: CreateFileType; label: string; permi: string[] }> = [
  { value: 'chain', label: '链路', permi: ['databus:editor:add'] },
  { value: 'component', label: '组件', permi: ['databus:component:add'] },
  { value: 'directory', label: '目录', permi: ['databus:directory:add'] },
  { value: 'connection', label: '连接器', permi: ['databus:connection:add'] }
];

const visibleSegs = computed(() => SEGS.filter((seg) => checkPermi(seg.permi)));

/** 内部分段（v-if 源）：初始取 props 值，无权限时降级到首个可见段 */
const currentFiletype = ref<CreateFileType>(
  visibleSegs.value.some((seg) => seg.value === props.filetype) ? props.filetype : (visibleSegs.value[0]?.value ?? 'chain')
);

/** 当前段脏态镜像（切段弃稿确认用；段重建后以新段上报为准） */
const currentDirty = ref(false);

/* 四段表单体引用（保存后调 reload 复位） */
const chainBodyRef = ref<InstanceType<typeof ChainFormBody> | null>(null);
const formPaneRef = ref<InstanceType<typeof FormPane> | null>(null);
const directoryBodyRef = ref<InstanceType<typeof DirectoryFormBody> | null>(null);
const connectionBodyRef = ref<InstanceType<typeof ConnectionFormBody> | null>(null);

/**
 * 统一切段入口（seg 点击与外部 openCreate 突变 props 都走这里）：
 * 当前段有未保存内容先弹弃稿确认（decisions §10）；取消且属外部突变则回滚——
 * 通知宿主改回旧值（回滚再触发 watch → 早退，无死循环）。确认后切段（v-if 销毁旧段即弃稿）。
 */
async function switchFiletype(next: CreateFileType) {
  if (next === currentFiletype.value) {
    return;
  }
  if (currentDirty.value) {
    try {
      await modal.confirm('当前分段存在未保存内容，切换类型后将丢弃。是否继续？');
    } catch {
      if (next === props.filetype) {
        emit('filetype-change', currentFiletype.value);
      }
      return;
    }
  }
  currentFiletype.value = next;
  currentDirty.value = false;
  if (next !== props.filetype) {
    emit('filetype-change', next);
  }
}

/** 外部 openCreate 突变 tab.filetype：进统一切段（脏确认/回滚） */
watch(
  () => props.filetype,
  (next) => {
    if (next) {
      void switchFiletype(next);
    }
  }
);

/** 脏态转发：镜像当前段供切段确认，同时上报宿主点 tab 条脏点 */
function onDirtyChange(dirty: boolean) {
  currentDirty.value = dirty;
  emit('dirty-change', dirty);
}

/* ---------------- 保存流：转发宿主派发后续动作 + 当前段 reload 复位（各表单体新增态均重放 preset 预填） ---------------- */

function onChainSaved(payload?: ChainFormSuccessPayload) {
  emit('saved', { filetype: 'chain', chain: payload });
  void chainBodyRef.value?.reload();
}

function onComponentSaved(payload: ComponentSaved) {
  emit('saved', { filetype: 'component', component: payload });
  void formPaneRef.value?.reload();
}

function onDirectorySaved(isNew: boolean) {
  emit('saved', { filetype: 'directory', directory: isNew });
  void directoryBodyRef.value?.reload();
}

function onConnectionSaved(payload: ConnectionSaved) {
  emit('saved', { filetype: 'connection', connection: payload });
  void connectionBodyRef.value?.reload();
}
</script>

<style lang="scss" scoped>
.create {
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--el-bg-color, #fff);
  --create-max: 1200px;
}

/* 限宽居中：窄屏 width:100% 铺满，宽屏封顶居中（照 MarketPane） */
.create__head,
.create__bar,
.create__body {
  width: 100%;
  max-width: var(--create-max);
  margin-right: auto;
  margin-left: auto;
}

.create__head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px 12px;
}

.create__titles {
  min-width: 0;
  flex: 1;
}

.create__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.create__sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.create__bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 20px 10px;
}

/* filetype 分段（对标物料市场类型分段） */
.create__seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 9px;
  background: var(--el-fill-color-light, #f5f7fa);
}

.create__seg-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 14px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  background: transparent;
  border: none;
  border-radius: 7px;
  cursor: pointer;

  &.is-active {
    color: var(--el-text-color-primary);
    font-weight: 600;
    background: var(--el-bg-color);
    box-shadow: 0 1px 3px rgb(0 0 0 / 8%);
  }
}

/* 表单体区：限宽内满高，滚动由各表单体自理 */
.create__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0 20px 20px;
  box-sizing: border-box;
}

.create__empty {
  margin: 0;
  padding: 60px 0;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
