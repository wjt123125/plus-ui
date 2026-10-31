<!--
  物料详情 tab 面板（工作台 kind `market-detail`，设计正本 §3.4）。
  真·工作台 tab（非弹窗/抽屉），key `market-item:{id}` 同 id 单例。
  pane 自取数（GET /databus/market/items/{id}），不依赖市场列表已加载，刷新后单独恢复也能渲染。
  区块：头部（图标/名称/类型/状态）/ 作者 / 简介 / 标签 / 指标 / 元数据 / 底部动作。
  组件/链路走三态按钮（打开/已上架去管理/安装弹窗）；连接器走 enable 语义四态
  （停用/已启用标签/已上架去管理/启用，§15.3 安装＝enable 全局生效，无目录弹窗）。
  自身调浏览详情、安装与连接器停用接口；打开本地副本、已上架跳转、作者筛选一律上抛宿主。
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

      <!-- 内部 tab（2026-10-24 装前可看）：简介默认；实现页首次切到才拉取（懒加载，首屏保持轻） -->
      <el-tabs v-model="activeTab" class="mkti__tabs db-tabs" @tab-change="onTabChange">
        <el-tab-pane label="简介" name="intro">
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
        </el-tab-pane>

        <!-- 实现页：组件＝脚本+契约（组件的全部就是脚本）；链路＝节点清单+只读画布入口 -->
        <el-tab-pane v-if="item.resourceType !== 'CONNECTOR'" label="实现" name="impl" lazy>
          <div class="mkti__body">
            <div v-if="previewLoading" v-loading="true" class="mkti__impl-loading" />
            <template v-else-if="preview">
              <template v-if="preview.resourceType === 'COMPONENT'">
                <!-- 元信息一行带过：编码 · 版本 · 语言（不画框、不铺格子） -->
                <div class="mkti__impl-meta">
                  <span class="mkti__impl-meta-code">{{ preview.code || item.codeDisplay }}</span>
                  <span class="mkti__impl-sep">·</span>
                  <span>v{{ preview.version || '—' }}</span>
                  <span class="mkti__impl-sep">·</span>
                  <span>{{ (preview.scriptLang || '—').toUpperCase() }}</span>
                </div>

                <!-- 脚本与契约同一组折叠：只有标题行，没有卡片/边框堆叠 -->
                <el-collapse v-model="openImplSections" class="mkti__collapse">
                  <el-collapse-item name="script">
                    <template #title>
                      <span class="mkti__collapse-title">
                        执行脚本<span class="mkti__impl-hint"></span>
                      </span>
                    </template>
                    <!-- 只读编辑器按内容自适应高度：不再在每块代码里再长一条内部滚动条，
                         整个 tab 只保留页面级滚动（2026-10-24 去除嵌套滚动条） -->
                    <JavaCodeEditor
                      v-if="preview.scriptBody"
                      :model-value="preview.scriptBody"
                      readonly
                      height="auto"
                    />
                    <p v-else class="mkti__impl-summary">（无脚本，按配置参数运行）</p>
                  </el-collapse-item>
                  <el-collapse-item v-if="preview.paramSchema" title="配置参数" name="param">
                    <JsonCodeEditor
                      :model-value="prettySchema(preview.paramSchema)"
                      readonly
                      height="auto"
                    />
                  </el-collapse-item>
                  <el-collapse-item v-if="preview.inputSchema" title="输入数据结构" name="input">
                    <JsonCodeEditor
                      :model-value="prettySchema(preview.inputSchema)"
                      readonly
                      height="auto"
                    />
                  </el-collapse-item>
                  <el-collapse-item v-if="preview.outputSchema" title="输出数据结构" name="output">
                    <JsonCodeEditor
                      :model-value="prettySchema(preview.outputSchema)"
                      readonly
                      height="auto"
                    />
                  </el-collapse-item>
                </el-collapse>
              </template>
              <template v-else>
                <div class="mkti__impl-head">
                  <span class="mkti__collapse-title">
                    节点结构<span class="mkti__impl-hint">{{ preview.nodes?.length ?? 0 }} 个节点 · 参数细节见只读画布</span>
                  </span>
                  <el-button
                    v-if="preview.chainId != null"
                    size="small"
                    text
                    type="primary"
                    @click="onOpenCanvas"
                  >
                    <SvgIcon icon-class="lucide:spline" /><span>打开只读画布</span>
                  </el-button>
                </div>
                <!-- 编排轨道：按后端 depth 缩进还原层级，结构关键字弱化、业务叶子高亮 -->
                <ul v-if="preview.nodes?.length" class="mkti__node-rail">
                  <li
                    v-for="(n, i) in preview.nodes"
                    :key="i"
                    class="mkti__node"
                    :class="{ 'is-structure': n.structure }"
                    :style="{ paddingLeft: `${18 + (n.depth ?? 0) * 18}px` }"
                  >
                    <span class="mkti__node-dot" />
                    <span class="mkti__node-type">{{ n.type || '节点' }}</span>
                    <span v-if="n.code" class="mkti__node-name" :title="n.code">{{ n.name || n.code }}</span>
                  </li>
                </ul>
                <p v-else class="mkti__impl-summary">链路画布为空。</p>
              </template>
            </template>
            <el-empty v-else description="无法获取实现预览" :image-size="72" />
          </div>
        </el-tab-pane>

        <!-- 连接器实现页（§10.3）：零内置之后「它能干什么、要填什么」只存在于包内，
             取 def 行的 operations / configSchema（已装载时后端用运行态 describe() 覆盖 manifest 快照，§2.3） -->
        <el-tab-pane v-if="isConnector" label="实现" name="connectorImpl" lazy>
          <div class="mkti__body">
            <div v-if="connectorDefLoading" v-loading="true" class="mkti__impl-loading" />
            <template v-else-if="connectorDef">
              <div class="mkti__impl-meta">
                <span class="mkti__impl-meta-code">#{{ connectorDef.type }}</span>
                <span class="mkti__impl-sep">·</span>
                <span>{{ versionLabel(connectorDef.version) || '—' }}</span>
                <span class="mkti__impl-sep">·</span>
                <span>引擎档 {{ connectorDef.engine || '—' }}</span>
                <!-- 信任档是审核结论不是来源推论（§1.3：verified 由审批人勾选，source=ADMIN 不自动带） -->
                <el-tag size="small" :type="connectorDef.verified ? 'success' : 'warning'" effect="light">
                  {{ connectorDef.verified ? '已核验' : '未核验' }}
                </el-tag>
              </div>

              <!-- 两条警示照正本原文写死（§1.3）；其余引擎档没有既定结论，不臆造文案，只在上面亮出档位 -->
              <el-alert
                v-if="connectorDef.engine === 'jvm'"
                class="mkti__alert"
                type="warning"
                :closable="false"
                show-icon
                title="此连接器将获得服务器权限"
              >
                <p class="mkti__alert-p">
                  jvm 档＝包内实现类与它自带的驱动 jar 由 PluginClassLoader 装载进平台同一个 JVM 进程执行，没有进程隔离也没有沙箱。
                  信任边界只有两道：上传权限（只给管理员）＋另一位管理员看过代码后勾 verified（提交人 ≠ 审批人）。
                  审核是「人看代码」，拦得住的是上传门槛、默认未启用与留痕，拦不住蓄意破坏。
                </p>
                <p class="mkti__alert-p">连接器代表平台直连数据库，请使用最小权限账号。</p>
              </el-alert>

              <!-- verified 的两项放权要写清，否则这个标记只是个好看的标签，看不出它改变了什么行为 -->
              <p class="mkti__impl-summary mkti__verified-tip">
                {{
                  connectorDef.verified
                    ? '已核验：审核人看过代码并确认它不会干坏事，因此放开两项限制——试连失败回显归一化后的异常、私网地址黑名单豁免。'
                    : '未核验：审核人还没勾信任档，试连异常按归一化处理、私网地址不放行。启停开关即治理动作（databus:connector:edit）。'
                }}
              </p>

              <ConnectorCapabilityTables :operations="connectorDef.operations" :config-schema="connectorDef.configSchema" />
            </template>
            <el-empty v-else :description="connectorDefEmptyText" :image-size="72" />
          </div>
        </el-tab-pane>

        <!-- 运行时驱动页（§4.2.1）：child-first 之后「包里那份生效」是应当的，
             真走了父加载器没人会发现，所以把实际生效的驱动与来源摆出来 -->
        <el-tab-pane v-if="isConnector" label="驱动" name="runtime" lazy>
          <div class="mkti__body">
            <!-- key 带 type 与重载序号：换物料或启停之后强制重挂重取，不拿旧装载态当现状 -->
            <ConnectorRuntimePanel :key="`${connectorType ?? ''}-${runtimeKey}`" :type="connectorType ?? ''" />
          </div>
        </el-tab-pane>
      </el-tabs>

      <footer class="mkti__foot">
        <!-- 连接器（§15.3 安装＝enable 全局生效，无目录弹窗）：已启用态显示停用（治理权限）或只读标签 -->
        <template v-if="item.resourceType === 'CONNECTOR'">
          <el-button v-if="item.installed && canConnectorEdit" type="primary" :loading="installLoading" @click="onDisableConnector">
            <SvgIcon icon-class="lucide:power" /><span>停用</span>
          </el-button>
          <el-tag v-else-if="item.installed" type="success" effect="light">已启用 · 全局生效</el-tag>
          <el-button v-else-if="item.mine" @click="onMine">
            <SvgIcon icon-class="lucide:settings" /><span>已上架 · 去管理</span>
          </el-button>
          <el-button v-else type="primary" :loading="installLoading" @click="onInstallConnector">
            <SvgIcon icon-class="lucide:power" /><span>启用</span>
          </el-button>
        </template>
        <template v-else>
          <el-button v-if="item.installed" type="primary" @click="onUse">
            <SvgIcon icon-class="lucide:external-link" /><span>打开</span>
          </el-button>
          <el-button v-else-if="item.mine" @click="onMine">
            <SvgIcon icon-class="lucide:settings" /><span>已上架 · 去管理</span>
          </el-button>
          <el-button v-else type="primary" @click="openInstall">
            <SvgIcon icon-class="lucide:download" /><span>安装</span>
          </el-button>
        </template>
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
import { getMarketItem, getMarketPreview, installMarketItem } from '@/api/databus/market';
import { disableConnector, listConnectorDefs } from '@/api/databus/connector';
import type { ConnectorDefVo } from '@/api/databus/connector/types';
import type { DatabusMarketItemVo, MarketItemStatus, MarketPreviewVo } from '@/api/databus/market/types';
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';
import modal from '@/plugins/modal';
import { useUserStore } from '@/store/modules/user';
import { marketNavIntent, showChainInstallResult } from './useMarketData';
import { statusMeta as itemStatusMeta, versionLabel } from './marketDisplay';
import MarketInstallDialog from './MarketInstallDialog.vue';
import ConnectorCapabilityTables from './ConnectorCapabilityTables.vue';
import ConnectorRuntimePanel from './ConnectorRuntimePanel.vue';
import JavaCodeEditor from '@/views/databus/component/form/JavaCodeEditor.vue';
import JsonCodeEditor from '@/views/databus/editor/components/common/JsonCodeEditor.vue';

defineOptions({ name: 'MarketItemPane' });

useLucideSubset();

const props = defineProps<{ itemId: string }>();

const emit = defineEmits<{
  /** 打开本地资源：宿主按类型开画布 / 详情 tab */
  (e: 'open-local', localResourceId: string | number, resourceType: 'COMPONENT' | 'CHAIN', title: string): void;
  /** 安装成功：宿主刷树与台账 */
  (e: 'installed'): void;
  /** 请求切到物料市场 tab（作者筛选，意图经 marketNavIntent 传给市场 pane 消费） */
  (e: 'open-market'): void;
  /** 请求切到物料管理 tab 的「我的上架」视角（已上架物料的治理入口） */
  (e: 'open-manage'): void;
  /** 打开源链路只读画布（未安装也能看编排；宿主按 chainId 开画布 tab，只读由 owner 判定） */
  (e: 'open-source-canvas', chainId: string | number, title: string): void;
}>();

const item = ref<DatabusMarketItemVo | null>(null);
const loading = ref(false);

/* ---------------- 内部 tab：简介 / 实现（2026-10-24 装前可看） ---------------- */

const activeTab = ref('intro');
const preview = ref<MarketPreviewVo | null>(null);
const previewLoading = ref(false);
/** 拉过就不再重复拉（同一物料 tab 单例，切来切去不重复请求）；失败也置位，避免反复打接口 */
const previewLoaded = ref(false);
/** 实现页折叠组：默认只展开脚本（Schema 收起来，避免一屏堆三块大 JSON） */
const openImplSections = ref<string[]>(['script']);

/** 首次切到「实现」才请求（懒加载）；仅 ONLINE 物料后端放行，失败按空态展示 */
async function onTabChange(name: string | number) {
  // 连接器两页各有各的取数：「实现」在本 pane 拉 def 行，「运行时驱动」由 ConnectorRuntimePanel 挂载即取
  if (name === 'connectorImpl') {
    await loadConnectorDef();
    return;
  }
  if (name !== 'impl' || previewLoaded.value) {
    return;
  }
  previewLoaded.value = true;
  previewLoading.value = true;
  try {
    const { data } = await getMarketPreview(props.itemId);
    preview.value = data ?? null;
  } catch {
    preview.value = null; // 拦截器已提示
  } finally {
    previewLoading.value = false;
  }
}

/** Schema 原文美化：能解析就缩进，解析不了按原样展示（作者可能存了非 JSON 模板） */
function prettySchema(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/** 打开源链路只读画布：未安装也能看编排（只读态由画布按 owner≠当前用户自动判定） */
function onOpenCanvas() {
  if (preview.value?.chainId == null) {
    return;
  }
  emit('open-source-canvas', preview.value.chainId, item.value?.name || '链路预览');
}

/* ---------------- 连接器：实现清单 + 运行时驱动（2026-10-30 收尾，§10.3 / §4.2.1） ---------------- */

/** 详情物料是连接器才有这两页（组件/链路的「实现」走上面的 preview 分支） */
const isConnector = computed(() => item.value?.resourceType === 'CONNECTOR');

/**
 * 连接器类型键：详情 pane 手上只有市场物料行，没有 defs 列表，故取展示码 `{owner}/{type}` 尾段
 * （与 onDisableConnector、MarketPane.connectorTypeOf 的降级路径同一口径，不另立第二套推断）。
 */
const connectorType = computed<string | null>(() => {
  const tail = (item.value?.codeDisplay ?? '').split('/').pop();
  return tail && tail.length > 0 ? tail : null;
});

/* —— 实现页：def 行即 describe() 的落地形态（operations / configSchema / engine / verified 都在这一行） —— */

const connectorDef = ref<ConnectorDefVo | null>(null);
const connectorDefLoading = ref(false);
/** 拉过就不再重复拉（同 previewLoaded 的闩）；失败或无权限也置位，避免每次切页都打一次必失败的接口 */
const connectorDefLoaded = ref(false);

async function loadConnectorDef(): Promise<void> {
  if (connectorDefLoaded.value) {
    return;
  }
  connectorDefLoaded.value = true;
  const type = connectorType.value;
  // defs 端点带 @SaCheckPermission("databus:connector:list")：没权限就不发这个注定 403 的请求，直接落可读空态
  if (!type || !hasPermi('databus:connector:list')) {
    connectorDef.value = null;
    return;
  }
  connectorDefLoading.value = true;
  try {
    const { data } = await listConnectorDefs();
    const defs = data ?? [];
    const localId = item.value?.localResourceId;
    // 先按 localResourceId（连接器＝def 行 id）命中，退化到 type：同 type 被多人上架时 id 才是唯一判据
    connectorDef.value =
      (localId != null ? defs.find((d) => d.id != null && String(d.id) === String(localId)) : undefined) ??
      defs.find((d) => d.type === type) ??
      null;
  } catch {
    connectorDef.value = null; // 拦截器已提示
  } finally {
    connectorDefLoading.value = false;
  }
}

const connectorDefEmptyText = computed(() => {
  if (!connectorType.value) {
    return '缺连接器类型标识，无法定位实现清单';
  }
  if (!hasPermi('databus:connector:list')) {
    return '需要连接器查看权限（databus:connector:list）才能看实现清单';
  }
  // 零内置之后「本机没这个包」是常态而非故障（§2.6），文案直说怎么才能看到
  return '本机没有这个连接器的包（未上传或未安装），启用后即可看到它的操作与连接配置字段';
});

/* —— 运行时驱动页：取数、告警与空态都在 ConnectorRuntimePanel 内，本 pane 只管「何时该重取」 —— */

/**
 * 重挂序号：启停会改变装载态，旧结论不能当现状。
 * bump 一下换掉 ConnectorRuntimePanel 的 key 让它重挂重取；换物料由 key 里的 type 覆盖，不必走这里。
 */
const runtimeKey = ref(0);

function invalidateRuntime(): void {
  runtimeKey.value += 1;
}

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

watch(
  () => props.itemId,
  () => {
    // 物料切换（同 pane 复用）：实现预览状态归零，回到简介页
    activeTab.value = 'intro';
    preview.value = null;
    previewLoaded.value = false;
    openImplSections.value = ['script'];
    // 连接器两页同 pane 复用，闩与数据必须一起归零：否则切到第二个连接器会直接渲染上一个的清单
    // 运行时驱动不必在这里管：ConnectorRuntimePanel 的 key 带 type，换物料自然重挂重取
    connectorDef.value = null;
    connectorDefLoaded.value = false;
    fetchItem();
  },
  { immediate: true }
);

/* ---------------- 展示辅助 ---------------- */

const itemIcon = computed(() =>
  item.value?.resourceType === 'CHAIN'
    ? 'lucide:spline'
    : item.value?.resourceType === 'CONNECTOR'
      ? item.value?.icon || 'lucide:plug'
      : item.value?.icon || 'lucide:box'
);
const resourceLabel = computed(() =>
  item.value?.resourceType === 'CHAIN' ? '链路' : item.value?.resourceType === 'CONNECTOR' ? '连接器' : '组件'
);

/* ---------------- 权限判定（按权限串，admin 通配免检，对齐 MarketPane） ---------------- */

const userStore = useUserStore();
function hasPermi(perm: string): boolean {
  return userStore.permissions.some((p: string) => p === '*:*:*' || p === perm);
}
/** 连接器停用是治理动作（§15.7 defs 启停权限 databus:connector:edit） */
const canConnectorEdit = computed(() => hasPermi('databus:connector:edit'));

const statusMeta = computed(() => itemStatusMeta(item.value?.status as MarketItemStatus));

/* ---------------- 底部动作 ---------------- */

/** 作者点选：请求市场 tab 切到该作者作品 */
function onAuthor() {
  if (!item.value?.ownerCode) {
    return;
  }
  marketNavIntent.value = { kind: 'owner', ownerCode: item.value.ownerCode };
  emit('open-market');
}

/** 已上架：去物料管理 tab 的「我的上架」视角（治理动作全在那边） */
function onMine() {
  emit('open-manage');
}

/** 已装：打开本地副本 */
function onUse() {
  const it = item.value;
  // emit 只收 COMPONENT/CHAIN（连接器无本地资源可打开）
  if (!it || it.localResourceId == null || (it.resourceType !== 'COMPONENT' && it.resourceType !== 'CHAIN')) {
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
    const { data } = await installMarketItem(it.id, { directoryId: directoryId ?? null });
    // 链路安装展示级联复制/复用清单（decisions §十四-2）；组件保持一句话提示
    if (it.resourceType === 'CHAIN') {
      showChainInstallResult(data);
    } else {
      ElMessage.success(`已安装「${it.name}」，组件已共享注册到物料面板`);
    }
    installVisible.value = false;
    emit('installed');
    await fetchItem(); // 刷新 installed / localResourceId，底部按钮切「打开」
  } catch {
    /* 拦截器已提示 */
  } finally {
    installLoading.value = false;
  }
}

/* ---------------- 连接器动作（§15.3 安装＝enable 全局生效，无目录弹窗） ---------------- */

/** 启用（即安装）：后端 CONNECTOR 分支 enable def 行，目录参数被忽略 */
async function onInstallConnector() {
  const it = item.value;
  if (!it) {
    return;
  }
  installLoading.value = true;
  try {
    await installMarketItem(it.id, { directoryId: null });
    ElMessage.success(`已启用「${it.name}」，全局生效`);
    emit('installed'); // 复用安装成功语义：宿主刷市场数据与树
    await fetchItem(); // 刷新 installed，底部按钮切「停用/已启用」
    // 启用＝真装载，运行时驱动从这一刻才可能有数据；重挂面板让人看到的是装载后的现状
    invalidateRuntime();
  } catch {
    /* 拦截器已提示 */
  } finally {
    installLoading.value = false;
  }
}

/** 停用（治理动作，需 edit 权限）：挡新建连接，存量连接与数据保留 */
async function onDisableConnector() {
  const it = item.value;
  if (!it) {
    return;
  }
  // 详情页无 defs 列表，type 走展示码尾段兜底（对齐 MarketPane.connectorTypeOf 的降级路径）
  const type = connectorType.value;
  if (!type) {
    ElMessage.warning('未找到该连接器的类型标识，请先刷新重试');
    return;
  }
  try {
    await modal.confirm(`确认停用连接器「${it.name}」？停用后将挡新建连接，存量连接与数据保留。`);
  } catch {
    return;
  }
  try {
    await disableConnector(type);
    ElMessage.success('已停用');
    emit('installed'); // 复用语义：宿主重拉市场数据（installed 口径随 def 状态翻转）
    await fetchItem();
    // 停用＝卸载，驱动表必须跟着失效（实现清单是声明式内容，不随装载态变化，故不重取它）
    invalidateRuntime();
  } catch {
    /* 拦截器已提示 */
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
  /* 720px 对纯文本够用，但代码/JSON 太窄；统一放到 900px，代码区实际可读宽度提升约 1/4 */
  --mkti-max: 900px;
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

  /* 整页只留这一条滚动条，做窄做淡，避免和代码块里的滚动条叠成“一排导轨” */
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

/* 内部 tab：简介 / 实现（2026-10-24）。页签与正文同宽居中，正文沿用 .mkti__body 的滚动 */
.mkti__tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;

  :deep(.el-tabs__header) {
    flex-shrink: 0;
    width: 100%;
    max-width: var(--mkti-max);
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

/* ---------------- 实现页（2026-10-24 装前可看） ---------------- */

.mkti__impl-loading {
  min-height: 220px;
}

/* 规格信息一行带过：编码 · 版本 · 语言（不画框、不铺格子） */
.mkti__impl-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 2px 0 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.mkti__impl-meta-code {
  font-family: Menlo, Monaco, Consolas, monospace;
  color: var(--el-text-color-regular);
}

.mkti__impl-sep {
  color: var(--el-border-color);
}

.mkti__impl-hint {
  font-size: 11px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.mkti__impl-summary {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

/* 链路节点区标题行：与折叠标题同一套字形，右侧一个文字按钮 */
.mkti__impl-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 38px;
  margin-top: 2px;
}

/* 折叠面板：无外框、无分割线，标题只有一行文字 + 右侧箭头 */
.mkti__collapse {
  border: none;

  :deep(.el-collapse-item) {
    margin-bottom: 4px;
  }

  :deep(.el-collapse-item__header) {
    height: 38px;
    padding: 0;
    font-size: 13px;
    font-weight: 500;
    color: var(--el-text-color-primary);
    background: transparent;
    border: none;
  }

  :deep(.el-collapse-item__header:hover) {
    color: var(--el-color-primary);
  }

  :deep(.el-collapse-item__arrow) {
    color: var(--el-text-color-placeholder);
  }

  :deep(.el-collapse-item__wrap) {
    background: transparent;
    border: none;
  }

  :deep(.el-collapse-item__content) {
    padding: 4px 0 10px;
  }

  /* 代码块只留一层极浅描边，避免与外层容器叠框 */
  :deep(.java-code-editor),
  :deep(.json-code-editor) {
    border-color: var(--el-border-color-extra-light, #f2f3f5);
    border-radius: 8px;
  }
}

.mkti__collapse-title {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
}

/* 编排轨道：缩进由后端 depth 决定（行内 padding-left），圆点区分结构/业务 */
.mkti__node-rail {
  margin: 0;
  padding: 4px 0;
  list-style: none;
}

.mkti__node {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding-right: 10px;
  font-size: 13px;
  line-height: 1.5;
  border-radius: 0 6px 6px 0;
  transition: background 0.15s;

  &:hover {
    background: var(--el-fill-color-light, #f5f7fa);
  }

  &.is-structure {
    color: var(--el-text-color-secondary);

    .mkti__node-dot {
      background: var(--el-border-color);
    }

    .mkti__node-type {
      padding-left: 0;
      background: transparent;
    }
  }
}

.mkti__node-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  margin: 0 2px 0 4px;
  border-radius: 50%;
  background: var(--el-color-primary);
}

.mkti__node-type {
  flex-shrink: 0;
  padding: 0 6px;
  font-size: 11px;
  line-height: 18px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 4px;
}

.mkti__node-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------------- 连接器实现页（2026-10-30，§10.3） ---------------- */

/* jvm 档警示：底色由 el-alert 给，这里只管与上下文的间距（操作/配置字段两张表与运行时驱动页已抽成独立组件） */
.mkti__alert {
  margin: 4px 0 12px;
}

.mkti__alert-p {
  margin: 0 0 6px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-regular);

  &:last-child {
    margin-bottom: 0;
  }
}

/* verified 解释段复用 .mkti__impl-summary 的字形，只把它从「无外边距」里捞出来 */
.mkti__verified-tip {
  margin: 0 0 4px;
}
</style>