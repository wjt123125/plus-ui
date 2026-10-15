<!--
  告警规则新增/编辑弹窗（多渠道通知版）。
  - 规则类型决定阈值字段：连续失败填「次数阈值」，成功率低于阈值填「下限百分比」，切换时清空另一侧避免脏数据。
  - 通知渠道多选（EMAIL/WEBHOOK/CHAIN），勾选哪个渠道就出现哪个渠道的子表单；提交时组装 notify_config JSON。
  - CHAIN 执行参数按链路 input_params 动态生成表单（text→输入框/number→数字/boolean→开关/object·array→JSON 文本域），
    声明外参数走「附加参数」键值对兜底；切链路时旧值双向分流不丢（命中声明升格、不再命中降级为附加行）；
    defaultValue 只做占位提示不预填（后端语义「真实执行不注入」，预填会把默认值固化进规则）；
    另设「以 JSON 编辑」导入通道（JsonCodeEditor）：表单是唯一真值源，JSON 视图展开带出当前值、「应用到表单」
    parse 后按声明分流回写并收起，切链路自动收起防脱节。
  - 编辑回显走 GET /databus/alert/rule/{id}（列表行字段不全，避免用列表行回填）。

  UI 范式（2026-10-14 对齐 ConnectionForm 的 Vercel/Linear 极简留白）：
    - 弹窗 520px + modal-class 假无遮罩；label-position="top"
    - el-tabs 3 分组压缩高度：基础（触发条件）/ 通知（渠道+子表单）/ 高级（备注）
    - header：标题前状态点（绿=启用/灰=停用）+ 右上角 enabled 开关，去掉文字标签
    - 校验失败时按第一个失败字段自动切到所在 tab，避免错误藏在不可见分组里
    - Webhook 签名密钥用 mono 字体（credential 处理，对齐连接表单 Secret）
-->
<template>
  <el-dialog
    v-model="visible"
    width="520px"
    append-to-body
    destroy-on-close
    :show-close="false"
    :close-on-click-modal="true"
    modal-class="alert-rule-form-mask"
    class="alert-rule-form"
  >
    <template #header>
      <div class="alert-rule-form__header">
        <div class="alert-rule-form__title-wrap">
          <span class="alert-rule-form__rule">
            <el-tooltip
              :content="form.enabled === 'Y' ? '已启用' : '已停用'"
              placement="top"
              :show-after="200"
            >
              <span
                class="alert-rule-form__status-dot"
                :class="form.enabled === 'Y' ? 'is-enabled' : 'is-disabled'"
                aria-hidden="true"
              />
            </el-tooltip>
            {{ form.id ? '编辑告警规则' : '新增告警规则' }}
          </span>
        </div>
        <div class="alert-rule-form__enabled" @click.stop>
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
      <el-tabs v-model="activeTab" class="alert-rule-form__tabs">
        <el-tab-pane label="基础" name="basic">
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
        </el-tab-pane>

        <el-tab-pane label="通知" name="notify">
          <el-form-item label="通知渠道" prop="notifyType">
            <el-checkbox-group v-model="notifyTypes" class="alert-rule-form__channels" @change="handleChannelsChange">
              <el-checkbox v-for="item in ALERT_NOTIFY_TYPE_OPTIONS" :key="item.value" :value="item.value">
                {{ item.label }}
              </el-checkbox>
            </el-checkbox-group>
            <div class="alert-rule-form__hint">触发与恢复都会通知；可多渠道同时发送</div>
          </el-form-item>

          <el-form-item v-if="notifyTypes.includes('EMAIL')" label="收件邮箱" prop="notifyType">
            <el-input v-model="emailConfig.emails" maxlength="500" placeholder="多个用逗号分隔，如 a@x.com,b@y.com" />
            <div class="alert-rule-form__hint">依赖后端 mail.enabled=true；未启用时该渠道仅留痕不发送</div>
          </el-form-item>

          <template v-if="notifyTypes.includes('WEBHOOK')">
            <el-form-item label="回调地址" prop="notifyType">
              <el-input v-model="webhookConfig.url" maxlength="500" placeholder="https://example.com/alert" />
              <div class="alert-rule-form__hint">告警事件以 JSON POST 到该地址（连接 5s / 读取 10s 超时）</div>
            </el-form-item>
            <el-form-item label="签名密钥（可选）" prop="notifyType" class="alert-rule-form__credential">
              <el-input
                v-model="webhookConfig.secret"
                type="password"
                show-password
                maxlength="200"
                placeholder="留空不签名"
              />
              <div class="alert-rule-form__hint">配置后请求头 X-Databus-Signature = HMAC-SHA256(请求体, 密钥)</div>
            </el-form-item>
          </template>

          <el-form-item v-if="notifyTypes.includes('CHAIN')" label="通知链路" prop="notifyType">
            <el-select
              v-model="chainConfig.chainCode"
              filterable
              allow-create
              default-first-option
              class="alert-rule-form__chain"
              :loading="chainLoading"
              placeholder="选择告警时要执行的链路"
            >
              <el-option
                v-for="c in chainOptions"
                :key="String(c.id)"
                :label="`${c.chainName}（#${c.chainCode}）`"
                :value="c.chainCode"
              />
            </el-select>
            <div class="alert-rule-form__hint">
              告警时异步执行该链路（入参=告警事件 JSON + 下方执行参数补空位），链路内可做任意告警动作；通知链自身的执行不参与告警评估，不会死循环
            </div>
          </el-form-item>

          <!-- 链路声明入参：按 input_params 动态生成（列表数据即带 inputParams，无需二次拉详情） -->
          <template v-if="notifyTypes.includes('CHAIN')">
            <el-form-item v-for="def in rootParamDefs" :key="def.key" prop="notifyType">
              <template #label>
                {{ def.key }}<span v-if="def.required" class="alert-rule-form__req-star" aria-hidden="true">*</span>
              </template>
              <el-input-number
                v-if="def.type === 'number'"
                v-model="paramValues[def.key]"
                :controls="false"
                class="alert-rule-form__param-num"
                :placeholder="def.placeholder"
              />
              <el-switch v-else-if="def.type === 'boolean'" v-model="paramValues[def.key]" />
              <el-input
                v-else-if="def.type === 'object' || def.type === 'array'"
                v-model="paramValues[def.key]"
                type="textarea"
                :rows="2"
                class="alert-rule-form__credential"
                :placeholder="def.placeholder ?? (def.type === 'array' ? '[]' : '{}')"
              />
              <el-input v-else v-model="paramValues[def.key]" :placeholder="def.placeholder" />
            </el-form-item>
          </template>

          <el-form-item v-if="notifyTypes.includes('CHAIN')" label="附加参数（可选）" prop="notifyType">
            <div class="alert-rule-form__extra">
              <div v-for="(row, i) in extraParams" :key="i" class="alert-rule-form__extra-row">
                <el-input v-model="row.key" placeholder="参数名" class="alert-rule-form__extra-key" />
                <el-input
                  v-model="row.value"
                  class="alert-rule-form__extra-value"
                  placeholder='值；对象写 JSON，如 {"password":"x"}'
                />
                <el-button link type="danger" class="alert-rule-form__extra-del" @click="extraParams.splice(i, 1)">删除</el-button>
              </div>
              <!-- 操作行：左下增量加行，右下切 JSON 导入视图 -->
              <div class="alert-rule-form__extra-actions">
                <el-button link type="primary" :underline="false" @click="addExtraParam">+ 添加参数</el-button>
                <el-button link type="primary" :underline="false" @click="toggleJsonEdit">
                  <el-icon><Fold v-if="jsonEditVisible" /><EditPen v-else /></el-icon>
                  {{ jsonEditVisible ? '收起' : 'JSON' }}
                </el-button>
              </div>
              <!-- JSON 导入视图：表单是唯一真值源，此处仅作粘贴/批量编辑的导入视图（ManualExecuteDialog 同款编辑器） -->
              <template v-if="jsonEditVisible">
                <JsonCodeEditor
                  v-model="jsonParamsText"
                  height="160px"
                  placeholder='{"mailTo":"a@x.com","mailSubject":"【告警】{{ $.ruleName }}"}'
                />
                <div class="alert-rule-form__json-actions">
                  <el-button size="small" type="primary" @click="applyJsonToForm">应用到表单</el-button>
                  <span class="alert-rule-form__hint">应用时按链路声明自动分流到上方表单；收起丢弃未应用的编辑</span>
                </div>
              </template>
            </div>
            <div v-if="nestedParamPaths.length" class="alert-rule-form__hint">
              本链路另有嵌套入参 {{ nestedParamPaths.join('、') }}：params 只补顶层键，请在附加参数以对象值补齐（键取首段，如 $.request.password → 参数名 request、值 {"password":"x"}）
            </div>
            <div class="alert-rule-form__hint" v-pre>
              执行参数合并进告警事件根部（事件字段优先，只补空位）；值支持 {{ $.ruleName }} 这类模板对事件求值
            </div>
          </el-form-item>
        </el-tab-pane>

        <el-tab-pane label="高级" name="advanced">
          <el-form-item label="备注" prop="remark">
            <el-input v-model="form.remark" type="textarea" :rows="6" maxlength="500" placeholder="请输入备注" />
          </el-form-item>
        </el-tab-pane>
      </el-tabs>
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
import { EditPen, Fold } from '@element-plus/icons-vue';
import {
  ALERT_NOTIFY_TYPE_OPTIONS,
  ALERT_RULE_TYPE_OPTIONS,
  addAlertRule,
  getAlertRule,
  updateAlertRule
} from '@/api/databus/alert';
import type { AlertNotifyConfig, DatabusAlertRuleBo } from '@/api/databus/alert/types';
import type { ChainInputType } from '@/api/databus/chain/types';
import { useChainOptions } from '@/views/databus/editor/composables/useChainOptions';
import JsonCodeEditor from '@/views/databus/editor/components/common/JsonCodeEditor.vue';
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
  notifyType: 'EMAIL',
  notifyConfig: '',
  enabled: 'Y',
  remark: ''
});

const form = ref<DatabusAlertRuleBo>(buildInitFormData());

/** 当前激活的 tab；openDialog 时重置到「基础」，避免上次切到别的 tab 后新增仍停留原地 */
const activeTab = ref<'basic' | 'notify' | 'advanced'>('basic');

/** 字段 → tab 映射：校验失败时按第一个失败字段自动切 tab */
const TAB_OF_FIELD: Record<string, 'basic' | 'notify' | 'advanced'> = {
  ruleName: 'basic',
  chainCode: 'basic',
  ruleType: 'basic',
  windowMinutes: 'basic',
  thresholdCount: 'basic',
  thresholdRate: 'basic',
  notifyType: 'notify',
  remark: 'advanced'
};

/* ------------------------------ 通知渠道子表单状态 ------------------------------ */

const notifyTypes = ref<string[]>(['EMAIL']);
const emailConfig = reactive({ emails: '' });
const webhookConfig = reactive({ url: '', secret: '' });
const chainConfig = reactive({ chainCode: '' });

/* --------------------- CHAIN 执行参数：按链路 input_params 动态表单 --------------------- */

/** 链路建议：共享 useChainOptions 缓存（与编辑器/执行记录页同源）；列表数据即带 inputParams */
const { chains: chainOptions, loading: chainLoading, ensure: ensureChainOptions } = useChainOptions(() => ({
  pageNum: 1,
  pageSize: 1000
}));

/**
 * 声明参数值：键=根级参数名（$.mailTo → mailTo）。
 * number/boolean 存原生值，object/array 存 JSON 文本（提交时 parse）；
 * boolean 未触碰 = undefined 不提交，动了（true/false）即提交。
 */
const paramValues = reactive<Record<string, any>>({});
/** 附加参数行：链路未声明的顶层键；值文本提交时尝试 JSON 解析（失败按原字符串） */
const extraParams = reactive<{ key: string; value: string }[]>([]);
/** JSON 导入区：展开时从表单真值源带出当前执行参数；应用时 parse 后按声明分流回写 */
const jsonEditVisible = ref(false);
const jsonParamsText = ref('');

interface RootParamDef {
  key: string;
  type: ChainInputType;
  required: boolean;
  /** defaultValue 只做占位提示（后端语义「真实执行不注入」），不预填固化进规则 */
  placeholder?: string;
}

/** 当前选中链路的入参声明（listChain 返回数据即带 inputParams，无需二次拉详情） */
const chainParamDefs = computed(() => {
  const chain = chainOptions.value.find((c) => c.chainCode === chainConfig.chainCode);
  return chain?.inputParams ?? [];
});

/** 根级单段声明（$.key）生成控件；嵌套 path（$.a.b）params 顶层补不了，提示走附加参数 */
const rootParamDefs = computed<RootParamDef[]>(() => {
  const defs: RootParamDef[] = [];
  for (const d of chainParamDefs.value) {
    const path = (d.path ?? '').trim();
    if (!/^\$\.[^.[\]]+$/.test(path)) continue;
    const dv = d.defaultValue;
    defs.push({
      key: path.slice(2),
      type: d.type ?? 'text',
      required: !!d.required,
      placeholder:
        dv == null || dv === '' ? undefined : `默认 ${typeof dv === 'string' ? dv : JSON.stringify(dv)}`
    });
  }
  return defs;
});

/** 嵌套入参声明：params 只补顶层键，需在附加参数以对象值补齐（键取首段） */
const nestedParamPaths = computed(() =>
  chainParamDefs.value
    .map((d) => (d.path ?? '').trim())
    .filter((p) => p && !/^\$\.[^.[\]]+$/.test(p))
);

/**
 * 声明变化时双向分流（数据不丢）：
 * - 附加参数行命中新声明 → 升级为声明参数（编辑回显先拆进附加行、链路列表后到时自动归位；切回填过的链路）
 * - 声明参数不再命中 → 降级为附加参数行（切链路时保留用户已填的值）
 * JSON 导入区的「应用到表单」也走这里完成归位。
 */
function redistributeParams() {
  const defs = rootParamDefs.value;
  const keys = new Set(defs.map((d) => d.key));
  const typeOf = (k: string) => defs.find((d) => d.key === k)?.type;
  for (let i = extraParams.length - 1; i >= 0; i--) {
    const row = extraParams[i];
    if (keys.has(row.key)) {
      paramValues[row.key] = upgradeParamText(row.value, typeOf(row.key));
      extraParams.splice(i, 1);
    }
  }
  for (const k of Object.keys(paramValues)) {
    if (!keys.has(k)) {
      const text = formatParamText(paramValues[k]);
      if (text !== '') extraParams.push({ key: k, value: text });
      delete paramValues[k];
    }
  }
}

watch(rootParamDefs, () => {
  // 切链路（或链路列表迟到导致声明变化）时收起 JSON 导入区，避免 JSON 视图与新声明脱节（未应用编辑随之丢弃）
  jsonEditVisible.value = false;
  redistributeParams();
});

/** 附加参数行文本 → 声明参数容器值：number/boolean 还原原生类型，其余保留文本（object/array 提交时 parse） */
function upgradeParamText(text: string, type?: ChainInputType): unknown {
  const t = text.trim();
  if (type === 'number') {
    const n = Number(t);
    return t !== '' && !Number.isNaN(n) ? n : text;
  }
  if (type === 'boolean' && (t === 'true' || t === 'false')) {
    return t === 'true';
  }
  return text;
}

/** 声明参数容器值 → 附加参数行文本：object/array 本就是 JSON 文本原样返回 */
function formatParamText(value: unknown): string {
  if (value == null) return '';
  return typeof value === 'string' ? value : String(value);
}

function addExtraParam() {
  extraParams.push({ key: '', value: '' });
}

/** 附加参数值文本尝试 JSON 解析（对象/数字/布尔），失败按原字符串 */
function tryParseJsonText(text: string): unknown {
  if (!text) return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** 从 notify_config JSON 回填各渠道子表单（容错：脏数据忽略该渠道） */
function parseNotifyConfig(raw?: string | null): AlertNotifyConfig {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as AlertNotifyConfig;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function syncChannelState(notifyType: string, notifyConfig?: string | null) {
  notifyTypes.value = (notifyType ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const config = parseNotifyConfig(notifyConfig);
  emailConfig.emails = config.EMAIL?.emails ?? '';
  webhookConfig.url = config.WEBHOOK?.url ?? '';
  webhookConfig.secret = config.WEBHOOK?.secret ?? '';
  chainConfig.chainCode = config.CHAIN?.chainCode ?? '';
  // 重置执行参数；params 先统一拆进附加行，命中链路声明的由 watch(rootParamDefs) 自动升级归位
  // （链路列表可能晚于详情到达，双向分流对两种时序都成立）
  Object.keys(paramValues).forEach((k) => delete paramValues[k]);
  extraParams.splice(0);
  Object.entries((config.CHAIN?.params ?? {}) as Record<string, unknown>).forEach(([k, v]) => {
    extraParams.push({ key: k, value: typeof v === 'string' ? v : JSON.stringify(v) });
  });
}

/** 表单真值源 → 提交用 params 对象（声明参数非空值 + 附加参数；object/array 值 parse 回原生） */
function buildParamsObject(): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const def of rootParamDefs.value) {
    const v = paramValues[def.key];
    if (v === undefined || v === null || v === '') continue;
    if (def.type === 'object' || def.type === 'array') {
      // JSON 合法性已在 validateNotifyChannels 拦截，这里 parse 兜底
      params[def.key] = tryParseJsonText(String(v));
    } else {
      params[def.key] = v;
    }
  }
  for (const row of extraParams) {
    const key = row.key.trim();
    if (!key) continue;
    params[key] = tryParseJsonText(row.value.trim());
  }
  return params;
}

/** JSON 导入区开关：展开时从表单真值源带出当前执行参数（pretty）；收起丢弃未应用的编辑 */
function toggleJsonEdit() {
  jsonEditVisible.value = !jsonEditVisible.value;
  if (jsonEditVisible.value) {
    const params = buildParamsObject();
    jsonParamsText.value = Object.keys(params).length ? JSON.stringify(params, null, 2) : '';
  }
}

/** JSON 应用到表单：parse 成对象后清空表单侧、统一拆进附加行、再按声明分流归位（与编辑回显同一条路） */
function applyJsonToForm() {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonParamsText.value);
  } catch {
    modal.msgError('执行参数 JSON 不合法');
    return;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    modal.msgError('执行参数须为 JSON 对象');
    return;
  }
  Object.keys(paramValues).forEach((k) => delete paramValues[k]);
  extraParams.splice(0);
  Object.entries(parsed as Record<string, unknown>).forEach(([k, v]) => {
    extraParams.push({ key: k, value: typeof v === 'string' ? v : JSON.stringify(v) });
  });
  redistributeParams();
  jsonEditVisible.value = false;
  modal.msgSuccess('执行参数已应用到表单');
}

/** 提交前组装 notify_type（逗号串）与 notify_config（仅含勾选渠道） */
function buildNotifyPayload() {
  form.value.notifyType = notifyTypes.value.join(',');
  const config: AlertNotifyConfig = {};
  if (notifyTypes.value.includes('EMAIL')) {
    config.EMAIL = { emails: emailConfig.emails.trim() };
  }
  if (notifyTypes.value.includes('WEBHOOK')) {
    config.WEBHOOK = { url: webhookConfig.url.trim(), secret: webhookConfig.secret.trim() || undefined };
  }
  if (notifyTypes.value.includes('CHAIN')) {
    const params = buildParamsObject();
    config.CHAIN = {
      chainCode: chainConfig.chainCode.trim(),
      ...(Object.keys(params).length ? { params } : {})
    };
  }
  form.value.notifyConfig = JSON.stringify(config);
}

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

/** 渠道联动校验：至少一个渠道，且每个勾选渠道的必需参数已填 */
const validateNotifyChannels = (_rule: unknown, _value: unknown, callback: (error?: Error) => void) => {
  if (notifyTypes.value.length === 0) {
    callback(new Error('至少选择一个通知渠道'));
    return;
  }
  if (notifyTypes.value.includes('EMAIL') && !emailConfig.emails.trim()) {
    callback(new Error('邮件渠道需填写收件邮箱'));
    return;
  }
  if (notifyTypes.value.includes('WEBHOOK') && !webhookConfig.url.trim()) {
    callback(new Error('Webhook 渠道需填写回调地址'));
    return;
  }
  if (notifyTypes.value.includes('CHAIN')) {
    if (!chainConfig.chainCode.trim()) {
      callback(new Error('通知链路渠道需选择链路'));
      return;
    }
    // 声明参数：required 必填（与执行期 InputParamValidator 同源声明）、类型校验
    for (const def of rootParamDefs.value) {
      const v = paramValues[def.key];
      if (def.required && (v === undefined || v === null || v === '')) {
        callback(new Error(`执行参数 ${def.key} 为链路必填入参`));
        return;
      }
      if (def.type === 'number' && v !== undefined && v !== null && v !== '' && Number.isNaN(Number(v))) {
        callback(new Error(`执行参数 ${def.key} 须为数字`));
        return;
      }
      if ((def.type === 'object' || def.type === 'array') && typeof v === 'string' && v.trim()) {
        try {
          const parsed = JSON.parse(v);
          const ok = def.type === 'array' ? Array.isArray(parsed) : typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
          if (!ok) {
            callback(new Error(`执行参数 ${def.key} 须为 ${def.type === 'array' ? 'JSON 数组' : 'JSON 对象'}`));
            return;
          }
        } catch {
          callback(new Error(`执行参数 ${def.key} 不是合法 JSON`));
          return;
        }
      }
    }
    // 附加参数：键非空、不与已填值的声明参数/已有附加重复（全空行忽略；声明参数空值不提交故不冲突）
    const seen = new Set(
      rootParamDefs.value
        .filter((d) => {
          const v = paramValues[d.key];
          return v !== undefined && v !== null && v !== '';
        })
        .map((d) => d.key)
    );
    for (const row of extraParams) {
      if (!row.key.trim() && !row.value.trim()) continue;
      const key = row.key.trim();
      if (!key) {
        callback(new Error('附加参数的参数名不能为空'));
        return;
      }
      if (seen.has(key)) {
        callback(new Error(`附加参数 ${key} 与已有执行参数重复`));
        return;
      }
      seen.add(key);
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
  notifyType: [{ validator: validateNotifyChannels, trigger: 'change' }]
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

/** 渠道勾选变化后重校验（清掉切换时的残留错误） */
function handleChannelsChange() {
  formRef.value?.clearValidate('notifyType');
  formRef.value?.validateField('notifyType').catch(() => {});
}

async function openDialog(id?: number | string) {
  form.value = buildInitFormData();
  syncChannelState('EMAIL', '');
  activeTab.value = 'basic';
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
    syncChannelState(data.notifyType, data.notifyConfig);
  } catch {
    // 错误提示由 request 拦截器统一弹出
    visible.value = false;
  } finally {
    detailLoading.value = false;
  }
}

function handleSubmit() {
  formRef.value?.validate(async (valid: boolean, invalidFields?: Record<string, unknown>) => {
    if (!valid) {
      // 错误字段可能在非当前 tab，按第一个失败字段切过去让用户看见
      const firstField = Object.keys(invalidFields ?? {})[0];
      const targetTab = firstField ? TAB_OF_FIELD[firstField] : undefined;
      if (targetTab) {
        activeTab.value = targetTab;
      }
      return;
    }
    buildNotifyPayload();
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

  &__rule {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    letter-spacing: 0.1px;
  }

  &__status-dot {
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
    :deep(.el-input__inner),
    :deep(.el-textarea__inner) {
      font-family: var(--el-font-family-mono, 'JetBrains Mono', Menlo, Monaco, Consolas, monospace);
      letter-spacing: 0.2px;
    }
  }

  &__chain,
  &__full {
    width: 100%;
  }

  &__param-num {
    width: 100%;
  }

  &__req-star {
    margin-left: 2px;
    color: var(--el-color-danger);
  }

  &__extra {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__extra-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__extra-key {
    flex: 0 0 40%;
  }

  &__extra-value {
    flex: 1;
    min-width: 0;
  }

  &__extra-del {
    flex: none;
    padding: 0 4px;
  }

  &__extra-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .el-button + .el-button {
      margin-left: 0;
    }
  }

  &__json-actions {
    display: flex;
    align-items: center;
    gap: 12px;

    .alert-rule-form__hint {
      margin: 0;
    }
  }

  &__channels {
    width: 100%;

    :deep(.el-checkbox) {
      margin-right: 24px;
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
      /* 以最高的「基础」tab 实际高度为基准兜底：切 tab 弹窗高度不再跳变
        （勾满 CHAIN 的通知 tab 内容更高属正常撑开，常规切换不缩放） */
      min-height: 352px;

      .el-form-item:last-child {
        margin-bottom: 0;
      }
    }
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
}
</style>

<style>
/* 假无遮罩:保留 modal 元素以拦截外部点击(close-on-click-modal 生效),但背景透明看起来像无遮罩。
   class 名特定(alert-rule-form-mask),不影响其他 dialog。 */
.alert-rule-form-mask {
  background: transparent;
}
</style>
