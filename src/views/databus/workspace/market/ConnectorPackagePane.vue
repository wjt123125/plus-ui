<!--
  连接器包查看 tab 面板（工作台 kind `connector-package`，审核「看得见」§2.3）。
  2026-10-29 由 ConnectorPackageDialog 弹窗 tab 化：已装治理行（MarketPane）与物料审核 tab
  （MarketReviewTab）两处「查看」按钮共用本 pane，两处审核者对同一个 zip 看同一份清单。
  真·工作台 tab（非弹窗/抽屉），key `connector-pkg:{type}:{version}` 同 type+version 单例。
  pane 自取数（inspectConnectorPackage），不依赖来源列表已加载，刷新后单独恢复该 tab 也能渲染。
  区块：头部（图标 / 标题 / 引擎档与扫描结论 badge / 右侧下载原包）→ 内部 el-tabs
  「概览（关键信息 + 机器先扫）/ 文件清单（lazy，展开行看 MANIFEST 与 class 清单）」。
  整页只留一条滚动条（清单表格不设 max-height，对齐 MarketItemPane 去嵌套滚动条口径）。

  2026-10-30 增 dev 分支（source=DEV，开发目录装载）：运行期没有 zip，故不走 inspect——
  概览读 def 行（装载目录 / 装载时间 / 引擎档），另给「实现（操作 + 连接配置字段）」与「运行时驱动」两页，
  开发调试要看的正是这两份声明与实际生效的驱动；头部「下载原包」换成「重载」（后端同样拒包下载，
  藏掉比点了报错好），装载口径的说明收进 InfoHint 的 hover 提示，不占正文版面。
-->
<template>
  <section v-loading="loading" class="cpk">
    <header class="cpk__head">
      <SvgIcon class="cpk__icon" icon-class="lucide:box" />
      <div class="cpk__titles">
        <h2 class="cpk__name">{{ title }}</h2>
        <div class="cpk__badges">
          <el-tag v-if="isDev" size="small" type="warning" effect="plain" title="开发目录装载：跑的是本地编译输出，不是上传的包">
            开发装载
          </el-tag>
          <el-tag v-else size="small" effect="plain">连接器包</el-tag>
          <el-tag v-if="engineLabel" size="small" type="info" effect="light">{{ engineLabel }}</el-tag>
          <el-tag v-if="defRow" size="small" :type="healthMeta.type" effect="light" :title="healthMeta.reason">
            {{ healthMeta.label }}
          </el-tag>
          <!-- 装载口径（目录/时间/没有 zip）收进 hover 提示：常驻正文会把下面的关键信息挤下去 -->
          <InfoHint v-if="isDev" :title="devHint.title" :items="devHint.items" />
          <template v-if="!isDev">
            <el-tag v-if="suspicious.length" size="small" type="warning" effect="light">
              可疑 API {{ suspicious.length }}
            </el-tag>
            <el-tag v-else-if="inspect" size="small" type="success" effect="light">未命中黑名单</el-tag>
          </template>
        </div>
      </div>
      <!-- dev 行没有 zip，下载入口不成立；同一位置给「重载」：改完代码点一下，下面的装载信息与驱动表立即刷新 -->
      <el-button
        v-if="isDev"
        class="cpk__download"
        :loading="reloading"
        :disabled="!canReload"
        :title="canReload ? '重新读编译输出目录并装载（卸载旧实例后生效）' : '需要连接器治理权限（databus:connector:edit）'"
        @click="onReload"
      >
        <SvgIcon icon-class="lucide:refresh-cw" /><span>重载</span>
      </el-button>
      <el-button v-else class="cpk__download" @click="onDownload">
        <SvgIcon icon-class="lucide:download" /><span>下载原包</span>
      </el-button>
    </header>

    <el-tabs v-model="activeTab" class="cpk__tabs db-tabs">
      <!-- ---------------------------- dev 分支：目录装载，无包可看 ---------------------------- -->
      <template v-if="isDev">
        <el-tab-pane label="概览" name="overview">
          <div class="cpk__body">
            <dl v-if="defRow" class="cpk__meta">
              <div class="cpk__meta-row">
                <dt>类型</dt>
                <dd class="mono">#{{ defRow.type }}</dd>
              </div>
              <div class="cpk__meta-row">
                <dt>版本</dt>
                <dd>{{ versionLabel(defRow.version) || 'dev' }}</dd>
              </div>
              <div class="cpk__meta-row">
                <dt>引擎档</dt>
                <dd>{{ defRow.engine || '—' }}</dd>
              </div>
              <div class="cpk__meta-row">
                <dt>装载目录</dt>
                <dd class="mono">{{ defRow.packagePath || '—' }}</dd>
              </div>
              <div class="cpk__meta-row">
                <dt>装载时间</dt>
                <dd>{{ defRow.updateTime || '—' }}</dd>
              </div>
            </dl>

            <el-empty v-if="!defRow && !loading" description="未找到该连接器的运行台账行（可能已被卸载）" :image-size="72" />
          </div>
        </el-tab-pane>

        <!-- 实现：与物料详情「连接器实现」页同一份组件，声明式内容（manifests 快照 → def 行） -->
        <el-tab-pane label="实现" name="capability" lazy>
          <div class="cpk__body">
            <ConnectorCapabilityTables
              v-if="defRow"
              :operations="defRow.operations"
              :config-schema="defRow.configSchema"
              :load-problem="loadProblem"
            />
            <el-empty v-else description="未找到该连接器的运行台账行" :image-size="72" />
          </div>
        </el-tab-pane>

        <!-- 运行时驱动：dev 调试最需要看的「实际装载上了什么、来自包内还是平台」 -->
        <el-tab-pane label="驱动" name="runtime" lazy>
          <div class="cpk__body">
            <!-- key 带重载序号：重载即换装载实例，旧驱动结论不能当现状 -->
            <ConnectorRuntimePanel :key="`${type}-${runtimeKey}`" :type="type" :load-problem="loadProblem" />
          </div>
        </el-tab-pane>
      </template>

      <!-- ---------------------------- 正式包分支（原逻辑不变） ---------------------------- -->
      <template v-else>
        <!-- 概览：关键信息 + 机器先扫结论（进 tab 首屏即见，审核不用先翻清单） -->
        <el-tab-pane label="概览" name="overview">
          <div class="cpk__body">
            <dl class="cpk__meta">
              <div class="cpk__meta-row">
                <dt>类型</dt>
                <dd class="mono">#{{ inspect?.type || type }}</dd>
              </div>
              <div class="cpk__meta-row">
                <dt>版本</dt>
                <dd>{{ versionLabel(inspect?.version || version) }}</dd>
              </div>
              <div class="cpk__meta-row">
                <dt>引擎档</dt>
                <dd>{{ inspect?.engine || '—' }}</dd>
              </div>
              <div class="cpk__meta-row">
                <dt>实现类</dt>
                <dd class="mono">{{ inspect?.mainClass || '—' }}</dd>
              </div>
            </dl>

            <div v-if="suspicious.length" class="cpk__warn">
              <p class="cpk__warn-title">
                机器先扫：实现 jar 常量池命中 {{ suspicious.length }} 个可疑 API（非阻断，供人工核对）
              </p>
              <code class="cpk__codes">{{ suspicious.join('、') }}</code>
            </div>
            <div v-else-if="inspect" class="cpk__ok">未命中可疑 API 黑名单。</div>
          </div>
        </el-tab-pane>

        <!-- 文件清单：lazy 只省首屏渲染（数据与概览同一次请求返回） -->
        <el-tab-pane label="文件清单" name="files" lazy>
          <div class="cpk__body">
            <el-table v-if="fileCount" :data="inspect?.files ?? []" size="small" border>
              <!-- 展开看 jar 内 MANIFEST 快照与实现 jar 的 class 清单（后端已返回，不额外调接口） -->
              <el-table-column type="expand">
                <template #default="{ row }">
                  <div class="cpk__detail">
                    <template v-if="row.manifest">
                      <div class="cpk__detail-h">META-INF/MANIFEST.MF</div>
                      <pre class="cpk__pre">{{ row.manifest }}</pre>
                    </template>
                    <template v-if="row.classList?.length">
                      <div class="cpk__detail-h">class 清单（{{ row.classList.length }}）</div>
                      <pre class="cpk__pre">{{ row.classList.join('\n') }}</pre>
                    </template>
                    <div v-if="!row.manifest && !row.classList?.length" class="cpk__detail-empty">无更多明细。</div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="文件" prop="name" min-width="220" show-overflow-tooltip />
              <el-table-column label="体积" width="90" align="right">
                <template #default="{ row }">{{ formatSize(row.size) }}</template>
              </el-table-column>
              <el-table-column label="class 数" width="90" align="right">
                <template #default="{ row }">{{ row.kind === 'jar' ? (row.classes ?? 0) : '-' }}</template>
              </el-table-column>
              <el-table-column label="实现 jar" width="90" align="center">
                <template #default="{ row }">{{ row.mainJar ? '是' : '' }}</template>
              </el-table-column>
            </el-table>
            <el-empty v-else-if="!loading" description="暂无包清单数据" :image-size="72" />
          </div>
        </el-tab-pane>
      </template>
    </el-tabs>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { ConnectorDefVo, ConnectorPackageInspect } from '@/api/databus/connector/types';
import {
  downloadConnectorPackageUrl,
  inspectConnectorPackage,
  listConnectorDefs,
  reloadDevConnector
} from '@/api/databus/connector';
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';
import { useUserStore } from '@/store/modules/user';
import download from '@/plugins/download';
import { connectorHealthMeta, versionLabel } from './marketDisplay';
import ConnectorCapabilityTables from './ConnectorCapabilityTables.vue';
import ConnectorRuntimePanel from './ConnectorRuntimePanel.vue';
import InfoHint from './InfoHint.vue';

defineOptions({ name: 'ConnectorPackagePane' });

useLucideSubset();

const props = defineProps<{
  /** 连接器类型键（全局唯一，与版本号一起定位包文件） */
  type: string;
  /** 包版本号（dev 行固定为 dev） */
  version: string;
  /** 来源（DEV＝开发目录装载：没有 zip，改渲染目录装载信息） */
  source?: string;
}>();

const loading = ref(false);
const inspect = ref<ConnectorPackageInspect | null>(null);
/** dev 分支数据源：运行台账行（装载目录 / 装载时间 / 操作与配置声明） */
const defRow = ref<ConnectorDefVo | null>(null);
/** 内部 tab：概览默认，其余页首次切到才渲染 */
const activeTab = ref('overview');

/* 权限判定按权限串（admin 通配免检），与 MarketPane / MarketItemPane 同口径 */
const userStore = useUserStore();
function hasPermi(perm: string): boolean {
  return userStore.permissions.some((p: string) => p === '*:*:*' || p === perm);
}

const isDev = computed(() => props.source === 'DEV');
const title = computed(() => `${props.type} · ${versionLabel(props.version)}`);
const suspicious = computed(() => inspect.value?.suspicious ?? []);
const fileCount = computed(() => inspect.value?.files?.length ?? 0);
const engineLabel = computed(() => (isDev.value ? defRow.value?.engine : inspect.value?.engine) || '');

/** 重载是治理动作（后端 @SaCheckPermission databus:connector:edit），没权限只给禁用态并说明原因 */
const canReload = computed(() => hasPermi('databus:connector:edit'));
const reloading = ref(false);
/** 重载序号：换掉 ConnectorRuntimePanel 的 key，让它重挂重取装载后的驱动 */
const runtimeKey = ref(0);

/** dev 行的装载口径（hover 提示）：三组说人话，分别交代「没有包」「时间怎么读」「目录是什么」 */
const devHint = {
  title: '这一行为什么没有安装包',
  items: [
    { label: '直接跑编译产物', text: '类从 target/classes 读，依赖从 target/lib 读，运行时不打包，所以没有 zip 可下载。' },
    { label: '装载时间', text: '最近一次装载或重载的时间；改了代码没点「重载」，这里不会变。' },
    { label: '装载目录', text: '显示的是 target 目录（classes 的上一级），和正式包的 package_path 一个口径。' }
  ]
};

/** 头部状态标签走健康口径（§4.2.1）：status≠ENABLED 灰，ENABLED 再按 health 分绿 / 黄 / 红 */
const healthMeta = computed(() => connectorHealthMeta(defRow.value));

/**
 * 连接器没在跑时后端给的人话原因（health 不可用才有值）。
 * 实现 / 驱动两个 tab 的数据都来自运行态（describe()、运行时驱动清单），没装载就是取不到；
 * 空态照实说「取不到 + 原因」，不能断言「该连接器没有操作 / 不需要配置」——那是错误结论。
 */
const loadProblem = computed(() => (healthMeta.value.usable ? null : healthMeta.value.reason));

/** 正式包：包内清单 + 实现 jar 常量池扫描（同一请求全返回） */
async function loadPackage(): Promise<void> {
  if (!props.type || !props.version) {
    inspect.value = null;
    return;
  }
  try {
    const { data } = await inspectConnectorPackage(props.type, props.version);
    inspect.value = data ?? null;
  } catch {
    inspect.value = null; // 拦截器已提示；留空态
  }
}

/** 查本 type 的运行台账行（dev / 正式包都查）：概览读它，健康标签与故障横条也读它 */
async function loadDefRow(): Promise<void> {
  if (!props.type || !hasPermi('databus:connector:list')) {
    defRow.value = null;
    return;
  }
  try {
    const { data } = await listConnectorDefs();
    defRow.value = (data ?? []).find((d) => d.type === props.type) ?? null;
  } catch {
    defRow.value = null;
  }
}

/**
 * dev 重载（头部的「重载」按钮）：后端卸载旧实例 → 重读编译输出目录 → 装载新实例。
 * 成功后重取 def 行（装载目录/装载时间/声明跟着变）并重挂运行时驱动面板，
 * 支持「改代码 → 编译 → 点重载 → 就地看装载结果」这一条闭环。
 */
async function onReload(): Promise<void> {
  if (!props.type || !canReload.value || reloading.value) {
    return;
  }
  reloading.value = true;
  try {
    const { data } = await reloadDevConnector(props.type);
    const loaded = data ?? [];
    if (loaded.length) {
      ElMessage.success(`已重新装载「${props.type}」`);
    } else {
      ElMessage.warning('没有装载到任何连接器：检查开发目录配置，以及代码是否已编译');
    }
    await loadDefRow(); // 概览/实现两页读 def 行，健康态也随之刷新
    runtimeKey.value += 1; // 运行时驱动换实例重取
  } catch {
    /* 拦截器已提示 */
  } finally {
    reloading.value = false;
  }
}

async function load(): Promise<void> {
  activeTab.value = 'overview';
  loading.value = true;
  inspect.value = null;
  defRow.value = null;
  try {
    // def 行两个分支都要（概览 + 健康横条都读它）；正式包另外并行取包内清单
    await Promise.all([loadDefRow(), isDev.value ? Promise.resolve() : loadPackage()]);
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.type, props.version, props.source],
  () => {
    // 同 pane 复用：回到概览页重取（dev 与正式包走两条取数路径，故一并归零）
    void load();
  },
  { immediate: true }
);

/** 下载原包：blob 下载插件（不经过 JSON 拦截器），文件名 connector-{type}-{version}.zip */
function onDownload(): void {
  if (!props.type || !props.version) {
    ElMessage.warning('缺类型或版本号，无法定位包文件');
    return;
  }
  download.zip(downloadConnectorPackageUrl(props.type, props.version), `connector-${props.type}-${props.version}.zip`);
}

/** 体积可读化（字节 → KB/MB） */
function formatSize(size?: number): string {
  if (size == null) {
    return '-';
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}
</script>

<style lang="scss" scoped>
.cpk {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--el-bg-color, #fff);
  /* 与物料详情 pane 同宽：清单表格四列 + 展开行代码块，900px 才不挤 */
  --cpk-max: 900px;
}

.cpk__head,
.cpk__body {
  width: 100%;
  max-width: var(--cpk-max);
  margin-right: auto;
  margin-left: auto;
}

.cpk__head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px 14px;
}

.cpk__icon {
  flex-shrink: 0;
  font-size: 28px;
  color: var(--el-color-primary);
}

.cpk__titles {
  min-width: 0;
  flex: 1;
}

.cpk__name {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-family: var(--el-font-family-mono, monospace);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cpk__badges {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

/* 头部右侧动作（下载原包 / 重载）：标题窄的时候不许被挤扁 */
.cpk__download {
  flex-shrink: 0;
}

.cpk__tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;

  :deep(.el-tabs__header) {
    flex-shrink: 0;
    width: 100%;
    max-width: var(--cpk-max);
    margin: 0 auto 12px;
    padding: 0 24px;
  }

  :deep(.el-tabs__content) {
    flex: 1;
    min-height: 0;
  }

  :deep(.el-tab-pane) {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
}

.cpk__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 24px 16px;

  /* 整页只留这一条滚动条，做窄做淡 */
  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--el-border-color);
    border-radius: 4px;

    &:hover {
      background: var(--el-border-color-darker);
    }
  }
}

/* 关键信息：与物料详情 pane 的元数据表同范式（细线分隔，不堆卡片） */
.cpk__meta {
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--el-border-color-lighter);
}

.cpk__meta-row {
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
    flex: 1;
    min-width: 0;
    margin: 0;
    color: var(--el-text-color-primary);
    word-break: break-all;

    &.mono {
      font-family: var(--el-font-family-mono, monospace);
    }
  }
}

.cpk__warn {
  margin-top: 16px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--el-color-warning-light-9);
}

.cpk__warn-title {
  margin: 0 0 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-color-warning);
}

.cpk__codes {
  display: block;
  font-family: var(--el-font-family-mono, monospace);
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.cpk__ok {
  margin-top: 16px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}

/* 表格展开行：jar 的 MANIFEST 快照与实现 jar 的 class 清单 */
.cpk__detail {
  padding: 4px 12px 8px;
}

.cpk__detail-h {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.cpk__detail-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.cpk__pre {
  margin: 0 0 10px;
  padding: 8px 10px;
  overflow: auto;
  border-radius: 6px;
  background: var(--el-fill-color-light, #f5f7fa);
  font-family: var(--el-font-family-mono, monospace);
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
