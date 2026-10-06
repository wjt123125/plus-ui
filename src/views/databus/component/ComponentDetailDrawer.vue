<!--
  组件台账详情抽屉（三态）：
  - SYSTEM 内置：注解事实源只读，看参数 schema 递归树 + 配置示例
  - OVERLAY 治理覆盖：治理列取 DB、契约取内置注解，可编辑/删除治理行
  - CUSTOM 库存脚本件：脚本工件版本 + 物化契约，可编辑/脚本维护
  - 停用 DB 行不在 /options（无 schema 富信息），给警示条并回落 db 契约列
-->
<template>
  <el-drawer
    v-model="visible"
    size="800px"
    resizable
    close-on-click-modal
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
          <div class="detail-title">{{ row.name }}</div>
          <div class="detail-code">
            <span>{{ row.code }}</span>
            <el-button link size="small" :icon="CopyDocument" @click="copyCode" />
          </div>
        </div>
      </div>

      <!-- 状态警示 -->
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
        :title="row.scripted ? '该库存脚本件已停用' : '该治理行已停用'"
        :description="
          row.scripted
            ? '停用后不进编辑器物料合流，已发布链路继续跑内存节点，但服务重启后不再注册；重新启用即恢复。'
            : '停用后不进编辑器物料合流，同码内置件恢复默认外观；重新启用即恢复。'
        "
        class="detail-alert"
      />
      <el-alert
        v-else-if="row.source === 'OVERLAY'"
        type="info"
        :closable="false"
        show-icon
        title="治理覆盖件"
        description="外观/编目取 DB 治理列，参数契约仍由内置代码注解释义；脚本化后转为库存件，契约改由脚本物化。"
        class="detail-alert"
      />
      <el-alert
        v-else-if="row.source === 'SYSTEM'"
        type="info"
        :closable="false"
        show-icon
        title="内置组件，只读"
        description="名称、参数与示例由后端代码注解生成；可新增同码治理行覆盖外观，或脚本化接管为库存件。"
        class="detail-alert"
      />
      <el-alert
        v-else-if="row.scripted"
        type="success"
        :closable="false"
        show-icon
        title="库存脚本件"
        description="完整 Java 源码存 DB，保存即编译热更；下方参数契约由脚本注记物化，不随治理编辑改变。"
        class="detail-alert"
      />

      <!-- 基本信息 -->
      <el-descriptions :column="2" border size="small" class="detail-desc">
        <el-descriptions-item label="来源">
          <el-tag :type="sourceTagType" size="small" effect="plain">{{ sourceText }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item v-if="row.scripted" label="执行体">
          <el-tag type="success" size="small" effect="plain">
            {{ row.db?.scriptLang || 'java' }} · v{{ row.db?.version ?? '-' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="面板分组">{{ groupLabel(row.group) }}</el-descriptions-item>
        <el-descriptions-item label="节点类型">{{ nodeTypeLabel(rowNodeType) }}</el-descriptions-item>
        <el-descriptions-item label="配置形态">{{ editorLabel(rowEditor) }}</el-descriptions-item>
        <el-descriptions-item v-if="row.shortName" label="短名">{{ row.shortName }}</el-descriptions-item>
        <el-descriptions-item v-if="row.db" label="排序">{{ row.db.sort ?? 100 }}</el-descriptions-item>
        <el-descriptions-item v-if="row.color" label="颜色">
          <span class="detail-color">
            <i class="detail-color__dot" :style="{ backgroundColor: row.color }" />
            {{ row.color }}
          </span>
        </el-descriptions-item>
        <el-descriptions-item v-if="row.db" label="表分类">{{ row.db.category || '-' }}</el-descriptions-item>
        <el-descriptions-item v-if="row.tags?.length" label="标签" :span="2">
          <el-tag
            v-for="t in row.tags"
            :key="t"
            size="small"
            effect="plain"
            class="detail-tag"
          >
            # {{ t }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item v-if="row.db" label="状态">
          <el-tag :type="row.db.status === '1' ? 'info' : 'success'" size="small" effect="plain">
            {{ row.db.status === '1' ? '停用' : '启用' }}
          </el-tag>
          <el-tag v-if="row.deprecated" type="warning" size="small" effect="dark" class="detail-tag">
            废弃
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item v-if="row.db?.createTime" label="创建时间">{{ row.db.createTime }}</el-descriptions-item>
        <el-descriptions-item v-if="row.deprecateNote" label="废弃说明" :span="2">
          {{ row.deprecateNote }}
        </el-descriptions-item>
        <el-descriptions-item v-if="row.db?.docUrl" label="文档链接" :span="2">
          <el-link type="primary" :href="row.db.docUrl" target="_blank">{{ row.db.docUrl }}</el-link>
        </el-descriptions-item>
        <el-descriptions-item v-if="row.option?.description || row.db?.description" label="描述" :span="2">
          {{ row.option?.description || row.db?.description }}
        </el-descriptions-item>
        <el-descriptions-item v-if="row.db?.remark" label="备注" :span="2">{{ row.db.remark }}</el-descriptions-item>
      </el-descriptions>

      <!-- 参数 schema -->
      <div class="detail-section">
        <div class="detail-section-title">参数配置</div>
        <SchemaFieldTree v-if="fields.length" :fields="fields" />
        <el-empty
          v-else
          :description="row.source === 'SYSTEM' ? '该组件无配置参数（脚本/骨架件）' : '未配置 paramSchema，编辑器回退 JSON 高级模式'"
          :image-size="60"
        />
      </div>

      <!-- 配置示例 -->
      <div v-if="example" class="detail-section">
        <div class="detail-section-title">配置示例</div>
        <pre class="detail-json">{{ example }}</pre>
      </div>

      <!-- 自定义件原始 schema -->
      <template v-if="row.db">
        <div v-if="prettyJson(row.db.inputSchema)" class="detail-section">
          <div class="detail-section-title">输入 Schema</div>
          <pre class="detail-json">{{ prettyJson(row.db.inputSchema) }}</pre>
        </div>
        <div v-if="prettyJson(row.db.outputSchema)" class="detail-section">
          <div class="detail-section-title">输出 Schema</div>
          <pre class="detail-json">{{ prettyJson(row.db.outputSchema) }}</pre>
        </div>
      </template>
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
import type { ComponentRegistryRow } from './registry';
import {
  editorLabel,
  groupLabel,
  nodeTypeLabel,
  parseSchemaFields,
  prettyJson
} from './component-labels';
import type { EditorKind, NodeTypeKind, PropSchema } from '@/api/databus/component/types';

const emit = defineEmits<{
  (e: 'edit', row: ComponentRegistryRow): void;
  (e: 'delete', row: ComponentRegistryRow): void;
}>();

const visible = ref(false);
const row = ref<ComponentRegistryRow | null>(null);

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

const iconStyle = computed(() => ({
  backgroundColor: row.value?.color || 'var(--el-color-primary)'
}));

function open(target: ComponentRegistryRow) {
  row.value = target;
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

.detail-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--el-text-color-primary, #1d2129);
}

.detail-code {
  display: flex;
  align-items: center;
  gap: 2px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.detail-alert {
  margin: 0;
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

.detail-json {
  margin: 0;
  padding: 10px 12px;
  background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 8px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--el-text-color-regular, #363b41);
  max-height: 320px;
  overflow: auto;
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
