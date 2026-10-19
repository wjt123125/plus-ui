<!--
  物料详情 tab 面板（工作台 kind `market-detail`，设计正本 §3.4）。
  真·工作台 tab（非弹窗/抽屉），key `market-item:{id}` 同 id 单例。
  pane 自取数（GET /databus/market/items/{id}），不依赖市场列表已加载，刷新后单独恢复也能渲染。
  区块：头部（图标/名称/类型/状态）/ 作者 / 简介 / 标签 / 指标 / 元数据 / 底部三态按钮。
  自身仅调浏览详情与安装接口；打开本地副本、已上架跳转、作者筛选一律上抛宿主。
-->
<template>
  <section class="mkti">
    <template v-if="item">
      <header class="mkti__head">
        <SvgIcon
          class="mkti__icon"
          :icon-class="itemIcon"
          :style="{ color: item.color || 'var(--el-color-primary)' }"
        />
        <div class="mkti__titles">
          <h2 class="mkti__name">{{ item.name }}</h2>
          <div class="mkti__badges">
            <el-tag size="small" effect="plain">{{ resourceLabel }}</el-tag>
            <el-tag size="small" :type="statusMeta.type" effect="light">{{ statusMeta.label }}</el-tag>
          </div>
        </div>
      </header>

      <div class="mkti__body">
        <div class="mkti__author">
          作者
          <button v-if="item.ownerCode" type="button" class="mkti__author-link" @click="onAuthor">
            @{{ item.ownerCode }}
          </button>
        </div>

        <p class="mkti__summary">{{ item.summary || '（无简介）' }}</p>

        <div v-if="item.tags?.length" class="mkti__chips">
          <el-tag v-for="t in item.tags" :key="t" size="small" effect="plain">{{ t }}</el-tag>
        </div>

        <div class="mkti__metrics">
          <div class="mkti__metric">
            <div class="mkti__metric-num">{{ item.installCount ?? 0 }}</div>
            <div class="mkti__metric-label">安装数</div>
          </div>
          <div class="mkti__metric">
            <div class="mkti__metric-num">{{ item.refCount ?? 0 }}</div>
            <div class="mkti__metric-label">被引用数</div>
          </div>
          <div class="mkti__metric">
            <div class="mkti__metric-num">{{ item.forkPublishCount ?? 0 }}</div>
            <div class="mkti__metric-label">fork 改后发布数</div>
          </div>
        </div>

        <dl class="mkti__meta">
          <div class="mkti__meta-row">
            <dt>展示码</dt>
            <dd>{{ item.codeDisplay }}</dd>
          </div>
          <div class="mkti__meta-row">
            <dt>上架时间</dt>
            <dd>{{ item.createTime || '—' }}</dd>
          </div>
          <div class="mkti__meta-row">
            <dt>更新时间</dt>
            <dd>{{ item.updateTime || '—' }}</dd>
          </div>
        </dl>
      </div>

      <footer class="mkti__foot">
        <el-button v-if="item.installed" type="primary" @click="onUse">
          <SvgIcon icon-class="lucide:external-link" /><span>使用</span>
        </el-button>
        <el-button v-else-if="item.mine" @click="onMine">
          <SvgIcon icon-class="lucide:settings" /><span>已上架 · 去管理</span>
        </el-button>
        <el-button v-else type="primary" @click="openInstall">
          <SvgIcon icon-class="lucide:download" /><span>安装</span>
        </el-button>
      </footer>
    </template>

    <div v-else-if="loading" v-loading="true" class="mkti__loading" />
    <el-empty v-else description="物料不存在或不可见" :image-size="72" />

    <MarketInstallDialog
      v-model:visible="installVisible"
      :item="item"
      :loading="installLoading"
      @confirm="onInstallConfirm"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { getMarketItem, installMarketItem } from '@/api/databus/market';
import type { DatabusMarketItemVo, MarketItemStatus } from '@/api/databus/market/types';
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';
import { marketNavIntent } from './useMarketData';
import MarketInstallDialog from './MarketInstallDialog.vue';

defineOptions({ name: 'MarketItemPane' });

useLucideSubset();

const props = defineProps<{ itemId: string }>();

const emit = defineEmits<{
  /** 打开本地副本（使用）：宿主按类型开画布 / 详情 tab */
  (e: 'open-local', localResourceId: string | number, resourceType: 'COMPONENT' | 'CHAIN', title: string): void;
  /** 安装成功：宿主刷树与台账 */
  (e: 'installed'): void;
  /** 请求切到物料市场 tab（作者筛选 / 已上架跳转） */
  (e: 'open-market'): void;
}>();

const item = ref<DatabusMarketItemVo | null>(null);
const loading = ref(false);

const installVisible = ref(false);
const installLoading = ref(false);

async function fetchItem() {
  loading.value = true;
  try {
    const { data } = await getMarketItem(props.itemId);
    item.value = data ?? null;
  } catch {
    item.value = null;
  } finally {
    loading.value = false;
  }
}

watch(() => props.itemId, fetchItem, { immediate: true });

/* ---------------- 展示辅助 ---------------- */

const itemIcon = computed(() =>
  item.value?.resourceType === 'CHAIN' ? 'lucide:spline' : item.value?.icon || 'lucide:box'
);
const resourceLabel = computed(() => (item.value?.resourceType === 'CHAIN' ? '链路' : '组件'));

const STATUS_META: Record<MarketItemStatus, { label: string; type: 'primary' | 'success' | 'warning' | 'danger' | 'info' }> = {
  DRAFT: { label: '草稿', type: 'info' },
  PENDING: { label: '待审核', type: 'warning' },
  APPROVED: { label: '已通过', type: 'primary' },
  REJECTED: { label: '已驳回', type: 'danger' },
  ONLINE: { label: '已上架', type: 'success' },
  OFFLINE: { label: '已下架', type: 'info' }
};
const statusMeta = computed(() => STATUS_META[item.value?.status as MarketItemStatus] ?? { label: item.value?.status ?? '', type: 'info' as const });

/* ---------------- 底部动作 ---------------- */

/** 作者点选：请求市场 tab 切到该作者作品 */
function onAuthor() {
  if (!item.value?.ownerCode) {
    return;
  }
  marketNavIntent.value = { kind: 'owner', ownerCode: item.value.ownerCode };
  emit('open-market');
}

/** 已上架：请求市场 tab 落到「我的上架」管理视图 */
function onMine() {
  marketNavIntent.value = { kind: 'mine' };
  emit('open-market');
}

/** 已装：打开本地副本 */
function onUse() {
  const it = item.value;
  if (!it || it.localResourceId == null) {
    return;
  }
  emit('open-local', it.localResourceId, it.resourceType, it.name);
}

function openInstall() {
  installVisible.value = true;
}

async function onInstallConfirm(directoryId: string | number | null) {
  const it = item.value;
  if (!it) {
    return;
  }
  installLoading.value = true;
  try {
    await installMarketItem(it.id, { directoryId: directoryId ?? null });
    ElMessage.success(`已安装「${it.name}」，可到资源树「我的目录」查看`);
    installVisible.value = false;
    emit('installed');
    await fetchItem(); // 刷新 installed / localResourceId，底部按钮切「使用」
  } catch {
    /* 拦截器已提示 */
  } finally {
    installLoading.value = false;
  }
}
</script>

<style lang="scss" scoped>
.mkti {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--el-bg-color, #fff);
  --mkti-max: 720px;
}

.mkti__head,
.mkti__body,
.mkti__foot,
.mkti__loading {
  width: 100%;
  max-width: var(--mkti-max);
  margin-right: auto;
  margin-left: auto;
}

.mkti__head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px 14px;
}

.mkti__icon {
  flex-shrink: 0;
  font-size: 28px;
}

.mkti__titles {
  min-width: 0;
  flex: 1;
}

.mkti__name {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mkti__badges {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.mkti__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 24px 16px;
}

.mkti__author {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.mkti__author-link {
  padding: 0;
  font-size: 13px;
  color: var(--el-color-primary);
  background: transparent;
  border: none;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}

.mkti__summary {
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
}

.mkti__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 14px;
}

.mkti__metrics {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.mkti__metric {
  flex: 1;
  padding: 12px;
  border-radius: 10px;
  background: var(--el-fill-color-light, #f5f7fa);

  &-num {
    font-size: 20px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  &-label {
    margin-top: 4px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}

.mkti__meta {
  margin: 20px 0 0;
  padding: 0;
  border-top: 1px solid var(--el-border-color-lighter);
}

.mkti__meta-row {
  display: flex;
  gap: 12px;
  padding: 10px 0;
  font-size: 13px;
  border-bottom: 1px solid var(--el-border-color-lighter);

  dt {
    flex-shrink: 0;
    width: 72px;
    color: var(--el-text-color-secondary);
  }

  dd {
    margin: 0;
    min-width: 0;
    color: var(--el-text-color-primary);
    word-break: break-all;
  }
}

.mkti__foot {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  padding: 14px 24px 18px;
}

.mkti__loading {
  flex: 1;
  min-height: 0;
}
</style>