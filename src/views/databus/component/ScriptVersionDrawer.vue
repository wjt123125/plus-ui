<!--
  脚本版本历史抽屉：版本号倒序，展开查看该版源码，一键回滚（旧源码重走保存管线产新版本）。
  仅 databus:component:script:edit 权限可见入口；正文含完整源码，不做截断。
-->
<template>
  <el-drawer
    v-model="visible"
    title="脚本版本历史"
    size="62%"
    append-to-body
    destroy-on-close
    class="script-version-drawer"
  >
    <div v-loading="loading" class="svd-body">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="版本只追加、不覆盖；回滚＝把旧源码重新编译保存为新版本，当前链路始终跑最新版本。"
        class="svd-tip"
      />
      <el-empty v-if="!loading && versions.length === 0" description="还没有任何脚本版本" :image-size="80" />
      <div v-for="v in versions" :key="v.id" class="svd-item">
        <div class="svd-item__head" @click="toggle(v.id)">
          <el-icon class="svd-item__arrow" :class="{ 'is-open': expanded.has(v.id) }">
            <ArrowRight />
          </el-icon>
          <span class="svd-item__no">v{{ v.versionNo }}</span>
          <el-tag v-if="v.versionNo === currentVersion" size="small" type="success" effect="dark">
            当前版本
          </el-tag>
          <span v-else-if="v.remark" class="svd-item__remark">{{ v.remark }}</span>
          <span class="svd-item__time">{{ v.createTime || '' }}</span>
          <span class="svd-item__spacer" />
          <el-button
            v-if="v.versionNo !== currentVersion"
            link
            type="warning"
            size="small"
            :loading="rollingNo === v.versionNo"
            @click.stop="handleRollback(v)"
          >
            回滚到此版本
          </el-button>
        </div>
        <div v-show="expanded.has(v.id)" class="svd-item__code">
          <JavaCodeEditor
            :model-value="v.scriptBody"
            :readonly="true"
            height="380px"
            :diagnostics="[]"
          />
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ArrowRight } from '@element-plus/icons-vue';
import { ref } from 'vue';
import { listScriptVersions, rollbackScript } from '@/api/databus/component';
import type { ScriptSaveResult, ScriptVersion } from '@/api/databus/component/types';
import modal from '@/plugins/modal';
import JavaCodeEditor from './JavaCodeEditor.vue';

const emit = defineEmits<{
  /** 回滚成功（新版本已生效），父组件刷新详情/台账 */
  (e: 'rolled', result: ScriptSaveResult): void;
}>();

const visible = ref(false);
const loading = ref(false);
const rollingNo = ref<number>();
const versions = ref<ScriptVersion[]>([]);
const currentVersion = ref<number>();
const expanded = ref<Set<number>>(new Set());
/** 当前组件上下文（回滚入参用） */
const componentId = ref<number>();

async function open(id: number, current?: number | null) {
  componentId.value = id;
  currentVersion.value = current ?? undefined;
  versions.value = [];
  expanded.value = new Set();
  visible.value = true;
  loading.value = true;
  try {
    const { data } = await listScriptVersions(id);
    versions.value = data ?? [];
    if (versions.value.length) {
      expanded.value = new Set([versions.value[0].versionNo]);
    }
  } finally {
    loading.value = false;
  }
}

function toggle(id: number) {
  const next = new Set(expanded.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  expanded.value = next;
}

async function handleRollback(v: ScriptVersion) {
  if (componentId.value == null || rollingNo.value != null) {
    return;
  }
  await modal.confirm(`确认回滚到 v${v.versionNo}？该版本源码将重新编译并保存为新版本，编译失败不会影响当前运行版本。`);
  rollingNo.value = v.versionNo;
  try {
    const { data } = await rollbackScript({ id: componentId.value, versionNo: v.versionNo });
    if (!data.success) {
      modal.msgError(data.message || '回滚失败：编译未通过');
      return;
    }
    modal.msgSuccess(`已回滚，新版本 v${data.version} 已生效`);
    emit('rolled', data);
    currentVersion.value = data.version;
    await open(componentId.value, data.version);
  } finally {
    rollingNo.value = undefined;
  }
}

defineExpose({ open });
</script>

<style lang="scss" scoped>
.svd-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 4px;
}

.svd-tip {
  margin-bottom: 4px;
}

.svd-item {
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-fill-color-blank, #fff);
}

.svd-item__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
}

.svd-item__arrow {
  transition: transform 0.2s;

  &.is-open {
    transform: rotate(90deg);
  }
}

.svd-item__no {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 14px;
  font-weight: 700;
  color: var(--el-text-color-primary, #1d2129);
}

.svd-item__remark {
  font-size: 12px;
  color: var(--el-color-warning, #e6a23c);
}

.svd-item__time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.svd-item__spacer {
  flex: 1;
}

.svd-item__code {
  padding: 0 14px 14px;
  border-top: 1px dashed var(--el-border-color-lighter, #ebeef5);
  padding-top: 12px;
}
</style>
