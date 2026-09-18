<!--
  连接新增/编辑弹窗 — UI 范式决策(2026-09-18 拍板,影响后续 1D-P0 多种 connector 表单)
  范式:Vercel/Linear 极简留白(单列 label-top + 大留白)
    - 弹窗宽度 680→520px,label-position="top"
    - el-tabs 2 分组(2026-09-18 调整):基础+凭据 6 字段在「基础」tab,IP白名单/超时/重试/备注 4 字段在「高级」tab(替代早期 <details> 折叠,缩短弹窗高度)
    - IP 白名单:复用 JsonCodeEditor.vue(不再用 textarea 手写 JSON)
    - 单位后缀:el-input #append slot(如 [ 30000 | 毫秒 ]),弃用 input-number 步进
    - 凭据区:username/password 单列堆叠 + var(--el-font-family-mono);编辑场景密码 placeholder 加「留空不修改」
    - enabled:移到 el-dialog header slot 右上角小开关(Linear active/inactive 风)
    - connectorType:改成只读 tag(当前仅 bpmHttp 一个选项,无下拉意义);第二种 connector 落地时切换动态表单
    - footer:测试按钮左 + 取消/确定右,中间 flex:1 占位消解视觉不平衡
-->
<template>
  <el-dialog
    v-model="visible"
    width="520px"
    append-to-body
    destroy-on-close
    :show-close="false"
    :close-on-click-modal="true"
    modal-class="connection-form-mask"
    class="connection-form"
  >
    <template #header>
      <div class="connection-form__header">
        <div class="connection-form__title-wrap">
          <span class="connection-form__connector">
            <el-tooltip
              :content="form.enabled === 'Y' ? '已启用' : '已禁用'"
              placement="top"
              :show-after="200"
            >
              <span
                class="connection-form__connector-dot"
                :class="form.enabled === 'Y' ? 'is-enabled' : 'is-disabled'"
                aria-hidden="true"
              />
            </el-tooltip>
            {{ currentConnectorLabel }}
          </span>
        </div>
        <div class="connection-form__enabled" @click.stop>
          <el-switch v-model="form.enabled" active-value="Y" inactive-value="N" size="default" />
        </div>
      </div>
    </template>

    <el-form
      ref="formRef"
      v-loading="detailLoading"
      :model="form"
      :rules="rules"
      label-position="top"
      class="connection-form__body"
    >
      <el-tabs v-model="activeTab" class="connection-form__tabs">
        <el-tab-pane label="基础" name="basic">
          <el-form-item label="连接ID" prop="connectionId">
            <el-input v-model="form.connectionId" maxlength="64" placeholder="全局唯一,如 bpm-prod" />
          </el-form-item>
          <el-form-item label="连接名称" prop="connectionName">
            <el-input v-model="form.connectionName" maxlength="100" placeholder="请输入连接名称" />
          </el-form-item>
          <el-form-item label="连接地址" prop="endpoint">
            <el-input v-model="form.endpoint" maxlength="255" placeholder="BPM 容器地址,如 http://localhost:8088" />
          </el-form-item>
          <el-form-item label="用户名" prop="username" class="connection-form__credential">
            <el-input v-model="form.username" maxlength="64" placeholder="BPM 登录用户名" />
          </el-form-item>
          <el-form-item label="密码" prop="password" class="connection-form__credential">
            <el-input
              v-model="form.password"
              type="password"
              maxlength="128"
              show-password
              :placeholder="form.id ? '留空表示不修改' : 'BPM 登录密码'"
            />
          </el-form-item>
        </el-tab-pane>
        <el-tab-pane label="高级" name="advanced">
          <el-form-item label="IP 白名单" prop="ipWhiteList">
            <JsonCodeEditor
              v-model="form.ipWhiteList"
              height="120px"
              placeholder='JSON 数组,如 ["192.168.1.1","10.0.0.0/24"];留空表示不限制'
              @blur="handleIpBlur"
            />
          </el-form-item>
          <el-form-item label="超时时间" prop="timeout">
            <el-input
              :model-value="form.timeout == null ? '' : String(form.timeout)"
              placeholder="30000"
              class="connection-form__input-with-unit"
              @update:model-value="handleNumberUpdate('timeout', $event)"
            >
              <template #append>毫秒</template>
            </el-input>
          </el-form-item>
          <el-form-item label="重试次数" prop="retryCount">
            <el-input
              :model-value="form.retryCount == null ? '' : String(form.retryCount)"
              placeholder="0"
              class="connection-form__input-with-unit"
              @update:model-value="handleNumberUpdate('retryCount', $event)"
            >
              <template #append>次</template>
            </el-input>
            <div class="connection-form__hint">1D-P0 保留字段</div>
          </el-form-item>
          <el-form-item label="备注" prop="remark">
            <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="500" placeholder="请输入备注" />
          </el-form-item>
        </el-tab-pane>
      </el-tabs>
    </el-form>

    <template #footer>
      <div class="connection-form__footer">
        <ConnectionTestButton :form-data="form" />
        <div class="connection-form__footer-spacer" />
        <el-button @click="visible = false">取 消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确 定</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts" name="ConnectionForm">
import type { SysDatabusConnectionBo } from '@/api/databus/connection/types';
import { CONNECTOR_OPTIONS, addConnection, getConnection, updateConnection } from '@/api/databus/connection';
import modal from '@/plugins/modal';
import JsonCodeEditor from '../editor/components/JsonCodeEditor.vue';
import ConnectionTestButton from './ConnectionTestButton.vue';
import { tr } from 'element-plus/es/locale/index.mjs';

/**
 * 连接新增/编辑弹窗。
 *
 * 使用方式:父组件持有 ref,调用 openDialog() 新增、openDialog(row) 编辑;
 * 提交成功后 emit('success'),父组件刷新列表。
 * 编辑回显走 GET /{id} 重新拉详情(跟随 notice/config 页面范式,避免列表行字段不全)。
 *
 * UI 范式见文件顶部注释(Vercel/Linear 极简留白)。
 */

const emit = defineEmits<{
  (e: 'success'): void;
}>();

const visible = ref(false);
const detailLoading = ref(false);
const submitting = ref(false);
const formRef = ref<ElFormInstance>();

const buildInitFormData = (): SysDatabusConnectionBo => ({
  id: undefined,
  connectionId: '',
  connectionName: '',
  connectorType: 'bpmHttp',
  endpoint: '',
  username: '',
  password: '',
  ipWhiteList: '',
  timeout: 30000,
  retryCount: 0,
  enabled: 'Y',
  remark: ''
});

const form = ref<SysDatabusConnectionBo>(buildInitFormData());

/** 当前激活的 tab;openDialog 时重置到「基础」,避免上次编辑切到「高级」后新增仍停留在高级 tab */
const activeTab = ref<'basic' | 'advanced'>('basic');

/** 当前 connectorType 对应的可读 label(用于 tag 显示);后续多 connector 时改 dynamic map */
const currentConnectorLabel = computed(
  () => CONNECTOR_OPTIONS.find(item => item.value === form.value.connectorType)?.label ?? form.value.connectorType
);

/** 非空时必须为 JSON 数组,与后端 SysDatabusConnectionServiceImpl.parseIpWhiteList 口径一致 */
const validateIpWhiteList = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  if (!value || !value.trim()) {
    callback();
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    callback(new Error('IP 白名单不是合法 JSON,格式如 ["192.168.1.1","10.0.0.0/24"]'));
    return;
  }
  if (!Array.isArray(parsed)) {
    callback(new Error('IP 白名单必须是 JSON 数组,格式如 ["192.168.1.1","10.0.0.0/24"]'));
    return;
  }
  callback();
};

const rules = {
  connectionId: [
    { required: true, message: '连接ID不能为空', trigger: 'blur' },
    { max: 64, message: '连接ID长度不能超过64', trigger: 'blur' }
  ],
  connectionName: [
    { required: true, message: '连接名称不能为空', trigger: 'blur' },
    { max: 100, message: '连接名称长度不能超过100', trigger: 'blur' }
  ],
  connectorType: [{ required: true, message: '连接器类型不能为空', trigger: 'change' }],
  endpoint: [{ max: 255, message: '连接地址长度不能超过255', trigger: 'blur' }],
  username: [{ max: 64, message: '用户名长度不能超过64', trigger: 'blur' }],
  password: [{ max: 128, message: '密码长度不能超过128', trigger: 'blur' }],
  ipWhiteList: [{ required: false, validator: validateIpWhiteList, trigger: 'blur' }],
  timeout: [{ required: true, message: '超时时间不能为空', trigger: 'blur' }]
};

/**
 * el-input #append 替代 input-number 后,需要手动把字符串转回 number 写回 form。
 * 空字符串视为 undefined(让后端兜底默认值),NaN 也兜底为 undefined 避免污染数据。
 */
function handleNumberUpdate(field: 'timeout' | 'retryCount', value: string) {
  if (value === '') {
    form.value[field] = undefined;
    return;
  }
  const num = Number(value);
  form.value[field] = Number.isNaN(num) ? undefined : num;
}

/** JsonCodeEditor 失焦后手动触发 ipWhiteList 校验(CodeMirror 不是原生 input,el-form-item 监听不到原生 blur) */
function handleIpBlur() {
  formRef.value?.validateField('ipWhiteList');
}

/** 新增:openDialog();编辑:openDialog(id)(内部按主键拉详情回显) */
async function openDialog(id?: number | string) {
  form.value = buildInitFormData();
  activeTab.value = 'basic';
  const isEdit = id !== undefined && id !== null && id !== '';
  visible.value = true;
  if (!isEdit) {
    return;
  }
  detailLoading.value = true;
  try {
    const { data } = await getConnection(id);
    form.value = { ...buildInitFormData(), ...data };
  } catch {
    // 错误提示由 request 拦截器统一弹出,详情拉取失败直接关闭弹窗
    visible.value = false;
  } finally {
    detailLoading.value = false;
  }
}

function handleSubmit() {
  formRef.value?.validate(async (valid: boolean) => {
    if (!valid) {
      return;
    }
    const isEdit = !!form.value.id;
    submitting.value = true;
    try {
      if (isEdit) {
        await updateConnection(form.value);
      } else {
        await addConnection(form.value);
      }
      modal.msgSuccess(isEdit ? '修改成功' : '新增成功');
      visible.value = false;
      emit('success');
    } finally {
      submitting.value = false;
    }
  });
}

defineExpose({ openDialog });
</script>

<style lang="scss" scoped>
.connection-form {
  :deep(.el-dialog__header) {
    margin-right: 0;
  }

  :deep(.el-dialog__body) {
    padding-top: 8px;
    padding-bottom: 4px;
  }

  :deep(.el-dialog__footer) {
    padding-top: 4px;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }


  &__enabled {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }

  &__enabled-label {
    min-width: 28px;
    text-align: right;
  }

  &__body {
    :deep(.el-form-item) {
      margin-bottom: 10px;
    }

    :deep(.el-form-item__label) {
      padding-bottom: 4px;
      font-weight: 500;
      color: var(--el-text-color-primary);
      line-height: 1.5;
    }

    :deep(.el-form-item__content) {
      line-height: 1.5;
    }
  }

  &__title-wrap {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }

  &__connector {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
    color: var(--el-text-color-regular);
    letter-spacing: 0.1px;
  }

  &__connector-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    transition: background-color 0.2s ease, box-shadow 0.2s ease;

    &.is-enabled {
      background-color: var(--el-color-success);
      box-shadow: 0 0 0 3px var(--el-color-success-light-9);
    }

    &.is-disabled {
      background-color: var(--el-text-color-placeholder);
      box-shadow: 0 0 0 3px var(--el-fill-color);
    }
  }

  &__credential {
    :deep(.el-input__inner) {
      font-family: var(--el-font-family-mono, 'JetBrains Mono', Menlo, Monaco, Consolas, monospace);
      letter-spacing: 0.2px;
    }
  }

  &__input-with-unit {
    :deep(.el-input-group__append) {
      min-width: 56px;
      padding: 0 12px;
      font-size: 13px;
      color: var(--el-text-color-secondary);
      background-color: var(--el-fill-color-light);
    }
  }

  &__hint {
    margin-top: 4px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    line-height: 1.4;
  }

  &__tabs {
    :deep(.el-tabs__header) {
      margin: 0 0 8px;
      padding: 0 2px;
    }

    :deep(.el-tabs__nav-wrap::after) {
      height: 1px;
      background-color: var(--el-border-color-lighter);
    }

    :deep(.el-tabs__item) {
      height: 30px;
      font-size: 13px;
      font-weight: 500;
      padding: 0 14px;
    }

    :deep(.el-tab-pane) {
      padding: 0 2px;

      .el-form-item:last-child {
        margin-bottom: 0;
      }
    }
  }

  &__footer {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;

    &-spacer {
      flex: 1;
    }
  }
}
</style>

<style>
/* 假无遮罩:保留 modal 元素以拦截外部点击(close-on-click-modal 生效),但背景透明看起来像无遮罩。
   class 名特定(connection-form-mask),不影响其他 dialog。 */
.connection-form-mask {
  background: transparent;
}
</style>
