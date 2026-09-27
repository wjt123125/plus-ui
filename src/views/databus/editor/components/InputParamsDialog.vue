<template>
  <el-dialog
    :model-value="visible"
    title="入参登记"
    width="1060px"
    append-to-body
    @update:model-value="onVisibleChange"
  >
    <div class="input-params-dialog">
      <div class="input-params-dialog__head">
        <span class="input-params-dialog__tip">
          两边都能编辑：左侧改条目、右侧 JSON 实时联动；右侧改 JSON、左侧自动拆条目。默认值仅用于试运行预填
        </span>
      </div>

      <div class="input-params-dialog__panes">
        <section class="pane">
          <div class="pane__title">条目登记</div>
          <div class="pane__body">
            <el-table :data="rows" size="small" border height="100%">
              <el-table-column label="路径" min-width="190">
                <template #default="{ row }">
                  <el-input v-model="row.path" size="small" placeholder="$.request.password" />
                </template>
              </el-table-column>
              <el-table-column label="类型" width="100">
                <template #default="{ row }">
                  <el-select v-model="row.type" size="small" @change="onTypeChange(row as RowDraft)">
                    <el-option label="文本" value="text" />
                    <el-option label="数字" value="number" />
                    <el-option label="布尔" value="boolean" />
                    <el-option label="对象" value="object" />
                    <el-option label="数组" value="array" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="默认值" min-width="170">
                <template #default="{ row }">
                  <el-input
                    v-if="row.type === 'text'"
                    v-model="row.textValue"
                    size="small"
                    placeholder="无默认值留空"
                  />
                  <el-input-number
                    v-else-if="row.type === 'number'"
                    v-model="row.numberValue"
                    size="small"
                    controls-position="right"
                    class="pane__number"
                    placeholder="无默认值"
                  />
                  <el-switch
                    v-else-if="row.type === 'boolean'"
                    v-model="row.boolValue"
                  />
                  <el-input
                    v-else
                    v-model="row.jsonText"
                    size="small"
                    type="textarea"
                    :autosize="{ minRows: 1, maxRows: 4 }"
                    :placeholder="row.type === 'array' ? '[]' : '{}'"
                  />
                </template>
              </el-table-column>
              <el-table-column label="必填" width="58" align="center">
                <template #default="{ row }">
                  <el-switch v-model="row.required" />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="56" align="center">
                <template #default="{ $index }">
                  <el-button size="small" type="danger" link @click="removeRow($index)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <p v-if="leftError" class="pane__error">{{ leftError }}（右侧 JSON 保留上次合法内容）</p>
          <el-button size="small" class="pane__add" @click="addRow">
            <el-icon class="el-icon--left"><Plus /></el-icon>新增一行
          </el-button>
        </section>

        <section class="pane">
          <div class="pane__title">JSON（与左侧实时联动）</div>
          <div class="pane__body">
            <el-input
              v-model="jsonText"
              class="pane__json"
              type="textarea"
              spellcheck="false"
              placeholder='{"request":{"password":"xxx"}}'
            />
          </div>
          <p v-if="jsonError" class="pane__error">{{ jsonError }}（左侧条目保留）</p>
          <p v-else class="pane__hint">JSON 合法时按叶子自动拆回左侧条目；必填勾按路径保留</p>
        </section>
      </div>
    </div>

    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import type { ChainInputParam, ChainInputType } from '@/api/databus/chain/types';
import { buildDefaultsJson, flattenToParams, validateParams } from '../input-params';

defineOptions({ name: 'InputParamsDialog' });

const props = defineProps<{
  visible: boolean;
  params: ChainInputParam[];
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  save: [params: ChainInputParam[]];
}>();

interface RowDraft {
  path: string;
  type: ChainInputType;
  textValue: string;
  numberValue: number | undefined;
  boolValue: boolean;
  jsonText: string;
  required: boolean;
}

const rows = ref<RowDraft[]>([]);
const jsonText = ref('{}');
const leftError = ref<string | null>(null);
const jsonError = ref<string | null>(null);
// 同步对侧时抑制回环（程序写入触发的 watch 不再反向编译）
let suppressRight = false;
let suppressLeft = false;

function toRow(param: ChainInputParam): RowDraft {
  const type: ChainInputType = param.type ?? 'text';
  const def = param.defaultValue;
  return {
    path: param.path ?? '',
    type,
    textValue: type === 'text' && def !== null && def !== undefined ? String(def) : '',
    numberValue: type === 'number' && typeof def === 'number' ? def : undefined,
    boolValue: type === 'boolean' ? Boolean(def) : false,
    jsonText:
      type === 'object' || type === 'array'
        ? JSON.stringify(def ?? (type === 'array' ? [] : {}), null, 2)
        : '{}',
    required: Boolean(param.required)
  };
}

function addRow() {
  rows.value.push({
    path: '',
    type: 'text',
    textValue: '',
    numberValue: undefined,
    boolValue: false,
    jsonText: '{}',
    required: false
  });
}

function removeRow(index: number) {
  rows.value.splice(index, 1);
}

/** 切换类型：默认值按新类型重置（旧值不强行转换，避免悄悄出错） */
function onTypeChange(row: RowDraft) {
  row.textValue = '';
  row.numberValue = undefined;
  row.boolValue = false;
  row.jsonText = row.type === 'array' ? '[]' : '{}';
}

/** 行编辑态 → 登记条目；路径非法或 object/array 默认值 JSON 写坏时返回错误信息 */
function rowsToParams(): { params: ChainInputParam[]; error: string | null } {
  const params: ChainInputParam[] = [];
  for (const row of rows.value) {
    let defaultValue: unknown;
    if (row.type === 'text') {
      defaultValue = row.textValue;
    } else if (row.type === 'number') {
      defaultValue = row.numberValue;
    } else if (row.type === 'boolean') {
      defaultValue = row.boolValue;
    } else {
      try {
        defaultValue = JSON.parse(row.jsonText);
      } catch {
        return { params: [], error: `默认值不是合法 JSON：${row.path || '（空路径）'}` };
      }
      const expected = row.type === 'array' ? Array.isArray(defaultValue) : !Array.isArray(defaultValue);
      if (!expected) {
        return { params: [], error: `默认值类型与所选类型不符：${row.path || '（空路径）'}` };
      }
    }
    params.push({
      path: row.path.trim(),
      type: row.type,
      defaultValue,
      required: row.required
    });
  }
  const error = validateParams(params);
  return { params, error };
}

/** 左 → 右：条目全部合法才刷新 JSON，否则右侧保留上次合法内容并提示 */
function syncRight() {
  const { params, error } = rowsToParams();
  if (error) {
    leftError.value = error;
    return;
  }
  leftError.value = null;
  const next = JSON.stringify(buildDefaultsJson(params), null, 2);
  if (next !== jsonText.value) {
    suppressLeft = true;
    jsonText.value = next;
  }
}

/** 右 → 左：JSON 合法且顶层为对象才拆条目，否则左侧保留并提示 */
function syncLeft() {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText.value);
  } catch {
    jsonError.value = 'JSON 语法有误';
    return;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    jsonError.value = '顶层须是 JSON 对象，如 {"request":{...}}';
    return;
  }
  jsonError.value = null;
  const requiredByPath = new Map<string, boolean>();
  rows.value.forEach(r => requiredByPath.set(r.path.trim(), r.required));
  const nextParams = flattenToParams(parsed).map(p => ({
    ...p,
    required: requiredByPath.get(p.path ?? '') ?? false
  }));
  const nextRows = nextParams.map(toRow);
  if (JSON.stringify(nextRows) !== JSON.stringify(rows.value)) {
    suppressRight = true;
    rows.value = nextRows;
  }
}

watch(rows, () => {
  if (suppressRight) {
    suppressRight = false;
    return;
  }
  syncRight();
}, { deep: true });

watch(jsonText, () => {
  if (suppressLeft) {
    suppressLeft = false;
    return;
  }
  syncLeft();
});

function save() {
  if (leftError.value) {
    ElMessage.warning(leftError.value);
    return;
  }
  if (jsonError.value) {
    ElMessage.warning(jsonError.value);
    return;
  }
  // 两侧内容等价：从 JSON 解析，必填勾以当前条目按路径保留
  const parsed = JSON.parse(jsonText.value) as Record<string, unknown>;
  const requiredByPath = new Map<string, boolean>();
  rows.value.forEach(r => requiredByPath.set(r.path.trim(), r.required));
  const params = flattenToParams(parsed).map(p => ({
    ...p,
    required: requiredByPath.get(p.path ?? '') ?? false
  }));
  const error = validateParams(params);
  if (error) {
    ElMessage.warning(error);
    return;
  }
  emit('save', params);
  emit('update:visible', false);
}

function close() {
  emit('update:visible', false);
}

function onVisibleChange(value: boolean) {
  emit('update:visible', value);
}

// 弹窗打开时按 props 初始化（关闭不重置，避免关闭动画里闪内容）
watch(
  () => props.visible,
  visible => {
    if (visible) {
      leftError.value = null;
      jsonError.value = null;
      rows.value = props.params.map(toRow);
      jsonText.value = JSON.stringify(buildDefaultsJson(props.params), null, 2);
    }
  }
);
</script>

<style lang="scss" scoped>
.input-params-dialog {
  display: flex;
  flex-direction: column;

  &__head {
    margin-bottom: 10px;
  }

  &__tip {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  &__panes {
    display: flex;
    gap: 14px;
    height: 470px;
  }
}

.pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;

  &__title {
    margin-bottom: 6px;
    font-size: 13px;
    font-weight: 600;
  }

  &__body {
    flex: 1;
    min-height: 0;
  }

  &__number {
    width: 100%;
  }

  &__json {
    height: 100%;

    :deep(.el-textarea__inner) {
      height: 100%;
      font-family: Consolas, Monaco, monospace;
    }
  }

  &__add {
    margin-top: 10px;
  }

  &__error {
    margin: 6px 2px 0;
    font-size: 12px;
    color: var(--el-color-danger);
  }

  &__hint {
    margin: 6px 2px 0;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}
</style>
