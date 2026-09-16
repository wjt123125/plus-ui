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
          {{ node.data.label }}
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

      <!-- 算子属性（gateway 节点） -->
      <el-form v-else-if="node.data.operator" label-position="top" size="small" class="cmp-props__form">
        <!-- IF/SWITCH/循环的 condition 网关：编辑 condition 的 cmpId -->
        <el-form-item v-if="node.data.isCondition" label="条件组件 ID">
          <el-input
            v-model="cmpId"
            placeholder="如 ifNode_xxx"
            clearable
            @change="onLeafChange"
          />
          <div class="cmp-props__hint">
            填入判断用的组件 ID，生成 EL 时作为 {{ node.data.defType }} 的条件位
          </div>
        </el-form-item>

        <!-- SWITCH cases 管理（通过 operator 节点本身，而非 condition） -->
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

        <el-form-item label="标签 tag">
          <el-input
            v-model="tag"
            placeholder="可选，对应 EL 的 .tag(&quot;x&quot;)"
            clearable
            @change="onOperatorTagChange"
          />
        </el-form-item>
      </el-form>

      <!-- 业务组件属性 -->
      <el-form v-else label-position="top" size="small" class="cmp-props__form">
        <el-form-item label="组件 ID（LiteFlow nodeId）" required :error="duplicate ? '组件 ID 不能重复' : ''">
          <el-input v-model="cmpId" placeholder="如 httpRequest_a1b2c3" clearable @change="onLeafChange" />
        </el-form-item>
        <el-form-item label="标签 tag">
          <el-input v-model="tag" placeholder="可选，对应 EL 的 .tag(&quot;x&quot;)" clearable @change="onLeafChange" />
        </el-form-item>
        <el-form-item label="参数数据 data">
          <el-input
            v-model="dataStr"
            type="textarea"
            :rows="6"
            placeholder="可选，对应 EL 的 .data(&quot;...&quot;)；桩组件阶段先以文本承载"
            @change="onLeafChange"
          />
        </el-form-item>
      </el-form>

      <div v-if="!isJunction && !isPlaceholder" class="cmp-props__footer">
        <el-button size="small" type="danger" plain @click="emit('delete', node.id)">删除节点</el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Delete, Plus } from '@element-plus/icons-vue';
import type { Node } from '@vue-flow/core';
import { ElAlert, ElButton, ElEmpty, ElForm, ElFormItem, ElInput, ElTag } from 'element-plus';
import { getDef } from '../cmp-defs';
import { useElTreeModelInject, type CmpNodeData } from '../composables/useElTreeModel';

const props = defineProps<{
  node: Node<CmpNodeData> | null;
  duplicate?: boolean;
}>();

const emit = defineEmits<{
  (e: 'delete', id: string): void;
  (e: 'data-change'): void;
}>();

const treeModel = useElTreeModelInject();

const isJunction = computed(() => !!props.node?.data.junctionOf);
const isPlaceholder = computed(() => !!props.node?.data.placeholderOf);

const virtualHint = computed(() =>
  props.node?.data.defType === 'end'
    ? '结束是链路终点的视觉标记，不参与 EL 表达式生成；如需隐藏可直接删除。'
    : '开始是链路起点的视觉标记，不参与 EL 表达式生成；如需隐藏可直接删除。'
);

/** SWITCH 的 case 管理在 operator 节点（非 condition 网关）上编辑 */
const needsCasesEdit = computed(() => {
  const d = props.node?.data;
  if (!d) return false;
  // SWITCH 的 condition 是网关（isCondition=true），case 管理在 condition 节点上
  return d.isCondition && d.defType === 'SWITCH';
});

/** SWITCH 的 case 数量（从 ElNode children 读） */
const caseCount = computed(() => {
  if (!needsCasesEdit.value || !props.node) return 0;
  const elNode = treeModel.findNode(props.node.id);
  return elNode?.children?.length ?? 0;
});

// 本地输入框状态：node 切换时从 ElNode 树同步
const cmpId = ref('');
const tag = ref('');
const dataStr = ref('');

watch(
  () => props.node?.id,
  (id) => {
    if (!id) {
      cmpId.value = '';
      tag.value = '';
      dataStr.value = '';
      return;
    }
    const elNode = treeModel.findNode(id);
    cmpId.value = elNode?.cmpId ?? '';
    tag.value = elNode?.tag ?? '';
    dataStr.value = elNode?.data ?? '';
  },
  { immediate: true }
);

function onLeafChange() {
  if (!props.node) return;
  treeModel.updateLeafData(props.node.id, {
    cmpId: cmpId.value,
    tag: tag.value,
    data: dataStr.value
  });
  emit('data-change');
}

function onOperatorTagChange() {
  if (!props.node) return;
  // 算子的 tag 存在 operator 节点上（非 condition 网关）
  // condition 网关的 tag 也是其自身 ElNode 的 tag
  treeModel.updateOperatorTag(props.node.id, tag.value);
  emit('data-change');
}

function addCase() {
  if (!props.node) return;
  // SWITCH 的 case 管理在 condition 节点上（condition 的 parent 是 SWITCH）
  // condition.id = canvas node id；需找到其 parent SWITCH
  // 实际上 addCase 接收 switchId，但当前选中的是 condition 节点
  // condition 的 parentOperatorId 指向 SWITCH
  const condNode = treeModel.findNode(props.node.id);
  const switchId = condNode?.parentOperatorId;
  if (switchId && treeModel.addCase(switchId)) {
    emit('data-change');
  }
}

function removeCase(index: number) {
  if (!props.node) return;
  const condNode = treeModel.findNode(props.node.id);
  const switchId = condNode?.parentOperatorId;
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
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.cmp-props__dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 6px;
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

.cmp-props__footer {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>
