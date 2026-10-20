<!--
  standalone 资产只读分享页（databus-workspace-tabs.md §11 定案#7 逃生清单外的编辑器类分享页）：
  /databus/standalone/editor/:kind/:id
    - kind=detail：组件只读详情（DetailPane 复用，三态展示），:id=组件编码 componentCode
    - kind=canvas：链路只读画布（ChainCanvasPane readonly 宿主，仅渲染已保存链路），:id=链路雪花主键
  顶部资产头：名称/类型 + 「在工作台打开编辑」CTA；壳级「返回工作台」由父 standalone/index.vue 承载。
  鉴权不变（同源 token+perms）：无权限打开即 403，不靠随机 URL 藏内容。
  只读分享页不做编辑：DetailPane 底部操作条按钮（删除/编辑/代码变更）均带 v-hasPermi，
  但分享页不消费其 emit，按钮点击无副作用；链路画布走 readonly 宿主屏蔽编辑。
-->
<template>
  <div class="sa-editor">
    <!-- 资产头：身份 + 在工作台打开编辑 CTA -->
    <header class="sa-editor-head">
      <div class="sa-editor-head__info">
        <el-icon class="sa-editor-head__icon"><Box /></el-icon>
        <span class="sa-editor-head__title">{{ title }}</span>
        <el-tag size="small" effect="plain" class="sa-editor-head__tag">
          {{ kindLabel }}
        </el-tag>
        <span v-if="subtitle" class="sa-editor-head__sub">{{ subtitle }}</span>
      </div>
      <el-button type="primary" size="small" :icon="Edit" @click="goWorkspace">
        在工作台打开编辑
      </el-button>
    </header>

    <!-- 主体：detail→只读组件详情 / canvas→只读链路画布 -->
    <div class="sa-editor-body">
      <DetailPane v-if="kind === 'detail' && row" :row="row" />
      <ChainCanvasPane
        v-else-if="kind === 'canvas' && chainId"
        host="workbench"
        :load-chain-id="chainId"
        :readonly="true"
      />
      <div v-else class="sa-editor-empty">
        <el-skeleton v-if="loading" :rows="6" animated />
        <el-empty v-else :description="error || '未找到该资产，请检查链接' " :image-size="72" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Box, Edit } from '@element-plus/icons-vue';
import { listComponent, listComponentOptions } from '@/api/databus/component';
import type { ComponentOption, DatabusComponentVo } from '@/api/databus/component/types';
import {
  buildRegistry,
  type ComponentRegistryRow,
  type DefMeta
} from '@/views/databus/component/model/registry';
import DetailPane from '@/views/databus/workspace/panel/DetailPane.vue';
import ChainCanvasPane from '@/views/databus/editor/ChainCanvasPane.vue';

defineOptions({ name: 'DatabusStandaloneEditor' });

const route = useRoute();
const router = useRouter();

/** 分享类型：detail=组件 / canvas=链路 */
const kind = computed<string>(() => String(route.params.kind ?? ''));
/** :id——组件分享用编码（覆盖无 DB id 的内置件），链路分享用雪花主键字符串 */
const refId = computed<string>(() => String(route.params.id ?? ''));

const loading = ref(true);
const error = ref('');
/** 组件只读行（kind=detail 拉双源合流构造） */
const row = ref<ComponentRegistryRow | null>(null);
/** 链路只读主键（kind=canvas） */
const chainId = computed<number | string | null>(() =>
  kind.value === 'canvas' && refId.value ? refId.value : null
);

const isDetail = computed(() => kind.value === 'detail');

const title = computed(() =>
  isDetail.value ? (row.value?.name ?? '组件详情') : (chainId.value ? '链路画布' : '链路详情')
);

const subtitle = computed(() => {
  if (isDetail.value) return row.value?.code ? `编码 ${row.value.code}` : '';
  return chainId.value ? `链路 ${chainId.value}` : '';
});

const kindLabel = computed(() => (isDetail.value ? '组件 · 只读分享' : '链路 · 只读分享'));

/** 组件分享：双源合流构造台账行（与工作台 getList 同口径），按编码取单行 */
async function loadComponent(code: string) {
  loading.value = true;
  error.value = '';
  row.value = null;
  try {
    const [optRes, listRes] = await Promise.all([
      listComponentOptions(),
      listComponent({ pageNum: 1, pageSize: 999, componentCode: code })
    ]);
    const options: ComponentOption[] = optRes.data?.components ?? [];
    const dbRows: DatabusComponentVo[] = listRes.data?.rows ?? [];
    const defMap: ReadonlyMap<string, DefMeta> = new Map(
      options.map((o) => [
        o.code,
        {
          group: o.group ?? undefined,
          color: o.color ?? undefined,
          icon: o.icon ?? undefined,
          short: o.shortName ?? undefined
        }
      ])
    );
    row.value = buildRegistry(options, dbRows, defMap).find((r) => r.code === code) ?? null;
    if (!row.value) {
      error.value = '未找到该组件，可能已删除或编码有误';
    }
  } catch {
    error.value = '加载组件失败，请确认登录与访问权限';
  } finally {
    loading.value = false;
  }
}

// URL 变化（含首次挂载）重新分发：组件只读详情按编码拉取；链路只读画布直接吃 :id
watch(
  () => [kind.value, refId.value] as const,
  ([k, id]) => {
    if (!k || !id) {
      error.value = '链接缺少资产类型或标识';
      loading.value = false;
      return;
    }
    if (k === 'detail') {
      void loadComponent(id);
    } else if (k === 'canvas') {
      loading.value = false;
      error.value = '';
    } else {
      error.value = '未知的分享类型';
      loading.value = false;
    }
  },
  { immediate: true }
);

/** 在工作台打开编辑：回到工作台主壳（工作台无 URL 深链开 tab 能力，落地首页由用户自选） */
function goWorkspace() {
  router.push('/databus/workspace');
}
</script>

<style scoped>
/* 复用 standalone 外壳护栏（§6 写法1）：满高由父壳 100vh 分配，本页只吃 .standalone-body 区域；
   内部 flex 单列：资产头 flex-shrink:0，主体 flex:1 + min-height:0 内层滚动 */
.sa-editor {
  position: absolute;
  inset: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--el-bg-color, #fff);
}

.sa-editor-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 48px;
  padding: 0 16px;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
  background: var(--app-surface-bg, #fff);
}

.sa-editor-head__info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.sa-editor-head__icon {
  font-size: 16px;
  color: var(--el-color-primary);
}

.sa-editor-head__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text-title, #1f2937);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sa-editor-head__tag {
  flex-shrink: 0;
}

.sa-editor-head__sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: 'JetBrains Mono', Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sa-editor-body {
  flex: 1;
  min-height: 0;
  position: relative;
}

.sa-editor-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
</style>
