<!--
  代码变更面板（工作台右栏 tab 内容，原「脚本版本历史抽屉」剥壳而来）：
  版本号倒序，展开查看该版源码，一键回滚（旧源码重走保存管线产新版本）。
  回滚成功后 emit rolled，宿主刷新台账并联动同组件的查看/编辑 tab。
-->
<template>
  <div class="chg-pane">
    <div class="chg-head">
      <span class="chg-head__code">{{ code }}</span>
      <el-tag v-if="current" size="small" type="success" effect="plain">当前 v{{ current }}</el-tag>
      <span class="chg-head__spacer" />
      <el-button link size="small" :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
    </div>

    <div v-loading="loading" class="chg-body">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="版本只追加、不覆盖；回滚＝把旧源码重新编译保存为新版本，当前链路始终跑最新版本。"
        class="chg-tip"
      />
      <el-empty v-if="!loading && versions.length === 0" description="还没有任何脚本版本" :image-size="80" />
      <div v-for="v in versions" :key="v.id" class="chg-item">
        <div class="chg-item__head" @click="toggle(v.versionNo)">
          <el-icon class="chg-item__arrow" :class="{ 'is-open': expanded.has(v.versionNo) }">
            <ArrowRight />
          </el-icon>
          <span class="chg-item__no">v{{ v.versionNo }}</span>
          <el-tag v-if="v.versionNo === current" size="small" type="success" effect="dark">
            当前版本
          </el-tag>
          <span v-else-if="v.remark" class="chg-item__remark">{{ v.remark }}</span>
          <span class="chg-item__time">{{ v.createTime || '' }}</span>
          <span class="chg-item__spacer" />
          <el-button
            v-if="v.versionNo !== current"
            link
            type="warning"
            size="small"
            :loading="rollingNo === v.versionNo"
            @click.stop="handleRollback(v)"
          >
            回滚到此版本
          </el-button>
        </div>
        <div v-show="expanded.has(v.versionNo)" class="chg-item__code">
          <JavaCodeEditor
            :model-value="v.scriptBody"
            :readonly="true"
            height="380px"
            :diagnostics="[]"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ArrowRight, Refresh } from '@element-plus/icons-vue';
import { onMounted, ref, watch } from 'vue';
import { listScriptVersions, rollbackScript } from '@/api/databus/component';
import type { ScriptSaveResult, ScriptVersion } from '@/api/databus/component/types';
import modal from '@/plugins/modal';
import JavaCodeEditor from '../../form/JavaCodeEditor.vue';

defineOptions({ name: 'ComponentChangesPane' });

const props = defineProps<{
  /** databus_component 行 id */
  dbId: number;
  /** 组件编码，面板头部展示 */
  code?: string;
  /** 当前生效版本号（外部保存/回滚后由宿主更新，触发重载） */
  currentVersion?: number | null;
}>();

const emit = defineEmits<{
  /** 回滚成功（新版本已生效） */
  (e: 'rolled', result: ScriptSaveResult): void;
}>();

const loading = ref(false);
const rollingNo = ref<number>();
const versions = ref<ScriptVersion[]>([]);
const current = ref<number>();
const expanded = ref<Set<number>>(new Set());

async function load() {
  loading.value = true;
  try {
    const { data } = await listScriptVersions(props.dbId);
    versions.value = data ?? [];
    current.value = props.currentVersion ?? versions.value[0]?.versionNo;
    // 默认展开最新版本一条，其余收起（源码整段渲染，全展开会卡）
    expanded.value = versions.value.length ? new Set([versions.value[0].versionNo]) : new Set();
  } finally {
    loading.value = false;
  }
}

function toggle(versionNo: number) {
  const next = new Set(expanded.value);
  if (next.has(versionNo)) {
    next.delete(versionNo);
  } else {
    next.add(versionNo);
  }
  expanded.value = next;
}

async function handleRollback(v: ScriptVersion) {
  if (rollingNo.value != null) {
    return;
  }
  await modal.confirm(
    `确认回滚到 v${v.versionNo}？该版本源码将重新编译并保存为新版本，编译失败不会影响当前运行版本。`
  );
  rollingNo.value = v.versionNo;
  try {
    const { data } = await rollbackScript({ id: props.dbId, versionNo: v.versionNo });
    if (!data.success) {
      modal.msgError(data.message || '回滚失败：编译未通过');
      return;
    }
    modal.msgSuccess(`已回滚，新版本 v${data.version} 已生效`);
    emit('rolled', data);
    current.value = data.version;
    await load();
  } finally {
    rollingNo.value = undefined;
  }
}

// tab 内容缓存不销毁：外部（编辑保存/宿主刷新）改了当前版本就重载列表
watch(
  () => props.currentVersion,
  (val) => {
    if (val != null && val !== current.value) {
      load();
    }
  }
);

onMounted(load);
</script>

<style lang="scss" scoped>
.chg-pane {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.chg-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);

  &__code {
    font-family: 'JetBrains Mono', Consolas, monospace;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  &__spacer {
    flex: 1;
  }
}

.chg-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 20px 20px;
}

.chg-tip {
  margin-bottom: 4px;
}

.chg-item {
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-fill-color-blank, #fff);
}

.chg-item__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
}

.chg-item__arrow {
  transition: transform 0.2s;

  &.is-open {
    transform: rotate(90deg);
  }
}

.chg-item__no {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 14px;
  font-weight: 700;
  color: var(--el-text-color-primary, #1d2129);
}

.chg-item__remark {
  font-size: 12px;
  color: var(--el-color-warning, #e6a23c);
}

.chg-item__time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.chg-item__spacer {
  flex: 1;
}

.chg-item__code {
  padding: 12px 14px 14px;
  border-top: 1px dashed var(--el-border-color-lighter, #ebeef5);
}
</style>
