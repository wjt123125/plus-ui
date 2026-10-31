<template>
  <div class="crp">
    <div v-if="loading" v-loading="true" class="crp__loading" />
    <template v-else>
      <!-- 告警只留一句结论；「为什么会出现 PLATFORM、会造成什么」收进 hover 提示，
           免得四行正文把下面的驱动表压到折叠线以下 -->
      <el-alert
        v-if="hasPlatformDriver"
        class="crp__alert"
        type="warning"
        :closable="false"
        show-icon
      >
        <template #title>
          <span class="crp__alert-title">
            <span>连接器包内没有这个驱动类，实际用的是平台自带的那份</span>
            <InfoHint
              :title="platformHint.title"
              :items="platformHint.items"
              placement="bottom-start"
              :width="360"
            />
          </span>
        </template>
      </el-alert>

      <!-- 连接器本体是否装载看这一行：有值＝该类型已从包加载（后端只有 registry 里注册过才填），空＝没装载 -->
      <div class="crp__meta">
        <span>连接器加载器</span>
        <span class="crp__meta-code">{{ info?.classLoader || '未装载' }}</span>
      </div>

      <el-table v-if="drivers.length" :data="drivers" size="small" border>
        <!-- 首列照后端行键 type 收（不是 dbType）：对 JDBC 连接器它就是库种，前端不另造字段名 -->
        <el-table-column label="类型" prop="type" width="140" show-overflow-tooltip />
        <el-table-column label="驱动类" prop="driverClass" min-width="200" show-overflow-tooltip />
        <el-table-column label="版本" min-width="120">
          <template #default="{ row }">{{ row.version || '—' }}</template>
        </el-table-column>
        <el-table-column label="生效来源" width="96" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.loadedFrom === 'PLUGIN'" size="small" type="success" effect="light">包内</el-tag>
            <el-tag v-else-if="row.loadedFrom === 'PLATFORM'" size="small" type="warning" effect="light">平台</el-tag>
            <!-- SPI 声明了但类没加载上＝包打漏了驱动，鼠标停上去看后端给的原因，不另开一列 -->
            <span v-else class="crp__fail" :title="row.error || '驱动类加载失败'">加载失败</span>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else :description="emptyText" :image-size="72" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getConnectorRuntimeInfo } from '@/api/databus/connector';
import type { ConnectorRuntimeDriver, ConnectorRuntimeInfo } from '@/api/databus/connector/types';
import { useUserStore } from '@/store/modules/user';
import InfoHint from './InfoHint.vue';

defineOptions({ name: 'ConnectorRuntimePanel' });

const props = defineProps<{
  /** 连接器类型键 */
  type: string;
  /** 连接器没在跑时后端给的人话原因；有值时空态照实说取不到，不再猜「未启用 / 不是 JDBC」 */
  loadProblem?: string | null;
}>();

/* 权限判定按权限串（admin 通配免检），与 MarketPane / MarketItemPane 同口径 */
const userStore = useUserStore();
function hasPermi(perm: string): boolean {
  return userStore.permissions.some((p: string) => p === '*:*:*' || p === perm);
}

const info = ref<ConnectorRuntimeInfo | null>(null);
const loading = ref(false);
/** 失败标记：区分「确实没驱动」与「拿不到数据」，两者空态文案不同，混为一谈会误导排查方向 */
const failed = ref(false);

const drivers = computed<ConnectorRuntimeDriver[]>(() => info.value?.drivers ?? []);
/** 任何一行 PLATFORM 都要黄色告警（§4.2.1）：包里的驱动没用上，跑的是平台自带那份 */
const hasPlatformDriver = computed(() => drivers.value.some((d) => d.loadedFrom === 'PLATFORM'));

/**
 * PLATFORM 告警的解释（hover 提示）。
 * 判定依据是 PluginManager#collectDrivers：按「装载该驱动类的类加载器」分——等于插件加载器＝包内，否则平台。
 * PluginClassLoader 是 child-first（包内 lib/ 优先，找不到才委派父级），所以走到平台只有一种可能：
 * 包的 SPI 声明了这个驱动类，但包的 lib/ 里没有这个类，只能退回用平台自带的。
 */
const platformHint = {
  title: '为什么会出现这个警告',
  items: [
    { label: '怎么判的', text: '按装载这个驱动类的类加载器分：由连接器包的 PluginClassLoader 装载＝「包内」，其余＝「平台」。' },
    { label: '为什么是平台', text: '连接器包的 services 清单里写了这个驱动，但包的 lib/ 目录里没有这个类，加载时只能落到平台已有的类上。' },
    { label: '影响', text: '这个驱动的版本随平台走，跟连接器包版本无关；新包把驱动 jar 放进 lib/ 之后，这一行才会变成「包内」。' }
  ]
};

const emptyText = computed(() => {
  if (!props.type) {
    return '缺连接器类型标识，无法查询运行时驱动';
  }
  if (!hasPermi('databus:connector:list')) {
    return '需要连接器查看权限（databus:connector:list）才能查询运行时驱动';
  }
  if (failed.value) {
    return '运行时驱动信息获取失败，请稍后重试';
  }
  if (props.loadProblem) {
    return `连接器没在跑，驱动清单取不到：${props.loadProblem}`;
  }
  return '暂无驱动数据：连接器未装载（未启用），或它不是 JDBC 类（包内没有 java.sql.Driver 声明）';
});

/**
 * 挂载即取一次。宿主用 `:key` 换实例来强制重取（启停会改装载态，旧结论不能当现状），
 * 本组件自己不设闩：el-tab-pane lazy 只会挂一次，重取语义交给宿主更直白。
 */
onMounted(async () => {
  if (!props.type || !hasPermi('databus:connector:list')) {
    return;
  }
  loading.value = true;
  failed.value = false;
  try {
    const { data } = await getConnectorRuntimeInfo(props.type);
    info.value = data ?? null;
  } catch {
    info.value = null; // 拦截器已提示；落空态，不白屏
    failed.value = true;
  } finally {
    loading.value = false;
  }
});
</script>

<style lang="scss" scoped>
.crp__loading {
  min-height: 220px;
}

/* 规格信息一行带过：加载器（不画框、不铺格子） */
.crp__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 2px 0 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.crp__meta-code {
  font-family: Menlo, Monaco, Consolas, monospace;
  color: var(--el-text-color-regular);
}

/* PLATFORM 告警：底色由 el-alert 给，这里只管与上下文的间距与标题行排布 */
.crp__alert {
  margin: 4px 0 12px;
}

/* 标题行内嵌触发图标：图标继承告警色，悬停变主色（默认次级色在黄底上太弱） */
.crp__alert-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;

  :deep(.ih__icon) {
    color: var(--el-color-warning);
  }
}

/* 加载失败行不用 el-tag：它会读起来像一个正常状态；红字 + 虚下划线暗示原因可悬停查看 */
.crp__fail {
  font-size: 12px;
  color: var(--el-color-danger);
  cursor: help;
  border-bottom: 1px dashed var(--el-color-danger-light-5);
}
</style>
