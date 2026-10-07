<!--
  组件台账详情抽屉（三态）：
  - SYSTEM 内置：注解事实源只读，看参数 schema 递归树 + 配置示例
  - OVERLAY 治理覆盖：治理列取 DB、契约取内置注解，可编辑/删除治理行
  - CUSTOM 库存脚本件：脚本工件版本 + 物化契约，可编辑/脚本维护
  - 停用 DB 行不在 /options（无 schema 富信息），给警示条并回落 db 契约列

  布局（2026-10-07 重构）：头部身份 + 来源/状态标签（三态说明进 hover 提示）+ 一句话描述；
  主体两个 Tab——「配置说明」（配置参数 / 配置示例 / 输入输出数据结构折叠）与
  「基本信息」（基本信息 / 外观与分类 / 备注与文档三个折叠分组，默认全展开，
  组内 el-descriptions 两列表格）。
  来源、状态、废弃说明全抽屉只出现一次（头部承载），不再在表格里重复。
-->
<template>
  <el-drawer
    v-model="visible"
    size="50%"
    resizable
    :close-on-click-modal="true"
    append-to-body
    destroy-on-close
    modal-class="databus-component-drawer"
    :title="title"
  >
    <div v-if="row" class="detail">
      <!-- 头部身份卡 -->
      <div class="detail-head">
        <span class="detail-icon" :style="iconStyle">
          <SvgIcon v-if="row.icon" :icon-class="row.icon" />
          <el-icon v-else><Box /></el-icon>
        </span>
        <div class="detail-head-main">
          <div class="detail-title-row">
            <div class="detail-title">{{ row.name }}</div>
            <el-tooltip :content="sourceTip" placement="top" :show-after="200">
              <el-tag :type="sourceTagType" size="small" effect="plain" class="detail-head-tag">
                {{ sourceText }}
              </el-tag>
            </el-tooltip>
            <el-tag
              v-if="statusTag"
              :type="statusTag.type"
              size="small"
              :effect="statusTag.effect"
              class="detail-head-tag"
            >
              {{ statusTag.text }}
            </el-tag>
          </div>
          <div class="detail-code">
            <span>{{ row.code }}</span>
            <el-button link size="small" :icon="CopyDocument" @click="copyCode" />
          </div>
          <p v-if="descriptionText" class="detail-head-desc" :title="descriptionText">{{ descriptionText }}</p>
        </div>
      </div>

      <!-- 异常警示（正常态不占位；三态释义收进来源 tag tooltip） -->
      <el-alert
        v-if="row.deprecated"
        type="warning"
        :closable="false"
        show-icon
        title="该组件已废弃"
        :description="row.deprecateNote || '废弃件在已发布链路仍可运行，但不建议在新链路使用。'"
        class="detail-alert"
      />
      <el-alert
        v-else-if="row.db && row.disabled"
        type="warning"
        :closable="false"
        show-icon
        :title="row.scripted ? '该库存脚本件已停用' : '该组件的定制配置已停用'"
        :description="
          row.scripted
            ? '停用后不进编辑器物料合流，已发布链路继续跑内存节点，但服务重启后不再注册；重新启用即恢复。'
            : '停用后不进编辑器物料合流，同码内置件恢复默认外观；重新启用即恢复。'
        "
        class="detail-alert"
      />

      <el-tabs v-model="activeTab" class="detail-tabs">
        <!-- Tab 1：配置说明（默认主角） -->
        <el-tab-pane label="配置说明" name="contract">
          <div class="detail-tab-pane">
            <div class="detail-section">
              <div class="detail-section-title">配置参数</div>
              <SchemaFieldTree v-if="fields.length" :fields="fields" />
              <el-empty
                v-else
                :description="row.source === 'SYSTEM' ? '该组件没有可配置的参数' : '尚未定义配置参数，编辑器中将直接用 JSON 填写'"
                :image-size="60"
              />
            </div>

            <div v-if="example" class="detail-section">
              <div class="detail-section-title">配置示例</div>
              <JsonCodeEditor :model-value="example" readonly height="280px" />
            </div>

            <el-collapse v-if="inputSchema || outputSchema" v-model="schemaCollapse" class="schema-collapse">
              <el-collapse-item title="输入 / 输出数据结构（高级）" name="schema">
                <div v-if="schemaCollapse.includes('schema')" class="schema-body">
                  <div v-if="inputSchema" class="detail-section">
                    <div class="detail-sub-title">输入数据结构</div>
                    <JsonCodeEditor :model-value="inputSchema" readonly height="240px" />
                  </div>
                  <div v-if="outputSchema" class="detail-section">
                    <div class="detail-sub-title">输出数据结构</div>
                    <JsonCodeEditor :model-value="outputSchema" readonly height="240px" />
                  </div>
                </div>
              </el-collapse-item>
            </el-collapse>
          </div>
        </el-tab-pane>

        <!-- Tab 2：基本信息（折叠分组，默认全展开） -->
        <el-tab-pane label="基本信息" name="governance">
          <el-collapse v-model="govCollapse" class="gov-collapse">
            <!-- 基本信息：执行体仅库存件显示；排序/表分类/创建时间仅 DB 行有 -->
            <el-collapse-item title="基本信息" name="base">
              <el-descriptions :column="2" border size="small" class="gov-desc">
                <el-descriptions-item v-if="row.db && row.scripted" label="执行体">
                  <el-tag type="success" size="small" effect="plain">
                    {{ row.db.scriptLang || 'java' }} · v{{ row.db.version ?? '-' }}
                  </el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="节点类型">
                  {{ nodeTypeLabel(rowNodeType) }}
                </el-descriptions-item>
                <el-descriptions-item label="配置方式">
                  {{ editorLabel(rowEditor) }}
                </el-descriptions-item>
                <el-descriptions-item v-if="row.db" label="排序">
                  {{ row.db.sort ?? 100 }}
                </el-descriptions-item>
                <el-descriptions-item v-if="row.db" label="表分类">
                  {{ categoryLabel(row.db.category) }}
                </el-descriptions-item>
                <el-descriptions-item v-if="row.db?.createTime" label="创建时间" :span="2">
                  {{ row.db.createTime }}
                </el-descriptions-item>
              </el-descriptions>
            </el-collapse-item>

            <!-- 外观与分类 -->
            <el-collapse-item title="外观与分类" name="look">
              <el-descriptions :column="2" border size="small" class="gov-desc">
                <el-descriptions-item label="面板分组">
                  {{ groupLabel(row.group) }}
                </el-descriptions-item>
                <el-descriptions-item label="短名">
                  {{ row.shortName || '-' }}
                </el-descriptions-item>
                <el-descriptions-item label="颜色">
                  <span v-if="row.color" class="detail-color">
                    <i class="detail-color__dot" :style="{ backgroundColor: row.color }" />
                    {{ row.color }}
                  </span>
                  <span v-else class="info-empty">-</span>
                </el-descriptions-item>
                <el-descriptions-item label="标签">
                  <template v-if="row.tags?.length">
                    <el-tag
                      v-for="t in row.tags"
                      :key="t"
                      size="small"
                      effect="plain"
                      class="detail-tag"
                    >
                      # {{ t }}
                    </el-tag>
                  </template>
                  <span v-else class="info-empty">-</span>
                </el-descriptions-item>
              </el-descriptions>
            </el-collapse-item>

            <!-- 备注与文档：描述已上移到头部，此处只留内部备注/文档链接 -->
            <el-collapse-item
              v-if="row.db?.remark || row.db?.docUrl"
              title="备注与文档"
              name="desc"
            >
              <el-descriptions :column="1" border size="small" class="gov-desc">
                <el-descriptions-item v-if="row.db?.remark" label="备注">
                  {{ row.db.remark }}
                </el-descriptions-item>
                <el-descriptions-item v-if="row.db?.docUrl" label="文档链接">
                  <el-link type="primary" :href="row.db.docUrl" target="_blank">
                    {{ row.db.docUrl }}
                  </el-link>
                </el-descriptions-item>
              </el-descriptions>
            </el-collapse-item>
          </el-collapse>
        </el-tab-pane>
      </el-tabs>
    </div>

    <template #footer>
      <div v-if="row?.db" class="detail-footer">
        <el-button
          v-hasPermi="['databus:component:remove']"
          type="danger"
          plain
          @click="emit('delete', row)"
        >
          删除
        </el-button>
        <div class="detail-footer-spacer" />
        <el-button @click="visible = false">关 闭</el-button>
        <el-button
          v-hasPermi="['databus:component:edit']"
          type="primary"
          @click="emit('edit', row)"
        >
          编 辑
        </el-button>
      </div>
      <div v-else class="detail-footer">
        <div class="detail-footer-spacer" />
        <el-button type="primary" @click="visible = false">关 闭</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Box, CopyDocument } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import SchemaFieldTree from './SchemaFieldTree.vue';
import JsonCodeEditor from '../../editor/components/common/JsonCodeEditor.vue';
import type { ComponentRegistryRow } from '../model/registry';
import {
  CATEGORY_OPTIONS,
  editorLabel,
  groupLabel,
  nodeTypeLabel,
  parseSchemaFields,
  prettyJson
} from '../model/labels';
import type { EditorKind, NodeTypeKind, PropSchema } from '@/api/databus/component/types';

const emit = defineEmits<{
  (e: 'edit', row: ComponentRegistryRow): void;
  (e: 'delete', row: ComponentRegistryRow): void;
}>();

const visible = ref(false);
const row = ref<ComponentRegistryRow | null>(null);

/** 主体 Tab：默认落在配置说明 */
const activeTab = ref<'contract' | 'governance'>('contract');
/** 高级契约 Schema 折叠面板：默认收起，展开才挂载 CodeMirror */
const schemaCollapse = ref<string[]>([]);
/** 基本信息折叠分组：默认全展开，用户可自行收起 */
const govCollapse = ref<string[]>(['base', 'look', 'desc']);

const title = computed(() => row.value?.name ?? '组件详情');

/** 三态来源文案/标签色 */
const sourceText = computed(() => {
  switch (row.value?.source) {
    case 'SYSTEM':
      return '内置';
    case 'OVERLAY':
      return '治理覆盖';
    case 'CUSTOM':
      return '库存脚本件';
    default:
      return '-';
  }
});

const sourceTagType = computed<'primary' | 'warning' | 'success'>(() => {
  if (row.value?.source === 'SYSTEM') {
    return 'primary';
  }
  return row.value?.source === 'OVERLAY' ? 'warning' : 'success';
});

/** 三态释义：正常态不占警示条，收进头部来源标签的 hover 提示 */
const sourceTip = computed(() => {
  switch (row.value?.source) {
    case 'SYSTEM':
      return '系统内置组件，内容只读：名称、参数和示例由程序内置定义；可以为它新建一条同名定制配置来修改外观，也可以脚本化改造成库存脚本件。';
    case 'OVERLAY':
      return '定制配置件：外观和分类取自平台配置，但有哪些配置参数仍由内置代码定义；脚本化后转为库存脚本件。';
    case 'CUSTOM':
      return '库存脚本件：完整的 Java 源码存在平台里，保存后即时编译生效；配置参数由脚本里的标记自动生成。';
    default:
      return '';
  }
});

/** 头部状态 tag：废弃 > 停用 > 启用；纯内置无 DB 行不显示（恒为生效态） */
const statusTag = computed<{ text: string; type: 'info' | 'success' | 'warning'; effect: 'plain' | 'dark' } | null>(() => {
  if (!row.value) {
    return null;
  }
  if (row.value.deprecated) {
    return { text: '废弃', type: 'warning', effect: 'dark' };
  }
  if (row.value.db) {
    return row.value.disabled
      ? { text: '停用', type: 'info', effect: 'plain' }
      : { text: '启用', type: 'success', effect: 'plain' };
  }
  return null;
});

/** 节点类型：option 契约缓存优先，停用行回落 db 契约列 */
const rowNodeType = computed<NodeTypeKind | null | undefined>(
  () => row.value?.option?.nodeType ?? row.value?.db?.nodeType
);

const rowEditor = computed<EditorKind | null | undefined>(
  () => row.value?.option?.editor ?? row.value?.db?.editor
);

/**
 * 参数字段：启用件读 option.schema（后端同构 JSON）；
 * 停用行没有 option，直接解析 db.paramSchema 契约缓存（{"fields":[...]}）。
 */
const fields = computed<PropSchema[]>(() => {
  const fromOption = row.value?.option?.schema?.fields;
  if (fromOption?.length) {
    return fromOption;
  }
  return parseSchemaFields(row.value?.db?.paramSchema) ?? [];
});

/** 配置示例：option 缓存优先，回落 db 列 */
const example = computed(() =>
  prettyJson(row.value?.option?.dataExample ?? row.value?.db?.dataExample)
);

/** 组件描述：优先内置 option 注解，回落 DB 治理列；头部一句话展示 */
const descriptionText = computed(
  () => row.value?.option?.description || row.value?.db?.description || ''
);

/** 输入/输出契约 Schema：仅 DB 行携带原始列 */
const inputSchema = computed(() => prettyJson(row.value?.db?.inputSchema));
const outputSchema = computed(() => prettyJson(row.value?.db?.outputSchema));

/** 旧五分类 code → 中文（查不到回落原值） */
function categoryLabel(raw?: string | null): string {
  if (!raw) {
    return '-';
  }
  return CATEGORY_OPTIONS.find((item) => item.value === raw)?.label ?? raw;
}

const iconStyle = computed(() => ({
  backgroundColor: row.value?.color || 'var(--el-color-primary)'
}));

function open(target: ComponentRegistryRow) {
  row.value = target;
  activeTab.value = 'contract';
  schemaCollapse.value = [];
  govCollapse.value = ['base', 'look', 'desc'];
  visible.value = true;
}

async function copyCode() {
  if (!row.value?.code) {
    return;
  }
  try {
    await navigator.clipboard.writeText(row.value.code);
    ElMessage.success(`已复制组件编码：${row.value.code}`);
  } catch {
    ElMessage.warning('复制失败，请手动选择文本复制');
  }
}

defineExpose({ open });
</script>

<style lang="scss" scoped>
.detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0 4px;
}

.detail-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.detail-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
  font-size: 22px;
}

.detail-head-main {
  flex: 1;
  min-width: 0;
}

.detail-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--el-text-color-primary, #1d2129);
}

.detail-head-tag {
  cursor: default;
}

.detail-code {
  display: flex;
  align-items: center;
  gap: 2px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 组件一句话描述：头部次行，最多两行，全文 hover 可见 */
.detail-head-desc {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--el-text-color-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.detail-alert {
  margin: 0;
}

.detail-tabs {
  // 抽屉内分栏，压缩 tab 条与正文的留白
  :deep(.el-tabs__header) {
    margin-bottom: 12px;
  }
}

.detail-tab-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-color {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
}

.detail-color__dot {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.detail-tag {
  margin-right: 4px;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-section-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--el-text-color-primary, #1d2129);
  padding-left: 8px;
  border-left: 3px solid var(--el-color-primary);
  line-height: 14px;
}

.detail-sub-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.schema-collapse {
  border-top: 1px solid var(--el-border-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);

  :deep(.el-collapse-item__header) {
    font-size: 13px;
    font-weight: 600;
  }

  :deep(.el-collapse-item__wrap),
  :deep(.el-collapse-item__header) {
    border-color: var(--el-border-color-lighter);
  }
}

.schema-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 4px;
}

/* 基本信息：折叠分组（默认全展开），内部 el-descriptions 两列表格 */
.gov-collapse {
  border-top: 1px solid var(--el-border-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);

  :deep(.el-collapse-item__header) {
    font-size: 13px;
    font-weight: 600;
  }

  :deep(.el-collapse-item__header),
  :deep(.el-collapse-item__wrap) {
    border-color: var(--el-border-color-lighter);
  }

  :deep(.el-collapse-item__content) {
    padding-bottom: 12px;
  }
}

/* 折叠组内的规整表格 */
.gov-desc {
  margin-top: 4px;

  :deep(.el-descriptions__label) {
    width: 96px;
    color: var(--el-text-color-secondary);
    font-weight: 400;
  }
}

.info-empty {
  color: var(--el-text-color-placeholder);
}

.detail-footer {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-footer-spacer {
  flex: 1;
}
</style>

<!--
  el-drawer teleport 到 body，scoped 样式不命中；靠 modal-class 限定作用域。
  原生 resizable 把手：8px 热区 + 3px 全高隐线（悬停才整根变蓝），
  这里把 ::before 改成抽屉左缘居中的常驻胶囊握把，悬停/拖拽时变主题色并拉长。
-->
<style lang="scss">
.databus-component-drawer {
  .el-drawer.rtl > .el-drawer__dragger {
    width: 12px;
  }

  .el-drawer.rtl > .el-drawer__dragger::before {
    top: 50%;
    bottom: auto;
    left: 50%;
    width: 4px;
    height: 56px;
    border-radius: 999px;
    background-color: var(--el-border-color-darker, #c0c4cc);
    transform: translate(-50%, -50%);
    transition:
      background-color 0.2s,
      height 0.2s;
  }

  .el-drawer.rtl > .el-drawer__dragger:hover::before,
  .el-drawer.rtl.is-dragging > .el-drawer__dragger::before {
    height: 72px;
    background-color: var(--el-color-primary);
  }
}
</style>
