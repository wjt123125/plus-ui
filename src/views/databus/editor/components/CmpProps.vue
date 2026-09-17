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

      <!-- IF/WHILE 条件菱形：未挂条件件时选择条件组件，已挂则编辑条件件本身 -->
      <el-form
        v-else-if="node.data.isCondition && supportedCondOp && !hasCondition"
        label-position="top"
        size="small"
        class="cmp-props__form"
      >
        <el-form-item :label="`${opNode?.type} 条件组件`">
          <el-select
            :model-value="''"
            placeholder="选择条件组件"
            style="width: 100%"
            @change="onPickCondition"
          >
            <el-option
              v-for="d in booleanDefs"
              :key="d.type"
              :label="d.label"
              :value="d.type"
            >
              <span>{{ d.label }}</span>
              <span class="cmp-props__opt-desc">{{ d.desc }}</span>
            </el-option>
          </el-select>
          <div class="cmp-props__hint">
            条件组件为布尔组件，运行时返回真/假决定{{ opNode?.type === 'WHILE' ? '是否继续循环' : '走哪个分支' }}
          </div>
        </el-form-item>
      </el-form>

      <!-- SWITCH/FOR/ITERATOR 条件菱形：本档暂不支持配置条件件 -->
      <el-form
        v-else-if="node.data.isCondition && !supportedCondOp"
        label-position="top"
        size="small"
        class="cmp-props__form"
      >
        <template v-if="needsCasesEdit">
          <el-form-item label="分支 (case)">
            <div class="cmp-props__cases">
              <div v-for="(_, i) in caseCount" :key="i" class="cmp-props__case-row">
                <span class="cmp-props__case-label">case{{ i + 1 }}</span>
                <el-button :icon="Delete" size="small" text :disabled="caseCount <= 1" @click="removeCase(i)" />
              </div>
              <el-button size="small" :icon="Plus" @click="addCase">添加分支</el-button>
            </div>
          </el-form-item>
        </template>
        <el-alert
          title="该算子的条件组件本档暂不支持配置，试运行不会执行此结构"
          type="warning"
          :closable="false"
          show-icon
        />
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
            <div v-for="(_, i) in caseCount" :key="i" class="cmp-props__case-row">
              <span class="cmp-props__case-label">case{{ i + 1 }}</span>
              <el-button :icon="Delete" size="small" text :disabled="caseCount <= 1" @click="removeCase(i)" />
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

      <!-- 业务组件 / 已挂载的条件件：数据空间 + 配置 JSON -->
      <el-form v-else label-position="top" size="small" class="cmp-props__form">
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
          <el-input
            v-model="dataStr"
            type="textarea"
            :rows="8"
            :placeholder="dataHint"
            @change="onDataChange"
          />
        </el-form-item>
      </el-form>

      <div v-if="!isJunction && !isPlaceholder" class="cmp-props__footer">
        <el-button size="small" type="danger" plain @click="emit('delete', node.id)">删除节点</el-button>
      </div>
    </template>

    <!-- 更换条件组件弹层（当前只有「条件判断」一个布尔物料） -->
    <el-dialog
      v-model="replaceDialogVisible"
      title="更换条件组件"
      width="360px"
      append-to-body
    >
      <el-radio-group v-model="pendingConditionType" class="cmp-props__radio-col">
        <el-radio
          v-for="d in booleanDefs"
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
import { computed, ref, watch } from 'vue';
import { Delete, Plus } from '@element-plus/icons-vue';
import type { Node } from '@vue-flow/core';
import {
  ElAlert,
  ElButton,
  ElDialog,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElOption,
  ElRadio,
  ElRadioGroup,
  ElSelect,
  ElTag
} from 'element-plus';
import { CMP_DEFS, getDef, isBooleanDef } from '../cmp-defs';
import {
  useElTreeModelInject,
  type CmpNodeData,
  type ElNode
} from '../composables/useElTreeModel';
import { useCanvasController } from '../composables/useCanvasController';

const props = defineProps<{
  node: Node<CmpNodeData> | null;
}>();

const emit = defineEmits<{
  (e: 'delete', id: string): void;
  (e: 'data-change'): void;
}>();

const treeModel = useElTreeModelInject();
const ctrl = useCanvasController();

/** 可选布尔条件物料（当前仅「条件判断」） */
const booleanDefs = CMP_DEFS.filter((d) => isBooleanDef(d));

/** 各物料配置 JSON 的示例占位文案 */
const DATA_HINTS: Record<string, string> = {
  httpRequest: '{"method":"GET","url":"http://localhost:8080/auth/code"}',
  condition: '{"path":"$.httpRequest1.response.code","op":"eq","value":200}',
  setValue: '{"path":"$.setValue1.demo","value":"常量 或 $.入参路径"}',
  fieldMap: '{"mappings":[{"from":"$.httpRequest1.response.msg","to":"$.fieldMap1.msg"}]}',
  response: '{"result":true,"msg":"成功","dataPath":"$.fieldMap1"}'
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

/** 本档支持配置布尔条件件的算子 */
const supportedCondOp = computed(() =>
  ['IF', 'WHILE'].includes(opNode.value?.type ?? '')
);

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

const caseCount = computed(() => {
  if (!needsCasesEdit.value) return 0;
  const switchId =
    opNode.value?.type === 'SWITCH' ? opNode.value.id : elNode.value?.parentOperatorId;
  return switchId ? (treeModel.findNode(switchId)?.children?.length ?? 0) : 0;
});

// 本地输入框状态：node 切换时从 ElNode 树同步
const dataSpace = ref('');
const tag = ref('');
const dataStr = ref('');
const spaceError = ref('');

watch(
  () => props.node?.id,
  () => {
    const n = elNode.value;
    dataSpace.value = n?.cmpId ?? '';
    tag.value = n?.tag ?? '';
    dataStr.value = n?.data ?? '';
    spaceError.value = '';
  },
  { immediate: true }
);

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
  pendingConditionType.value = elNode.value?.componentCode ?? booleanDefs[0]?.type ?? '';
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
  const switchId =
    opNode.value?.type === 'SWITCH' ? opNode.value.id : elNode.value?.parentOperatorId;
  if (switchId && treeModel.removeCase(switchId, index)) {
    emit('data-change');
  }
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

.cmp-props__case-label {
  flex: 1;
  font-size: 12px;
  color: var(--el-text-color-primary);
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
