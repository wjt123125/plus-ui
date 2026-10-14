<!--
  告警规则新增/编辑弹窗。
  - 规则类型决定阈值字段：连续失败填「次数阈值」，成功率低于阈值填「下限百分比」，切换时清空另一侧避免脏数据。
  - enabled 开关外露到 header 右上角（与连接表单同范式）。
  - 编辑回显走 GET /databus/alert/rule/{id}（列表行字段不全，避免用列表行回填）。
-->
<template>
  <el-dialog
    v-model="visible"
    width="540px"
    append-to-body
    destroy-on-close
    :show-close="false"
    :close-on-click-modal="true"
    class="alert-rule-form"
  >
    <template #header>
      <div class="alert-rule-form__header">
        <span class="alert-rule-form__title">{{ form.id ? '编辑告警规则' : '新增告警规则' }}</span>
        <div class="alert-rule-form__enabled" @click.stop>
          <span class="alert-rule-form__enabled-label">{{ form.enabled === 'Y' ? '启用' : '停用' }}</span>
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
      class="alert-rule-form__body"
    >
      <el-form-item label="规则名称" prop="ruleName">
        <el-input v-model="form.ruleName" maxlength="100" placeholder="如：订单同步链路连续失败" />
      </el-form-item>

      <el-form-item label="目标链路" prop="chainCode">
        <el-select
          v-model="form.chainCode"
          filterable
          allow-create
          default-first-option
          class="alert-rule-form__chain"
          :loading="chainLoading"
          placeholder="选择或输入链路编码"
        >
          <el-option
            v-for="c in chainOptions"
            :key="String(c.id)"
            :label="`${c.chainName}（#${c.chainCode}）`"
            :value="c.chainCode"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="规则类型" prop="ruleType">
        <el-select v-model="form.ruleType" class="alert-rule-form__full" @change="handleTypeChange">
          <el-option
            v-for="item in ALERT_RULE_TYPE_OPTIONS"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="评估窗口" prop="windowMinutes">
        <el-input
          :model-value="form.windowMinutes == null ? '' : String(form.windowMinutes)"
          placeholder="5"
          class="alert-rule-form__input-with-unit"
          @update:model-value="handleNumberUpdate('windowMinutes', $event)"
        >
          <template #append>分钟</template>
        </el-input>
        <div class="alert-rule-form__hint">每次评估回扫最近该窗口内的执行记录</div>
      </el-form-item>

      <el-form-item
        v-if="form.ruleType === 'CONSECUTIVE_FAILURE'"
        label="连续失败次数"
        prop="thresholdCount"
      >
        <el-input
          :model-value="form.thresholdCount == null ? '' : String(form.thresholdCount)"
          placeholder="3"
          class="alert-rule-form__input-with-unit"
          @update:model-value="handleNumberUpdate('thresholdCount', $event)"
        >
          <template #append>次</template>
        </el-input>
        <div class="alert-rule-form__hint">窗口内最近该次数的执行全部失败即触发</div>
      </el-form-item>

      <el-form-item
        v-if="form.ruleType === 'SUCCESS_RATE'"
        label="成功率下限"
        prop="thresholdRate"
      >
        <el-input
          :model-value="form.thresholdRate == null ? '' : String(form.thresholdRate)"
          placeholder="95"
          class="alert-rule-form__input-with-unit"
          @update:model-value="handleNumberUpdate('thresholdRate', $event)"
        >
          <template #append>%</template>
        </el-input>
        <div class="alert-rule-form__hint">窗口内成功率低于该值即触发（0-100）</div>
      </el-form-item>

      <el-form-item label="通知邮箱" prop="notifyEmails">
        <el-input
          v-model="form.notifyEmails"
          maxlength="500"
          placeholder="多个用逗号分隔，如 a@x.com,b@y.com"
        />
        <div class="alert-rule-form__hint">依赖后端 mail.enabled=true；未启用时仅留痕不发送</div>
      </el-form-item>

      <el-form-item label="备注" prop="remark">
        <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="500" placeholder="请输入备注" />
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="alert-rule-form__footer">
        <el-button @click="visible = false">取 消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确 定</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts" name="AlertRuleForm">
import {
  ALERT_RULE_TYPE_OPTIONS,
  addAlertRule,
  getAlertRule,
  updateAlertRule
} from '@/api/databus/alert';
import type { DatabusAlertRuleBo } from '@/api/databus/alert/types';
import { useChainOptions } from '@/views/databus/editor/composables/useChainOptions';
import modal from '@/plugins/modal';

/**
 * 告警规则新增/编辑弹窗。父组件持 ref，调用 openDialog() 新增、openDialog(id) 编辑，成功后 emit('success')。
 */

const emit = defineEmits<{ (e: 'success'): void }>();

const visible = ref(false);
const detailLoading = ref(false);
const submitting = ref(false);
const formRef = ref<ElFormInstance>();

const buildInitFormData = (): DatabusAlertRuleBo => ({
  id: undefined,
  ruleName: '',
  chainCode: '',
  ruleType: 'CONSECUTIVE_FAILURE',
  windowMinutes: 5,
  thresholdCount: 3,
  thresholdRate: null,
  notifyEmails: '',
  enabled: 'Y',
  remark: ''
});

const form = ref<DatabusAlertRuleBo>(buildInitFormData());

/** 链路建议：共享 useChainOptions 缓存（与编辑器/执行记录页同源） */
const { chains: chainOptions, loading: chainLoading, ensure: ensureChainOptions } = useChainOptions(() => ({
  pageNum: 1,
  pageSize: 1000
}));

/** 联动校验：类型对应的阈值必填 */
const validateThreshold = (_rule: unknown, _value: unknown, callback: (error?: Error) => void) => {
  if (form.value.ruleType === 'CONSECUTIVE_FAILURE') {
    if (form.value.thresholdCount == null || form.value.thresholdCount <= 0) {
      callback(new Error('连续失败次数需大于 0'));
      return;
    }
  } else if (form.value.ruleType === 'SUCCESS_RATE') {
    const rate = form.value.thresholdRate;
    if (rate == null || rate === ('' as unknown) || Number(rate) < 0 || Number(rate) > 100) {
      callback(new Error('成功率下限需在 0-100 之间'));
      return;
    }
  }
  callback();
};

const rules = {
  ruleName: [
    { required: true, message: '规则名称不能为空', trigger: 'blur' },
    { max: 100, message: '规则名称长度不能超过100', trigger: 'blur' }
  ],
  chainCode: [{ required: true, message: '目标链路不能为空', trigger: 'change' }],
  ruleType: [{ required: true, message: '规则类型不能为空', trigger: 'change' }],
  windowMinutes: [{ required: true, message: '评估窗口不能为空', trigger: 'blur' }],
  thresholdCount: [{ validator: validateThreshold, trigger: 'blur' }],
  thresholdRate: [{ validator: validateThreshold, trigger: 'blur' }],
  notifyEmails: [
    { required: true, message: '通知邮箱不能为空', trigger: 'blur' },
    { max: 500, message: '通知邮箱长度不能超过500', trigger: 'blur' }
  ]
};

/** el-input #append 需手动把字符串写回 number；空串→undefined */
function handleNumberUpdate(field: 'windowMinutes' | 'thresholdCount' | 'thresholdRate', value: string) {
  if (value === '') {
    form.value[field] = undefined;
    return;
  }
  const num = Number(value);
  form.value[field] = Number.isNaN(num) ? undefined : num;
}

/** 切换类型时清空另一侧阈值，避免提交脏字段 */
function handleTypeChange() {
  if (form.value.ruleType === 'CONSECUTIVE_FAILURE') {
    form.value.thresholdRate = null;
    if (form.value.thresholdCount == null) {
      form.value.thresholdCount = 3;
    }
  } else {
    form.value.thresholdCount = null;
    if (form.value.thresholdRate == null) {
      form.value.thresholdRate = 95;
    }
  }
  formRef.value?.clearValidate(['thresholdCount', 'thresholdRate']);
}

async function openDialog(id?: number | string) {
  form.value = buildInitFormData();
  const isEdit = id !== undefined && id !== null && id !== '';
  visible.value = true;
  ensureChainOptions().catch(() => {});
  if (!isEdit) {
    return;
  }
  detailLoading.value = true;
  try {
    const { data } = await getAlertRule(id);
    form.value = { ...buildInitFormData(), ...data };
  } catch {
    // 错误提示由 request 拦截器统一弹出
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
        await updateAlertRule(form.value);
      } else {
        await addAlertRule(form.value);
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
.alert-rule-form {
  :deep(.el-dialog__header) {
    margin-right: 0;
  }

  :deep(.el-dialog__body) {
    padding-top: 8px;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  &__title {
    font-size: 16px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  &__enabled {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }

  &__body {
    :deep(.el-form-item) {
      margin-bottom: 14px;
    }

    :deep(.el-form-item__label) {
      padding-bottom: 4px;
      font-weight: 500;
      color: var(--el-text-color-primary);
      line-height: 1.5;
    }
  }

  &__chain,
  &__full {
    width: 100%;
  }

  &__input-with-unit {
    :deep(.el-input-group__append) {
      min-width: 52px;
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

  &__footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
}
</style>