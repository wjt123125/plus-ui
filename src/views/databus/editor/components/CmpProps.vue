<!-- 属性面板：直接读写 ElNode 模型树，不回写画布 data -->
<template>
  <div class="cmp-props">
    <div v-if="!node" class="cmp-props__empty">
      <el-empty description="选中画布节点后配置参数" :image-size="80" />
    </div>

    <template v-else>
      <div class="cmp-props__header">
        <span class="cmp-props__title">
          <span class="cmp-props__dot" :style="{ backgroundColor: node.data.color }" />
          {{ headerLabel }}
        </span>
        <el-tag v-if="node.data.virtual" size="small" type="info">虚拟节点</el-tag>
        <el-tag v-else-if="isJunction" size="small" type="info">汇合点</el-tag>
        <el-tag v-else-if="isPlaceholder" size="small" type="info">空槽</el-tag>
        <el-tag v-else-if="node.data.operator" size="small" type="warning">算子</el-tag>
      </div>

      <!-- 节点标题：业务叶子/条件件/算子可编辑；留空时 placeholder 显组件 label -->
      <el-form
        v-if="canEditTitle"
        label-position="top"
        size="small"
        class="cmp-props__title-form"
      >
        <el-form-item label="节点标题">
          <el-input
            v-model="titleInput"
            :placeholder="defaultTitleText"
            @change="onTitleChange"
          >
            <template #suffix>
              <el-icon
                v-if="hasCustomTitle"
                class="cmp-props__title-reset"
                title="恢复默认命名"
                @click="resetTitle"
              >
                <Refresh />
              </el-icon>
            </template>
          </el-input>
          <div class="cmp-props__hint">留空时显示组件 label；自定义后不随配置变化</div>
        </el-form-item>
      </el-form>

      <el-alert
        v-if="node.data.virtual"
        :title="virtualHint"
        type="info"
        :closable="false"
        show-icon
      />

      <!-- junction/placeholder 不可编辑 -->
      <div v-else-if="isJunction || isPlaceholder" class="cmp-props__hint-box">
        <span v-if="isJunction">汇合锚点是分支结构自动产生的虚拟节点，不可单独编辑。</span>
        <span v-else>拖入业务组件可替换此空槽。</span>
      </div>

      <!-- 条件菱形：未挂条件件时按算子类型选择对应条件组件，已挂则编辑条件件本身 -->
      <el-form
        v-else-if="node.data.isCondition && condPickDefs.length > 0 && !hasCondition"
        label-position="top"
        size="small"
        class="cmp-props__form"
      >
        <el-form-item v-if="opNode?.type === 'SWITCH'" label="分支 (case)">
          <div class="cmp-props__cases">
            <div v-for="(name, i) in caseNames" :key="i" class="cmp-props__case-row">
              <el-input
                :model-value="name"
                size="small"
                placeholder="case 名（路由按此名命中）"
                @change="(v: string) => onCaseNameChange(i, v)"
              />
              <el-button :icon="Delete" size="small" text :disabled="caseNames.length <= 1" @click="removeCase(i)" />
            </div>
            <el-button size="small" :icon="Plus" @click="addCase">添加分支</el-button>
          </div>
        </el-form-item>
        <el-form-item :label="`${opNode?.type} 条件组件`">
          <el-select
            :model-value="''"
            placeholder="选择条件组件"
            style="width: 100%"
            @change="onPickCondition"
          >
            <el-option
              v-for="d in condPickDefs"
              :key="d.type"
              :label="d.label"
              :value="d.type"
            >
              <span>{{ d.label }}</span>
              <span class="cmp-props__opt-desc">{{ d.desc }}</span>
            </el-option>
          </el-select>
          <div class="cmp-props__hint">
            {{ conditionSlotHint }}
          </div>
        </el-form-item>
      </el-form>

      <!-- 普通算子网关（WHEN/CATCH/AND/OR/NOT/CHAIN）：只编辑 tag -->
      <el-form
        v-else-if="node.data.operator"
        label-position="top"
        size="small"
        class="cmp-props__form"
      >
        <!-- SWITCH cases 管理（condition 网关由 condition 叶子充当的情形） -->
        <el-form-item v-if="needsCasesEdit" label="分支 (case)">
          <div class="cmp-props__cases">
            <div v-for="(name, i) in caseNames" :key="i" class="cmp-props__case-row">
              <el-input
                :model-value="name"
                size="small"
                placeholder="case 名（路由按此名命中）"
                @change="(v: string) => onCaseNameChange(i, v)"
              />
              <el-button :icon="Delete" size="small" text :disabled="caseNames.length <= 1" @click="removeCase(i)" />
            </div>
            <el-button size="small" :icon="Plus" @click="addCase">添加分支</el-button>
          </div>
        </el-form-item>
        <el-form-item label="标签 tag">
          <el-input
            v-model="tag"
            placeholder="可选，对应 EL 的 .tag(&quot;x&quot;)"
            clearable
            @change="onOperatorTagChange"
          />
        </el-form-item>
      </el-form>

      <!-- forLoop / iteratorLoop / switchRoute：结构化小表单 + 数据空间 -->
      <el-form v-else-if="structuredCode" label-position="top" size="small" class="cmp-props__form">
        <el-form-item v-if="isConditionLeaf" :label="`${opNode?.type ?? ''} 条件组件`.trim()">
          <el-tag size="small" type="warning">{{ leafDef?.label ?? elNode?.componentCode }}</el-tag>
          <el-button size="small" text type="primary" @click="openReplaceCondition">更换条件组件</el-button>
        </el-form-item>
        <el-form-item label="数据空间" required :error="spaceError || undefined">
          <el-input
            v-model="dataSpace"
            placeholder="如 forLoop1（字母开头，字母数字下划线）"
            clearable
            @change="onDataSpaceChange"
          />
          <div class="cmp-props__hint">
            组件产出挂在 $.{{ dataSpace || '数据空间名' }} 下；画布内唯一，改名会联动更新引用
          </div>
        </el-form-item>

        <!-- forLoop：循环次数 + 自定义下标名 -->
        <template v-if="structuredCode === 'forLoop'">
          <el-form-item label="循环次数 count">
            <el-input
              v-model="loopForm.count"
              placeholder="整数（如 3）或次数路径（如 $.request.total）"
              @change="commitLoopForm"
            />
            <div class="cmp-props__hint">循环从 0 计数；0 表示循环体零次执行</div>
          </el-form-item>
          <el-form-item label="下标变量名 indexVar">
            <el-input
              v-model="loopForm.indexVar"
              placeholder="留空默认 $i；嵌套循环第二层默认 $j、第三层 $k"
              @change="commitLoopForm"
            />
            <div class="cmp-props__hint">字母开头，仅含字母数字下划线；体内用 ${'$'}{{ loopForm.indexVar.trim() || 'i' }} 引用当前轮下标</div>
          </el-form-item>
        </template>

        <!-- iteratorLoop：数据源路径 + 自定义下标名 -->
        <template v-else-if="structuredCode === 'iteratorLoop'">
          <el-form-item label="数据源 source">
            <el-input
              v-model="loopForm.source"
              placeholder="数组/集合路径，如 $.request.items"
              @change="commitLoopForm"
            />
            <div class="cmp-props__hint">值为 null 按空集合处理（0 轮）；路径中可用外层下标（如 $.groups[$i].users）</div>
          </el-form-item>
          <el-form-item label="下标变量名 indexVar">
            <el-input
              v-model="loopForm.indexVar"
              placeholder="留空默认 $i；嵌套循环第二层默认 $j、第三层 $k"
              @change="commitLoopForm"
            />
            <div class="cmp-props__hint">字母开头，仅含字母数字下划线；体内用 ${'$'}{{ loopForm.indexVar.trim() || 'i' }} 引用当前轮下标</div>
          </el-form-item>
        </template>

        <!-- switchRoute：判断值路径 + 值→分支映射 -->
        <template v-else-if="structuredCode === 'switchRoute'">
          <el-form-item v-if="needsCasesEdit" label="分支 (case)">
            <div class="cmp-props__cases">
              <div v-for="(name, i) in caseNames" :key="i" class="cmp-props__case-row">
                <el-input
                  :model-value="name"
                  size="small"
                  placeholder="case 名（路由按此名命中）"
                  @change="(v: string) => onCaseNameChange(i, v)"
                />
                <el-button :icon="Delete" size="small" text :disabled="caseNames.length <= 1" @click="removeCase(i)" />
              </div>
              <el-button size="small" :icon="Plus" @click="addCase">添加分支</el-button>
            </div>
          </el-form-item>
          <el-form-item label="判断值路径 source">
            <el-input
              v-model="loopForm.source"
              placeholder="如 $.request.type"
              @change="commitLoopForm"
            />
            <div class="cmp-props__hint">读出实际值后按下方顺序逐条匹配，命中第一条即跳转；全不命中执行报错（暂不支持 DEFAULT）</div>
          </el-form-item>
          <el-form-item label="值 → 分支 cases">
            <div class="cmp-props__cases">
              <div v-for="(row, i) in loopForm.cases" :key="i" class="cmp-props__case-mapping-row">
                <el-input
                  v-model="row.value"
                  size="small"
                  placeholder="值：常量或 $.路径"
                  @change="commitLoopForm"
                />
                <el-select
                  v-model="row.target"
                  size="small"
                  filterable
                  allow-create
                  default-first-option
                  placeholder="目标 case 名"
                  @change="commitLoopForm"
                >
                  <el-option v-for="name in caseNames" :key="name" :label="name" :value="name" />
                </el-select>
                <el-button
                  :icon="Delete"
                  size="small"
                  text
                  :disabled="loopForm.cases.length <= 1"
                  @click="removeRouteCase(i)"
                />
              </div>
              <el-button size="small" :icon="Plus" @click="addRouteCase">添加映射</el-button>
            </div>
            <div class="cmp-props__hint">数字按数值匹配（200 与 "200" 相等）；target 必须与上方某个 case 名一致</div>
          </el-form-item>
        </template>
      </el-form>

      <!-- 其他业务组件 / 已挂载的条件件：数据空间 + 配置 JSON -->
      <el-form v-else-if="!isScriptLeaf" label-position="top" size="small" class="cmp-props__form">
        <el-form-item v-if="isConditionLeaf" :label="`${opNode?.type ?? ''} 条件组件`.trim()">
          <el-tag size="small" type="warning">{{ leafDef?.label ?? elNode?.componentCode }}</el-tag>
          <el-button size="small" text type="primary" @click="openReplaceCondition">更换条件组件</el-button>
        </el-form-item>
        <el-form-item label="数据空间" required :error="spaceError || undefined">
          <el-input
            v-model="dataSpace"
            placeholder="如 httpRequest1（字母开头，字母数字下划线）"
            clearable
            @change="onDataSpaceChange"
          />
          <div class="cmp-props__hint">
            组件产出挂在 $.{{ dataSpace || '数据空间名' }} 下；画布内唯一，改名会联动更新引用
          </div>
        </el-form-item>
        <el-form-item label="组件配置 data（JSON）">
          <JsonCodeEditor
            v-model="dataStr"
            :placeholder="dataHint"
            height="280px"
            @blur="onDataChange"
          />
        </el-form-item>
      </el-form>

      <!-- 脚本节点（script/booleanScript）专用编辑器：数据空间 + language 下拉 + 脚本文本 -->
      <el-form v-else label-position="top" size="small" class="cmp-props__form">
        <el-form-item v-if="isConditionLeaf" :label="`${opNode?.type ?? ''} 条件组件`.trim()">
          <el-tag size="small" type="warning">{{ leafDef?.label ?? elNode?.componentCode }}</el-tag>
          <el-button size="small" text type="primary" @click="openReplaceCondition">更换条件组件</el-button>
        </el-form-item>
        <el-form-item label="数据空间" required :error="spaceError || undefined">
          <el-input
            v-model="dataSpace"
            placeholder="如 script1（字母开头，字母数字下划线）"
            clearable
            @change="onDataSpaceChange"
          />
          <div class="cmp-props__hint">
            脚本 nodeId 即数据空间名（画布唯一）；脚本可通过 databusContext.save('$.{{ dataSpace || '数据空间名' }}.xxx', value) 写出
          </div>
        </el-form-item>
        <el-form-item label="语言 language">
          <el-select
            v-model="scriptLanguage"
            placeholder="无可用引擎时手填 groovy"
            filterable
            allow-create
            default-first-option
            style="width: 100%"
            @change="onScriptFieldChange"
          >
            <el-option
              v-for="lang in scriptEngines"
              :key="lang"
              :label="lang"
              :value="lang"
            />
          </el-select>
          <div v-if="scriptEngines.length === 0" class="cmp-props__hint">
            后端未装任何脚本引擎 jar，可手填语言名（如 groovy）但试运行会报错
          </div>
        </el-form-item>
        <el-form-item label="脚本 script">
          <el-input
            v-model="scriptText"
            type="textarea"
            :rows="10"
            placeholder="def v = databusContext.read('$.request.code'); databusContext.save('$.script1.out', v)"
            @change="onScriptFieldChange"
          />
          <div class="cmp-props__hint">
            Groovy 语法；布尔脚本必须 return true/false；可直接调任意 Java/hutool 类
          </div>
        </el-form-item>
      </el-form>

      <div v-if="!isJunction && !isPlaceholder" class="cmp-props__footer">
        <el-button size="small" type="danger" plain @click="emit('delete', node.id)">删除节点</el-button>
      </div>
    </template>

    <!-- 更换条件组件弹层（候选随所属算子变化：IF/WHILE→布尔物料，循环/SWITCH→专属控制组件） -->
    <el-dialog
      v-model="replaceDialogVisible"
      title="更换条件组件"
      width="360px"
      append-to-body
    >
      <el-radio-group v-model="pendingConditionType" class="cmp-props__radio-col">
        <el-radio
          v-for="d in condPickDefs"
          :key="d.type"
          :value="d.type"
          style="display: flex; margin: 6px 0"
        >
          <span>{{ d.label }}</span>
          <span class="cmp-props__opt-desc">{{ d.desc }}</span>
        </el-radio>
      </el-radio-group>
      <template #footer>
        <el-button @click="replaceDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmReplaceCondition">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { Delete, Plus, Refresh } from '@element-plus/icons-vue';
import type { Node } from '@vue-flow/core';
import {
  ElAlert,
  ElButton,
  ElDialog,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElIcon,
  ElInput,
  ElMessage,
  ElOption,
  ElRadio,
  ElRadioGroup,
  ElSelect,
  ElTag
} from 'element-plus';
import { listScriptEngines } from '@/api/databus/script';
import { CMP_DEFS, getDef, type CmpDef } from '../cmp-defs';
import {
  useElTreeModelInject,
  type CmpNodeData,
  type ElNode
} from '../composables/useElTreeModel';
import { useCanvasController } from '../composables/useCanvasController';
import JsonCodeEditor from './JsonCodeEditor.vue';

const props = defineProps<{
  node: Node<CmpNodeData> | null;
}>();

const emit = defineEmits<{
  (e: 'delete', id: string): void;
  (e: 'data-change'): void;
}>();

const treeModel = useElTreeModelInject();
const ctrl = useCanvasController();

/**
 * 各算子条件槽可挂的条件物料（与 useCanvasController 的 CONDITION_SLOT_RULES 同源口径）。
 * IF/WHILE 挂布尔条件件；FOR/ITERATOR/SWITCH 各挂专属控制组件。
 */
const CONDITION_SLOT_TYPES: Record<string, string[]> = {
  IF: CMP_DEFS.filter((d) => d.lfNodeType === 'NodeBooleanComponent').map((d) => d.type),
  WHILE: CMP_DEFS.filter((d) => d.lfNodeType === 'NodeBooleanComponent').map((d) => d.type),
  FOR: ['forLoop'],
  ITERATOR: ['iteratorLoop'],
  SWITCH: ['switchRoute']
};

/** 条件槽选择列表/更换弹层的候选物料（按当前所属算子过滤） */
const condPickDefs = computed<CmpDef[]>(() =>
  (CONDITION_SLOT_TYPES[opNode.value?.type ?? ''] ?? [])
    .map((t) => getDef(t))
    .filter((d): d is CmpDef => !!d)
);

/** 条件件选择框下方的说明文案 */
const CONDITION_SLOT_HINTS: Record<string, string> = {
  IF: '条件组件为布尔组件，运行时返回真/假决定走哪个分支',
  WHILE: '条件组件为布尔组件，运行时返回真/假决定是否继续循环',
  FOR: '计数组件返回循环次数；循环体内用 $i 引用当前轮下标（0 基）',
  ITERATOR: '迭代组件返回数组/集合的迭代器；体内用 $i 引用当前轮下标（0 基）',
  SWITCH: '路由组件读取判断值，按 cases 配置匹配 case 名跳转；分支名在上方维护'
};
const conditionSlotHint = computed(
  () => CONDITION_SLOT_HINTS[opNode.value?.type ?? ''] ?? ''
);

/** 各物料配置 JSON 的示例占位文案 */
const DATA_HINTS: Record<string, string> = {
  httpRequest: '{"method":"POST","url":"http://localhost:8080/api/login","headers":{"X-Tenant":"default"},"query":{"ids":["$.id1","$.id2"]},"bodyType":"json","body":{"username":"admin","password":"$.pwd"},"rawContentType":"text/plain","auth":{"type":"bearer","token":"$.login.token"},"timeoutMs":10000,"failOnHttpError":true,"responseCharset":"UTF-8","responseHeaders":["X-Total-Count"],"mappings":[{"field":"bizCode","path":"$.code","required":true}]}',
  condition: '{"path":"$.httpRequest1.response.code","op":"eq","value":200}',
  setValue: '{"path":"$.setValue1.demo","value":"常量 或 $.入参路径"}',
  fieldMap: '{"mappings":[{"from":"$.httpRequest1.response.code","to":"$.fieldMap1.code","type":"int"},{"from":"$.httpRequest1.response.data[*].NAME","to":"$.fieldMap1.items[*].name","type":"string"}]}',
  dataPatch: '{"target":"$.boQuery1.records[*]","patch":{"BO_FIELD_USER":"$.request.newUser","BO_FIELD_NUM":99}}',
  response: '{"result":true,"msg":"成功","dataPath":"$.fieldMap1"}',
  sessionCreate: '{"connectionId":"bpm-default","userName":"admin","password":"$.request.password"}',
  boCreate: '{"connectionId":"bpm-default","method":"create","bindId":"$.processStart1.processInstanceId","uid":"admin","boList":[{"boName":"UserBO","sourcePath":"$.request.users","rewrite":{"strategy":"all","path":"$.response.users"}}]}',
  boQuery: '{"connectionId":"bpm-default","main":{"boName":"BO_EU_API_TEST_MAIN","method":"list","maxRecord":50,"conditionSourcePath":"$.request.conditions"},"sub":["BO_EU_API_TEST_SUB"]}',
  boUpdate: '{"connectionId":"bpm-default","boList":[{"boName":"BO_EU_API_TEST_MAIN","sourcePath":"$.boQuery1.records"}]}',
  boDelete: '{"connectionId":"bpm-default","method":"remove","boList":[{"boName":"BO_EU_API_TEST_MAIN","sourcePath":"$.boQuery1.records"}]}',
  processStart: '{"connectionId":"bpm-default","processDefId":"proc-001","uid":"admin","title":"申请-${$.request.code}"}',
  processTerminate: '{"connectionId":"bpm-default","instanceId":"$.processStart1.processInstanceId","userId":"admin"}',
  taskComplete: '{"connectionId":"bpm-default","processInstanceId":"$.processStart1.processInstanceId","uid":"admin","failOnError":false}',
  rdsExecute: '{"connectionId":"bpm-default","rdsId":"default","method":"getMaps","sql":"select userid,ext1 as idCard from orguser where ext1=?","args":["$.request.idCard"],"maxRows":100}',
  idCardToUserId: '{"connectionId":"bpm-default","fields":[{"path":"$.request.idCards","separator":","}]}',
  fileUpload: '{"connectionId":"bpm-default","sourcePath":"$.request.files","boId":"$.boCreate1.boResults[0].records[0].ID","appId":"com.awspaas.user.apps.data.bus","boName":"BO_EU_API_TEST_MAIN","boItemName":"BO_FIELD_FILE","processInstId":"$.processStart1.processInstanceId","validateChecksum":false}',
  fileDownload: '{"connectionId":"bpm-default","boId":"$.boCreate1.boResults[0].records[0].ID","fieldName":"BO_FIELD_FILE"}'
};

const SPACE_NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

const isJunction = computed(() => !!props.node?.data.junctionOf);
const isPlaceholder = computed(() => !!props.node?.data.placeholderOf);

const virtualHint = computed(() =>
  props.node?.data.defType === 'end'
    ? '结束是链路终点的视觉标记，不参与 EL 表达式生成；如需隐藏可直接删除。'
    : '开始是链路起点的视觉标记，不参与 EL 表达式生成；如需隐藏可直接删除。'
);

/** 当前画布节点对应的树节点（可能是业务叶子、condition 叶子或算子自身） */
const elNode = computed<ElNode | null>(() =>
  props.node ? treeModel.findNode(props.node.id) : null
);

/** 业务叶子的物料定义 */
const leafDef = computed(() =>
  elNode.value?.componentCode ? getDef(elNode.value.componentCode) : undefined
);

/** 当前选中节点是否脚本叶子（script/booleanScript）—— 用脚本专用编辑器替 JSON 编辑器 */
const isScriptLeaf = computed(
  () =>
    elNode.value?.componentCode === 'script' ||
    elNode.value?.componentCode === 'booleanScript'
);

/** 当前选中的是已挂载条件件（condition 叶子充当网关） */
const isConditionLeaf = computed(
  () => !!props.node?.data.isCondition && !!elNode.value && !getDef(elNode.value.type)?.operator
);

/** 条件网关所属算子节点（condition 叶子的 parent，或算子自身） */
const opNode = computed<ElNode | null>(() => {
  const n = elNode.value;
  if (!n) return null;
  if (getDef(n.type)?.operator) return n;
  return n.parentOperatorId ? treeModel.findNode(n.parentOperatorId) : null;
});

/** 条件菱形是否还没挂条件件（网关仍由算子自身充当） */
const hasCondition = computed(() => isConditionLeaf.value);

const headerLabel = computed(() => {
  if (isConditionLeaf.value) {
    return leafDef.value?.label ?? elNode.value?.componentCode ?? props.node?.data.label ?? '';
  }
  return props.node?.data.label ?? '';
});

const dataHint = computed(() => {
  const code = elNode.value?.componentCode ?? '';
  return DATA_HINTS[code] ?? '组件配置 JSON';
});

/** SWITCH 的 case 管理在 SWITCH 算子/其 condition 网关上编辑 */
const needsCasesEdit = computed(() => {
  const d = props.node?.data;
  return !!d?.isCondition && (opNode.value?.type === 'SWITCH' || d.defType === 'SWITCH');
});

/** 当前编辑界面归属的 SWITCH 算子树节点 id（case 名读写都落它的 outletLabels） */
const switchModelId = computed<string | null>(() => {
  if (!needsCasesEdit.value) return null;
  if (opNode.value?.type === 'SWITCH') return opNode.value.id;
  return elNode.value?.parentOperatorId ?? null;
});

/** case 分支名（读 outletLabels，缺省回退 caseN，与投影展示一致） */
const caseNames = computed<string[]>(() => {
  const id = switchModelId.value;
  const sw = id ? treeModel.findNode(id) : null;
  const count = sw?.children?.length ?? 0;
  return Array.from({ length: count }, (_, i) => sw?.outletLabels?.[i] ?? `case${i + 1}`);
});

/** forLoop/iteratorLoop/switchRoute 走结构化小表单（其余叶子走 JSON 编辑器） */
const STRUCTURED_CODES = ['forLoop', 'iteratorLoop', 'switchRoute'] as const;
const structuredCode = computed<(typeof STRUCTURED_CODES)[number] | ''>(() => {
  const code = elNode.value?.componentCode ?? '';
  return (STRUCTURED_CODES as readonly string[]).includes(code)
    ? (code as (typeof STRUCTURED_CODES)[number])
    : '';
});

/** 结构化表单本地状态（node 切换时从 data JSON 同步） */
const loopForm = reactive({
  count: '',
  indexVar: '',
  source: '',
  cases: [] as { value: string; target: string }[]
});

/** 从叶子 data JSON 同步结构化表单；非法 JSON 按空配置处理 */
function syncLoopForm(data?: string) {
  let cfg: any = {};
  if (data) {
    try {
      cfg = JSON.parse(data);
    } catch {
      cfg = {};
    }
  }
  loopForm.count = cfg?.count == null ? '' : String(cfg.count);
  loopForm.indexVar = typeof cfg?.indexVar === 'string' ? cfg.indexVar : '';
  loopForm.source = typeof cfg?.source === 'string' ? cfg.source : '';
  loopForm.cases = Array.isArray(cfg?.cases)
    ? cfg.cases.map((c: any) => ({
        value: c?.value == null ? '' : String(c.value),
        target: c?.target == null ? '' : String(c.target)
      }))
    : [];
}

/** 表单值序列化回叶子 data（纯数字串转 number，与后端数字比较口径配套） */
function commitLoopForm() {
  if (!elNode.value || !structuredCode.value) return;
  const cfg: Record<string, unknown> = {};
  const indexVar = loopForm.indexVar.trim();
  const source = loopForm.source.trim();
  if (structuredCode.value === 'forLoop') {
    const count = loopForm.count.trim();
    if (count) {
      cfg.count = /^-?\d+$/.test(count) ? Number(count) : count;
    }
    if (indexVar) cfg.indexVar = indexVar;
  } else if (structuredCode.value === 'iteratorLoop') {
    if (source) cfg.source = source;
    if (indexVar) cfg.indexVar = indexVar;
  } else {
    if (source) cfg.source = source;
    cfg.cases = loopForm.cases
      .filter((row) => row.value.trim() !== '' || row.target.trim() !== '')
      .map((row) => ({
        value: coerceCaseValue(row.value.trim()),
        target: row.target.trim()
      }));
  }
  const json = JSON.stringify(cfg);
  treeModel.updateLeafData(elNode.value.id, { data: json });
  dataStr.value = json;
  emit('data-change');
}

/** case 比较值：数字串转数字，其余原样（路径/常量字符串） */
function coerceCaseValue(raw: string): string | number {
  return /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
}

function addRouteCase() {
  loopForm.cases.push({ value: '', target: '' });
  commitLoopForm();
}

function removeRouteCase(index: number) {
  if (loopForm.cases.length <= 1) return;
  loopForm.cases.splice(index, 1);
  commitLoopForm();
}

// 本地输入框状态：node 切换时从 ElNode 树同步
const dataSpace = ref('');
const tag = ref('');
const dataStr = ref('');
const titleInput = ref('');
const spaceError = ref('');

// 脚本编辑器状态：language 下拉 + 脚本文本，与 dataStr 同源于 ElNode.data（JSON 字符串）
const scriptLanguage = ref('');
const scriptText = ref('');
const scriptEngines = ref<string[]>([]);

onMounted(async () => {
  try {
    const res = await listScriptEngines();
    scriptEngines.value = (res.data ?? [])
      .map((e) => e.language ?? '')
      .filter((lang) => !!lang);
  } catch {
    // 接口未部署/未登录时静默：用户可手填语言名，试运行时由后端报错
    scriptEngines.value = [];
  }
});

watch(
  () => props.node?.id,
  () => {
    const n = elNode.value;
    dataSpace.value = n?.cmpId ?? '';
    tag.value = n?.tag ?? '';
    dataStr.value = n?.data ?? '';
    titleInput.value = n?.title ?? '';
    spaceError.value = '';
    // 从 dataStr 解析出 language/script 同步到脚本编辑器；非法 JSON 时给空 defaults
    const parsed = parseScriptCfg(n?.data);
    scriptLanguage.value = parsed.language;
    scriptText.value = parsed.script;
    // 循环/路由三组件的结构化表单同步
    syncLoopForm(n?.data);
  },
  { immediate: true }
);

/** 解析 dataStr 为 {language, script}；非 JSON 或缺字段返回空串 */
function parseScriptCfg(dataStr?: string): { language: string; script: string } {
  if (!dataStr) return { language: '', script: '' };
  try {
    const obj = JSON.parse(dataStr) as { language?: string; script?: string };
    return {
      language: typeof obj.language === 'string' ? obj.language : '',
      script: typeof obj.script === 'string' ? obj.script : ''
    };
  } catch {
    return { language: '', script: '' };
  }
}

/** 脚本编辑器任意字段变更：序列化为 JSON 写回 ElNode.data 并重投影 */
function onScriptFieldChange() {
  if (!props.node || !elNode.value) return;
  const language = scriptLanguage.value.trim();
  const script = scriptText.value;
  const cfg: Record<string, string> = {};
  if (language) cfg.language = language;
  if (script) cfg.script = script;
  const json = Object.keys(cfg).length > 0 ? JSON.stringify(cfg) : '';
  treeModel.updateLeafData(elNode.value.id, { data: json });
  dataStr.value = json;
  emit('data-change');
}

/** 数据空间改名：校验 → renameDataSpace 联动替换全树路径引用 → 重投影 */
function onDataSpaceChange() {
  if (!props.node || !elNode.value) return;
  const newName = dataSpace.value.trim();
  const oldName = elNode.value.cmpId ?? '';
  if (newName === oldName) {
    spaceError.value = '';
    dataSpace.value = oldName;
    return;
  }
  if (!SPACE_NAME_RE.test(newName)) {
    spaceError.value = '字母开头，只能含字母、数字、下划线';
    ElMessage.error('数据空间名不合法：字母开头，只能含字母、数字、下划线');
    dataSpace.value = oldName;
    return;
  }
  if (treeModel.isDataSpaceNameTaken(newName, elNode.value.id)) {
    spaceError.value = '数据空间名已被其他组件占用';
    ElMessage.error(`数据空间名「${newName}」已被占用，画布内必须唯一`);
    dataSpace.value = oldName;
    return;
  }
  const updated = treeModel.renameDataSpace(elNode.value.id, newName);
  spaceError.value = '';
  dataSpace.value = newName;
  if (updated > 0) {
    ElMessage.success(`数据空间已改名，联动更新了 ${updated} 处路径引用`);
  }
  // 改名可能改动了其他叶子的 data，统一走 commit 重投影 + 刷新 EL 预览
  emit('data-change');
}

/** 编辑组件配置 JSON */
function onDataChange() {
  if (!props.node || !elNode.value) return;
  treeModel.updateLeafData(elNode.value.id, { data: dataStr.value });
  emit('data-change');
}

function onOperatorTagChange() {
  if (!props.node) return;
  treeModel.updateOperatorTag(props.node.id, tag.value);
  emit('data-change');
}

// ── 节点标题：留空显组件 label，填了锁定；Refresh 图标清空恢复默认 ──

/** 可编辑标题的节点：业务叶子/条件件/算子（虚拟节点与汇合点/空槽除外） */
const canEditTitle = computed(() => {
  const n = elNode.value;
  if (!n || isJunction.value || isPlaceholder.value) return false;
  return !getDef(n.type)?.virtual;
});

/** 标题所用物料：叶子按注册名反查，算子用自身类型 */
const titleDef = computed(() => {
  const n = elNode.value;
  if (!n) return undefined;
  return n.componentCode ? getDef(n.componentCode) : getDef(n.type);
});

/** 留空时的默认名（输入框 placeholder，取组件 label） */
const defaultTitleText = computed(() => titleDef.value?.label ?? '');

const hasCustomTitle = computed(() => !!titleInput.value.trim());

/** 标题改完（失焦/回车）：写树正本并重投影；空白等同恢复默认 */
function onTitleChange() {
  if (!elNode.value) return;
  treeModel.updateNodeTitle(elNode.value.id, titleInput.value);
  titleInput.value = elNode.value.title ?? '';
  emit('data-change');
}

/** 点 Refresh：清空用户正本，恢复显示组件 label */
function resetTitle() {
  if (!elNode.value) return;
  treeModel.updateNodeTitle(elNode.value.id, '');
  titleInput.value = '';
  emit('data-change');
}

/** 条件菱形上首次选择条件组件：挂到算子 condition 位 */
function onPickCondition(defType: string) {
  const id = opNode.value?.id;
  if (!id) return;
  const condId = ctrl.attachCondition(id, defType);
  if (condId) {
    ctrl.select(condId);
    emit('data-change');
  }
}

// ── 更换已挂载的条件组件 ──
const replaceDialogVisible = ref(false);
const pendingConditionType = ref('');

function openReplaceCondition() {
  pendingConditionType.value = elNode.value?.componentCode ?? condPickDefs.value[0]?.type ?? '';
  replaceDialogVisible.value = true;
}

function confirmReplaceCondition() {
  const id = opNode.value?.id;
  if (!id || !pendingConditionType.value) {
    replaceDialogVisible.value = false;
    return;
  }
  const condId = ctrl.attachCondition(id, pendingConditionType.value);
  replaceDialogVisible.value = false;
  if (condId) {
    ctrl.select(condId);
    emit('data-change');
  }
}

function addCase() {
  const switchId =
    opNode.value?.type === 'SWITCH' ? opNode.value.id : elNode.value?.parentOperatorId;
  if (switchId && treeModel.addCase(switchId)) {
    emit('data-change');
  }
}

function removeCase(index: number) {
  if (switchModelId.value && treeModel.removeCase(switchModelId.value, index)) {
    emit('data-change');
  }
}

/** case 改名：写 SWITCH 算子的 outletLabels[index]；空白恢复默认 caseN */
function onCaseNameChange(index: number, raw: string) {
  if (!switchModelId.value) return;
  treeModel.updateOutletLabel(switchModelId.value, index, raw.trim() || null);
  emit('data-change');
}
</script>

<style scoped>
.cmp-props {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px;
  overflow-y: auto;
}

.cmp-props__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.cmp-props__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.cmp-props__title {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.cmp-props__dot {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.cmp-props__form {
  margin-top: 4px;
}

.cmp-props__title-form {
  margin-top: 4px;
}

.cmp-props__title-reset {
  cursor: pointer;
  color: var(--el-text-color-secondary);
}

.cmp-props__title-reset:hover {
  color: var(--el-color-primary);
}

.cmp-props__hint {
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.cmp-props__hint-box {
  padding: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.cmp-props__cases {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.cmp-props__case-row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.cmp-props__case-row :deep(.el-input) {
  flex: 1;
}

.cmp-props__case-mapping-row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.cmp-props__case-mapping-row :deep(.el-input) {
  flex: 1;
}

.cmp-props__case-mapping-row :deep(.el-select) {
  flex: 1;
}

.cmp-props__opt-desc {
  margin-left: 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.cmp-props__radio-col {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.cmp-props__footer {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>
