<!--
  自定义组件新增/编辑弹窗（2026-10-06 重构，860px 单列四区，Linear 留白范式）：
  ① 身份区：编码（编辑禁改）/名称/短名/五分类/图标选择器/颜色选择器/描述
  ② 参数区：面板分组/节点类型/配置形态/排序 + 标签 + 参数字段可视化构造器（可折叠字段卡片，
     高级结构走 popover），可切「JSON 高级模式」直接编辑 {"fields":[...]}
  ③ 执行体区：脚本语言/正文/版本（第二步脚本宿主启用，本步灰态）
  ④ 高级折叠：配置示例/输入输出 schema/文档/废弃标记/备注
  双模式纪律：可视化为主模型实时序列化 paramSchema；JSON 模式解析失败不允许切回（不丢数据）。
-->
<template>
  <el-dialog
    v-model="visible"
    width="860px"
    append-to-body
    destroy-on-close
    :show-close="false"
    :close-on-click-modal="true"
    class="component-form"
  >
    <template #header>
      <div class="cf-header">
        <div class="cf-header__title-wrap">
          <span class="cf-header__title">{{ isEdit ? '编辑自定义组件' : '新增自定义组件' }}</span>
          <span class="cf-header__code">{{ form.componentCode || '未命名编码' }}</span>
        </div>
        <div class="cf-header__enabled" @click.stop>
          <el-switch
            v-model="form.status"
            active-value="0"
            inactive-value="1"
            inline-prompt
            active-text="启用"
            inactive-text="停用"
          />
        </div>
      </div>
    </template>

    <el-form ref="formRef" v-loading="detailLoading" :model="form" :rules="rules" label-position="top">
      <!-- ① 身份区 -->
      <div class="cf-section">
        <div class="cf-section__title">基础信息</div>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="组件编码" prop="componentCode">
              <el-input
                v-model="form.componentCode"
                maxlength="64"
                placeholder="字母开头，字母/数字/-/_，如 myAtom"
                :disabled="isEdit"
              />
              <div v-if="isEdit" class="cf-hint">编码被链路引用，创建后不可改；换码请删除重建。</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="组件名称" prop="componentName">
              <el-input v-model="form.componentName" maxlength="100" placeholder="用户可读名称，如 我的原子" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="短名（物料网格用，可留空）">
              <el-input v-model="form.shortName" maxlength="50" placeholder="缺省显示组件名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="台账分类" prop="category">
              <el-select v-model="form.category" placeholder="请选择分类" style="width: 100%">
                <el-option
                  v-for="item in CATEGORY_OPTIONS"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="图标（可搜索）">
              <icon-select v-model="iconValue" width="100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="面板颜色">
              <div class="cf-color">
                <el-color-picker v-model="form.color" color-format="hex" />
                <button
                  v-for="c in COLOR_PRESETS"
                  :key="c"
                  type="button"
                  class="cf-color__swatch"
                  :style="{ backgroundColor: c }"
                  :title="c"
                  @click="form.color = c"
                />
                <el-button link type="info" size="small" @click="form.color = ''">清空</el-button>
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="描述">
              <el-input
                v-model="form.description"
                type="textarea"
                :rows="2"
                maxlength="500"
                placeholder="一句话说明这个组件做什么"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </div>

      <!-- ② 参数区 -->
      <div class="cf-section">
        <div class="cf-section__title">参数配置</div>
        <el-row :gutter="16">
          <el-col :span="6">
            <el-form-item label="面板分组">
              <el-select v-model="form.groupName" placeholder="未分组" clearable style="width: 100%">
                <el-option
                  v-for="g in GROUP_OPTIONS"
                  :key="g.value"
                  :label="g.label"
                  :value="g.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="节点类型">
              <el-select
                v-model="form.nodeType"
                placeholder="普通节点"
                clearable
                :disabled="hasScriptArtifact"
                style="width: 100%"
              >
                <el-option
                  v-for="n in NODE_TYPE_OPTIONS"
                  :key="n.value"
                  :label="n.label"
                  :value="n.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="配置形态">
              <el-select
                v-model="form.editor"
                placeholder="表单配置"
                clearable
                :disabled="hasScriptArtifact"
                style="width: 100%"
              >
                <el-option
                  v-for="e in EDITOR_OPTIONS"
                  :key="e.value"
                  :label="e.label"
                  :value="e.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="排序">
              <el-input-number v-model="form.sort" :min="0" :max="9999" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="标签（可输入新建，回车添加）">
              <el-select
                v-model="form.tags"
                multiple
                filterable
                allow-create
                default-first-option
                collapse-tags
                collapse-tags-tooltip
                placeholder="如 HTTP、MES、回写"
                style="width: 100%"
              >
                <el-option v-for="t in tagSuggestions" :key="t" :label="t" :value="t" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 字段构造器 -->
        <div class="cf-fields">
          <div class="cf-fields__bar">
            <span class="cf-fields__bar-title">配置字段（{{ fieldRows.length }}）</span>
            <el-tag
              v-if="hasScriptArtifact"
              size="small"
              type="success"
              effect="plain"
              class="cf-fields__bar-tag"
            >
              由脚本 @DatabusProp 物化，只读
            </el-tag>
            <div v-if="!hasScriptArtifact" class="cf-fields__bar-tools">
              <el-button size="small" @click="addField">
                <el-icon><Plus /></el-icon>添加字段
              </el-button>
              <el-button size="small" @click="toggleJsonMode">
                {{ jsonMode ? '返回可视化编辑' : 'JSON 高级模式' }}
              </el-button>
            </div>
          </div>

          <!-- 可视化字段卡片 -->
          <template v-if="!jsonMode">
            <div v-if="parseHint" class="cf-hint cf-hint--warn">{{ parseHint }}</div>
            <div
              v-for="(f, idx) in fieldRows"
              :key="idx"
              class="field-card"
              :class="{ 'is-open': f.uiExpanded, 'is-readonly': hasScriptArtifact }"
            >
              <div class="field-card__head" @click="f.uiExpanded = !f.uiExpanded">
                <el-icon class="field-card__arrow"><ArrowRight /></el-icon>
                <span class="field-card__summary">
                  <b>{{ f.name || '未命名字段' }}</b>
                  <em v-if="f.label"> · {{ f.label }}</em>
                  <em> · {{ widgetLabel(f.widget) }}</em>
                  <em v-if="f.required" class="field-card__req"> · 必填</em>
                </span>
                <el-tag v-if="hasAdvanced(f)" size="small" type="warning" effect="plain">高级</el-tag>
                <span class="field-card__spacer" />
                <template v-if="!hasScriptArtifact">
                  <el-button
                    link
                    size="small"
                    :disabled="idx === 0"
                    @click.stop="moveField(idx, -1)"
                  >
                    <el-icon><ArrowUp /></el-icon>
                  </el-button>
                  <el-button
                    link
                    size="small"
                    :disabled="idx === fieldRows.length - 1"
                    @click.stop="moveField(idx, 1)"
                  >
                    <el-icon><ArrowDown /></el-icon>
                  </el-button>
                  <el-button link type="danger" size="small" @click.stop="removeField(idx)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </template>
              </div>
              <div v-show="f.uiExpanded" class="field-card__body">
                <el-row :gutter="12">
                  <el-col :span="8">
                    <el-form-item label="字段名" required>
                      <el-input v-model="f.name" maxlength="64" placeholder="如 url / headers" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="展示名">
                      <el-input v-model="f.label" maxlength="50" placeholder="表单上看到的名称" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="5">
                    <el-form-item label="控件" required>
                      <el-select v-model="f.widget" style="width: 100%">
                        <el-option
                          v-for="w in WIDGET_OPTIONS"
                          :key="w.value"
                          :label="w.label"
                          :value="w.value"
                        />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="3">
                    <el-form-item label="必填">
                      <el-switch v-model="f.required" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="24">
                    <el-form-item label="说明文案">
                      <el-input v-model="f.description" maxlength="200" placeholder="表单项下方小灰字（可留空）" />
                    </el-form-item>
                  </el-col>

                  <!-- SELECT/MULTISELECT 候选项 -->
                  <el-col v-if="isOptionWidget(f.widget)" :span="24">
                    <el-form-item label="候选项">
                      <div class="cf-options">
                        <div v-for="(opt, oi) in f.options" :key="oi" class="cf-options__row">
                          <el-input v-model="opt.label" placeholder="显示文案" maxlength="50" />
                          <el-input v-model="opt.value" placeholder="提交值" maxlength="100" />
                          <el-button link type="danger" @click="f.options!.splice(oi, 1)">
                            <el-icon><Delete /></el-icon>
                          </el-button>
                        </div>
                        <el-button size="small" plain @click="addOption(f)">
                          <el-icon><Plus /></el-icon>添加候选项
                        </el-button>
                      </div>
                    </el-form-item>
                  </el-col>

                  <el-col :span="24">
                    <el-popover :width="400" trigger="click" placement="bottom-start">
                      <template #reference>
                        <el-button size="small" plain :type="hasAdvanced(f) ? 'warning' : 'default'">
                          高级设置<el-tag v-if="hasAdvanced(f)" size="small" type="warning" effect="plain" round>
                            {{ advancedCount(f) }}
                          </el-tag>
                        </el-button>
                      </template>
                      <div class="cf-adv">
                        <div class="cf-adv__title">占位提示</div>
                        <el-input v-model="f.uiPlaceholder" maxlength="100" placeholder="输入框 placeholder（可留空）" />
                        <div class="cf-adv__title">表达式角色</div>
                        <el-select v-model="f.uiExprRole" style="width: 100%">
                          <el-option
                            v-for="r in EXPR_ROLE_OPTIONS"
                            :key="r.value || 'empty'"
                            :label="r.label"
                            :value="r.value"
                          />
                        </el-select>
                        <div class="cf-adv__title">
                          其余高级结构 JSON
                          <span class="cf-adv__sub">（order / showWhen / 嵌套 fields / keyWidget 等）</span>
                        </div>
                        <el-input
                          v-model="f.uiAdvanced"
                          type="textarea"
                          :rows="7"
                          placeholder='如 {"showWhen":[{"field":"x","eq":"y"}]}'
                          class="cf-adv__json"
                          :class="{ 'is-error': !!f.uiAdvError }"
                        />
                        <div v-if="f.uiAdvError" class="cf-hint cf-hint--error">{{ f.uiAdvError }}</div>
                      </div>
                    </el-popover>
                  </el-col>
                </el-row>
              </div>
            </div>
            <el-empty v-if="!fieldRows.length" description="还没有配置字段；点「添加字段」或切 JSON 模式" :image-size="60" />
          </template>

          <!-- JSON 高级模式 -->
          <template v-else>
            <div class="cf-fields__json-tools">
              <el-button size="small" @click="beautifySchemaJson">美化</el-button>
              <el-button size="small" @click="validateSchemaJson">校验</el-button>
              <span class="cf-hint">只装 schema 体：{'{"fields": [...]}'}；可视化模式不支持的嵌套结构在此保留。</span>
            </div>
            <el-input
              v-model="schemaJson"
              type="textarea"
              :rows="14"
              placeholder='{"fields":[]}'
              class="cf-fields__json"
            />
          </template>
        </div>
      </div>

      <!-- ③ 执行体区：新建态不可编（先存治理行）；编辑态且有 script:edit 权限开放 Java 脚本宿主 -->
      <div v-if="!isEdit" class="cf-section cf-section--locked">
        <div class="cf-section__title">
          执行体（脚本）
          <el-tag size="small" type="info" effect="plain">保存后开放</el-tag>
        </div>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="先完成基础信息保存；再次打开编辑后即可在此编写完整 Java 类源码，保存即编译、热更全局生效。"
          class="cf-locked-alert"
        />
      </div>
      <div v-else-if="canEditScript" class="cf-section">
        <div class="cf-section__title">
          执行体（Java 脚本）
          <el-tag size="small" :type="hasScriptArtifact ? 'success' : 'info'" effect="plain">
            {{ hasScriptArtifact ? `已发布 v${form.version ?? '-'}` : '尚未编写脚本' }}
          </el-tag>
          <span class="cf-section__spacer" />
          <el-button size="small" plain :disabled="!form.id" @click="openVersions">
            版本历史{{ hasScriptArtifact ? `（v${form.version ?? '-'} 最新）` : '' }}
          </el-button>
        </div>
        <el-alert
          type="warning"
          :closable="false"
          show-icon
          title="脚本等同服务端代码发布：保存即编译并立即全局生效，编译失败整体不落库、现网继续跑旧版。"
          class="cf-locked-alert"
        />
        <JavaCodeEditor
          v-model="scriptText"
          :diagnostics="compileDiagnostics"
          height="420px"
          placeholder="粘贴/编写完整 Java 类源码（统一包名 org.dromara.databus.script；@DatabusCmp 的 code 建议留空）"
        />
        <div v-if="compileDiagnostics.length" class="cf-diag">
          <div class="cf-diag__title">
            编译失败，{{ compileDiagnostics.length }} 处错误，本次未保存{{ compileMessage ? '：' + compileMessage : '' }}
          </div>
          <div v-for="(d, di) in compileDiagnostics" :key="di" class="cf-diag__row">
            <span v-if="d.line > 0" class="cf-diag__loc">[{{ d.line }}:{{ d.column }}]</span>
            <span class="cf-diag__msg">{{ d.message }}</span>
          </div>
        </div>
        <div class="cf-script-bar">
          <span class="cf-hint">契约字段（节点类型/配置形态/参数 schema）由脚本注解自动物化，保存脚本后上方参数区转只读。</span>
          <el-button type="primary" :loading="scriptSaving" @click="handleSaveScript">
            保存脚本并发布
          </el-button>
        </div>
      </div>

      <!-- ④ 高级折叠 -->
      <el-collapse class="cf-advanced">
        <el-collapse-item name="adv">
          <template #title>
            <span class="cf-advanced__title">高级：示例 / 输入输出 / 文档 / 废弃 / 备注</span>
          </template>
          <el-row :gutter="16">
            <el-col :span="24">
              <el-form-item label="配置示例（JSON，可留空）">
                <el-input
                  v-model="form.dataExample"
                  type="textarea"
                  :rows="3"
                  :disabled="hasScriptArtifact"
                  class="cf-mono"
                />
                <div v-if="hasScriptArtifact" class="cf-hint">库存脚本件的配置示例由脚本注解物化，随脚本保存更新。</div>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="输入 Schema（连线校验预留）">
                <el-input v-model="form.inputSchema" type="textarea" :rows="3" class="cf-mono" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="输出 Schema（连线校验预留）">
                <el-input v-model="form.outputSchema" type="textarea" :rows="3" class="cf-mono" />
              </el-form-item>
            </el-col>
            <el-col :span="24">
              <el-form-item label="文档链接">
                <el-input v-model="form.docUrl" maxlength="255" placeholder="wiki 锚点或 http(s) URL（可留空）" />
              </el-form-item>
            </el-col>
            <el-col :span="24">
              <el-form-item label="废弃管理">
                <div class="cf-deprecated">
                  <el-switch
                    v-model="form.deprecated"
                    active-value="1"
                    inactive-value="0"
                    active-text="标记废弃"
                    inactive-text="正常"
                  />
                  <el-input
                    v-if="form.deprecated === '1'"
                    v-model="form.deprecateNote"
                    maxlength="200"
                    placeholder="废弃说明/替代组件引导，面板与台账会置灰提示"
                    style="flex: 1"
                  />
                </div>
                <div class="cf-hint">废弃≠停用：废弃件在已发布链路仍可见可跑，只是面板提示别在新链路使用。</div>
              </el-form-item>
            </el-col>
            <el-col :span="24">
              <el-form-item label="备注">
                <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="500" placeholder="内部备注" />
              </el-form-item>
            </el-col>
          </el-row>
        </el-collapse-item>
      </el-collapse>
    </el-form>

    <template #footer>
      <div class="cf-footer">
        <el-button @click="visible = false">取 消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确 定</el-button>
      </div>
    </template>

    <ScriptVersionDrawer ref="versionDrawerRef" @rolled="handleRolled" />
  </el-dialog>
</template>

<script setup lang="ts">
import { ArrowDown, ArrowRight, ArrowUp, Delete, Plus } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { computed, ref } from 'vue';
import { addComponent, getComponent, saveScript, updateComponent } from '@/api/databus/component';
import type {
  DatabusComponentForm,
  ExprRole,
  PropOption,
  PropSchema,
  ScriptDiagnostic,
  WidgetKind
} from '@/api/databus/component/types';
import modal from '@/plugins/modal';
import { checkPermi } from '@/utils/permission';
import JavaCodeEditor from './JavaCodeEditor.vue';
import ScriptVersionDrawer from './ScriptVersionDrawer.vue';
import {
  CATEGORY_OPTIONS,
  EDITOR_OPTIONS,
  EXPR_ROLE_OPTIONS,
  GROUP_OPTIONS,
  NODE_TYPE_OPTIONS,
  OPTION_WIDGETS,
  WIDGET_OPTIONS,
  widgetLabel
} from './component-labels';

/** 字段构造器行：PropSchema 基础键可视化，uiPlaceholder/uiExprRole 结构化高级键，其余高级键存 JSON 文本 */
interface FieldRow extends PropSchema {
  uiExpanded: boolean;
  uiPlaceholder: string;
  uiExprRole: ExprRole | '';
  uiAdvanced: string;
  uiAdvError?: string;
}

const COLOR_PRESETS = [
  '#409eff',
  '#67c23a',
  '#e6a23c',
  '#f56c6c',
  '#909399',
  '#9b59b6',
  '#1abc9c',
  '#165dff'
];

/** 可视化直接编辑的基础键 + 结构化高级键；其余键全部归入高级 JSON */
const BASE_KEYS = ['name', 'label', 'widget', 'required', 'description', 'options'] as const;
const STRUCT_ADV_KEYS = ['placeholder', 'exprRole'] as const;
/** 纯前端行状态键，序列化时必须剔除，禁止进入 paramSchema */
const UI_KEYS = ['uiExpanded', 'uiPlaceholder', 'uiExprRole', 'uiAdvanced', 'uiAdvError'] as const;

const emit = defineEmits<{
  (e: 'success'): void;
}>();

const visible = ref(false);
const submitting = ref(false);
const detailLoading = ref(false);
const formRef = ref<FormInstance>();
const tagSuggestions = ref<string[]>([]);

const fieldRows = ref<FieldRow[]>([]);
const jsonMode = ref(false);
const schemaJson = ref('');
const parseHint = ref('');

/** 弹窗表单模型：治理列 + 回显用的脚本工件三列（提交治理时剔除，工件走独立保存端点） */
type ComponentFormModel = DatabusComponentForm & {
  scriptLang?: string | null;
  scriptBody?: string | null;
  version?: number | null;
};

const defaultForm = (): ComponentFormModel => ({
  componentCode: '',
  componentName: '',
  shortName: '',
  category: 'DATA',
  groupName: 'business',
  icon: '',
  color: '',
  sort: 100,
  description: '',
  tags: [],
  nodeType: 'NODE',
  editor: 'form',
  paramSchema: '',
  dataExample: '',
  inputSchema: '',
  outputSchema: '',
  scriptLang: '',
  scriptBody: '',
  version: null,
  status: '0',
  deprecated: '0',
  deprecateNote: '',
  docUrl: '',
  remark: ''
});

const form = ref<ComponentFormModel>(defaultForm());

/** 脚本执行体状态（独立保存，不随「确定」治理提交） */
const canEditScript = computed(() => checkPermi(['databus:component:script:edit']));
const scriptText = ref('');
const scriptSaving = ref(false);
const compileDiagnostics = ref<ScriptDiagnostic[]>([]);
const compileMessage = ref('');
/** 已存在脚本工件（script_body 非空）：契约四列被脚本物化正本接管，治理只读 */
const hasScriptArtifact = ref(false);
const versionDrawerRef = ref<InstanceType<typeof ScriptVersionDrawer>>();

/** icon-select 要求 string 入参，空值归一为空串 */
const iconValue = computed({
  get: () => form.value.icon ?? '',
  set: (v: string) => {
    form.value.icon = v || null;
  }
});

const isEdit = computed(() => form.value.id != null);

const rules: FormRules<DatabusComponentForm> = {
  componentCode: [
    { required: true, message: '组件编码不能为空', trigger: 'blur' },
    {
      pattern: /^[A-Za-z][A-Za-z0-9_-]{0,63}$/,
      message: '字母开头，仅含字母/数字/-/_，最长 64',
      trigger: 'blur'
    }
  ],
  componentName: [
    { required: true, message: '组件名称不能为空', trigger: 'blur' },
    { max: 100, message: '长度不超过 100 个字符', trigger: 'blur' }
  ],
  category: [{ required: true, message: '请选择台账分类', trigger: 'change' }]
};

function isOptionWidget(widget?: WidgetKind | string | null): boolean {
  return OPTION_WIDGETS.includes(widget as WidgetKind);
}

function hasAdvanced(f: FieldRow): boolean {
  return advancedCount(f) > 0;
}

function advancedCount(f: FieldRow): number {
  let n = 0;
  if (f.uiPlaceholder) {
    n++;
  }
  if (f.uiExprRole) {
    n++;
  }
  if (f.uiAdvanced.trim()) {
    n++;
  }
  return n;
}

function addOption(f: FieldRow) {
  if (!f.options) {
    f.options = [];
  }
  f.options.push({ label: '', value: '' });
}

function addField() {
  fieldRows.value.push({
    name: '',
    label: '',
    widget: 'TEXT',
    required: false,
    description: '',
    options: [],
    uiExpanded: true,
    uiPlaceholder: '',
    uiExprRole: '',
    uiAdvanced: ''
  });
}

function moveField(idx: number, delta: number) {
  const target = idx + delta;
  if (target < 0 || target >= fieldRows.value.length) {
    return;
  }
  const list = fieldRows.value;
  [list[idx], list[target]] = [list[target], list[idx]];
}

function removeField(idx: number) {
  fieldRows.value.splice(idx, 1);
}

/** PropSchema → 字段行：基础键可视化，占位/角色结构化，剩余键序列化成高级 JSON */
function toFieldRow(field: PropSchema): FieldRow {
  const rest: Record<string, unknown> = { ...field };
  for (const k of [...BASE_KEYS, ...STRUCT_ADV_KEYS, ...UI_KEYS]) {
    delete rest[k];
  }
  const hasRest = Object.keys(rest).length > 0;
  return {
    name: field.name ?? '',
    label: field.label ?? '',
    widget: field.widget ?? 'TEXT',
    required: !!field.required,
    description: field.description ?? '',
    options: isOptionWidget(field.widget) ? (field.options ?? []).map((o) => ({ ...o })) : [],
    uiExpanded: false,
    uiPlaceholder: field.placeholder ?? '',
    uiExprRole: (field.exprRole ?? '') as ExprRole | '',
    uiAdvanced: hasRest ? JSON.stringify(rest, null, 2) : ''
  };
}

/** 字段行 → PropSchema：高级 JSON 打底，结构化键覆盖，基础键最后正本序列化 */
function fromFieldRow(f: FieldRow): PropSchema {
  const out: PropSchema = { name: f.name, widget: f.widget };
  if (f.uiAdvanced.trim()) {
    Object.assign(out, JSON.parse(f.uiAdvanced));
  }
  if (f.uiPlaceholder.trim()) {
    out.placeholder = f.uiPlaceholder.trim();
  }
  if (f.uiExprRole) {
    out.exprRole = f.uiExprRole;
  }
  if (f.label) {
    out.label = f.label;
  }
  if (f.required) {
    out.required = true;
  }
  if (f.description) {
    out.description = f.description;
  }
  if (isOptionWidget(f.widget)) {
    const opts = (f.options ?? []).filter((o) => o.label.trim() && o.value.trim());
    if (opts.length) {
      out.options = opts.map((o) => ({ label: o.label.trim(), value: o.value.trim() }));
    }
  }
  return out;
}

function buildSchemaText(): string {
  return JSON.stringify({ fields: fieldRows.value.map(fromFieldRow) }, null, 2);
}

function parseSchemaIntoRows(raw: string): boolean {
  if (!raw.trim()) {
    fieldRows.value = [];
    return true;
  }
  let obj: { fields?: PropSchema[]; schema?: { fields?: PropSchema[] } };
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    parseHint.value = 'paramSchema 不是合法 JSON，已锁定 JSON 高级模式：' + (e as Error).message;
    return false;
  }
  const fields = obj?.fields ?? obj?.schema?.fields;
  if (!Array.isArray(fields)) {
    parseHint.value = '未找到 fields 数组，已锁定 JSON 高级模式（新形态应为 {"fields":[...]}）';
    return false;
  }
  fieldRows.value = fields.map(toFieldRow);
  return true;
}

function toggleJsonMode() {
  if (!jsonMode.value) {
    // 可视化 → JSON：先保证各字段高级 JSON 合法
    const invalid = fieldRows.value.find((f) => !validateAdvanced(f));
    if (invalid) {
      invalid.uiExpanded = true;
      ElMessage.error(`字段「${invalid.name || '未命名'}」的高级结构 JSON 不合法，请先修正`);
      return;
    }
    schemaJson.value = fieldRows.value.length ? buildSchemaText() : '';
    jsonMode.value = true;
  } else {
    // JSON → 可视化：解析失败留在 JSON 模式，绝不丢数据
    parseHint.value = '';
    if (!schemaJson.value.trim()) {
      fieldRows.value = [];
      jsonMode.value = false;
      return;
    }
    let obj: { fields?: PropSchema[]; schema?: { fields?: PropSchema[] } };
    try {
      obj = JSON.parse(schemaJson.value);
    } catch (e) {
      ElMessage.error('JSON 解析失败，保留在 JSON 模式：' + (e as Error).message);
      return;
    }
    const fields = obj?.fields ?? obj?.schema?.fields;
    if (!Array.isArray(fields)) {
      ElMessage.error('未找到 fields 数组，保留在 JSON 模式');
      return;
    }
    fieldRows.value = fields.map(toFieldRow);
    jsonMode.value = false;
  }
}

function validateAdvanced(f: FieldRow): boolean {
  if (!f.uiAdvanced.trim()) {
    f.uiAdvError = undefined;
    return true;
  }
  try {
    const parsed = JSON.parse(f.uiAdvanced);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      f.uiAdvError = '必须是 JSON 对象';
      return false;
    }
    f.uiAdvError = undefined;
    return true;
  } catch (e) {
    f.uiAdvError = (e as Error).message;
    return false;
  }
}

function validateSchemaJson(): boolean {
  if (!schemaJson.value.trim()) {
    ElMessage.success('空内容合法（无配置字段）');
    return true;
  }
  try {
    const parsed = JSON.parse(schemaJson.value);
    if (!Array.isArray(parsed?.fields)) {
      ElMessage.error('必须是 {"fields":[...]} 结构');
      return false;
    }
    ElMessage.success('JSON 合法');
    return true;
  } catch (e) {
    ElMessage.error('JSON 解析失败：' + (e as Error).message);
    return false;
  }
}

function beautifySchemaJson() {
  if (!schemaJson.value.trim()) {
    return;
  }
  try {
    schemaJson.value = JSON.stringify(JSON.parse(schemaJson.value), null, 2);
  } catch (e) {
    ElMessage.error('JSON 解析失败，无法美化：' + (e as Error).message);
  }
}

/** 校验 JSON 文本列：空串放行；非空必须是 JSON 值（对象/数组均可，schema 一般为对象） */
function validateJsonColumn(label: string, raw: string | null | undefined, mustObject = true): boolean {
  const text = (raw ?? '').trim();
  if (!text) {
    return true;
  }
  try {
    const parsed = JSON.parse(text);
    if (mustObject && (typeof parsed !== 'object' || parsed === null)) {
      ElMessage.error(`${label}必须是 JSON 对象`);
      return false;
    }
    return true;
  } catch (e) {
    ElMessage.error(`${label}不是合法 JSON：${(e as Error).message}`);
    return false;
  }
}

/** 新增；传 id 为编辑（拉详情回显），tagSuggestions 为台账已有标签聚合 */
async function open(id?: number, suggestions?: string[]) {
  tagSuggestions.value = suggestions ?? [];
  parseHint.value = '';
  jsonMode.value = false;
  fieldRows.value = [];
  schemaJson.value = '';
  scriptText.value = '';
  scriptSaving.value = false;
  compileDiagnostics.value = [];
  compileMessage.value = '';
  hasScriptArtifact.value = false;
  form.value = defaultForm();
  visible.value = true;
  if (id == null) {
    return;
  }
  await loadDetail(id);
}

/** 拉详情并回填（首次打开与脚本回滚后复用） */
async function loadDetail(id: number) {
  detailLoading.value = true;
  try {
    const { data } = await getComponent(id);
    form.value = {
      id: data.id,
      componentCode: data.componentCode,
      componentName: data.componentName,
      shortName: data.shortName ?? '',
      category: data.category,
      groupName: data.groupName ?? '',
      icon: data.icon ?? '',
      color: data.color ?? '',
      sort: data.sort ?? 100,
      description: data.description ?? '',
      tags: data.tags ?? [],
      nodeType: data.nodeType ?? 'NODE',
      editor: data.editor ?? 'form',
      paramSchema: data.paramSchema ?? '',
      dataExample: data.dataExample ?? '',
      inputSchema: data.inputSchema ?? '',
      outputSchema: data.outputSchema ?? '',
      scriptLang: data.scriptLang ?? '',
      scriptBody: data.scriptBody ?? '',
      version: data.version ?? null,
      status: data.status ?? '0',
      deprecated: data.deprecated ?? '0',
      deprecateNote: data.deprecateNote ?? '',
      docUrl: data.docUrl ?? '',
      remark: data.remark ?? ''
    };
    hasScriptArtifact.value = !!data.scriptBody;
    scriptText.value = data.scriptBody ?? '';
    compileDiagnostics.value = [];
    compileMessage.value = '';
    parseHint.value = '';
    jsonMode.value = false;
    if (!parseSchemaIntoRows(form.value.paramSchema ?? '')) {
      jsonMode.value = true;
      schemaJson.value = form.value.paramSchema ?? '';
    }
  } finally {
    detailLoading.value = false;
  }
}

/** 保存脚本：编译失败 success=false（诊断上行内标红+错误列表），不落库不弹全局错 */
async function handleSaveScript() {
  if (form.value.id == null || scriptSaving.value) {
    return;
  }
  if (!scriptText.value.trim()) {
    ElMessage.error('脚本正文不能为空');
    return;
  }
  scriptSaving.value = true;
  try {
    const { data } = await saveScript({
      id: form.value.id,
      scriptLang: 'java',
      scriptBody: scriptText.value
    });
    if (!data.success) {
      compileMessage.value = data.message || '编译失败';
      compileDiagnostics.value = data.diagnostics ?? [];
      return;
    }
    compileMessage.value = '';
    compileDiagnostics.value = [];
    hasScriptArtifact.value = true;
    form.value.version = data.version ?? form.value.version;
    form.value.scriptLang = data.scriptLang ?? 'java';
    form.value.scriptBody = scriptText.value;
    if (data.nodeType) {
      form.value.nodeType = data.nodeType;
    }
    if (data.editor) {
      form.value.editor = data.editor;
    }
    form.value.paramSchema = data.paramSchema ?? '';
    if (data.dataExample != null) {
      form.value.dataExample = data.dataExample;
    }
    // 物化 schema 必然合法；强制回到可视化只读字段列表
    jsonMode.value = false;
    schemaJson.value = '';
    parseHint.value = '';
    parseSchemaIntoRows(form.value.paramSchema ?? '');
    modal.msgSuccess(`脚本已保存发布（v${data.version}，物化字段 ${data.fieldCount ?? 0} 个），已全局热更`);
    emit('success');
  } finally {
    scriptSaving.value = false;
  }
}

function openVersions() {
  if (form.value.id == null) {
    return;
  }
  versionDrawerRef.value?.open(form.value.id, form.value.version);
}

/** 回滚产生新版本后：重拉详情同步正文/契约，并通知台账刷新合流态 */
async function handleRolled() {
  if (form.value.id != null) {
    await loadDetail(form.value.id);
  }
  emit('success');
}

async function handleSubmit() {
  if (!formRef.value) {
    return;
  }
  await formRef.value.validate();

  // 字段构造器校验
  if (jsonMode.value) {
    if (!schemaJson.value.trim()) {
      form.value.paramSchema = '';
    } else {
      if (!validateSchemaJson()) {
        return;
      }
      form.value.paramSchema = JSON.stringify(JSON.parse(schemaJson.value));
    }
  } else {
    for (const f of fieldRows.value) {
      if (!f.name.trim()) {
        f.uiExpanded = true;
        ElMessage.error('存在未填字段名的配置字段');
        return;
      }
      if (!f.widget) {
        f.uiExpanded = true;
        ElMessage.error(`字段「${f.name}」未选控件类型`);
        return;
      }
      if (!validateAdvanced(f)) {
        f.uiExpanded = true;
        ElMessage.error(`字段「${f.name}」的高级结构 JSON 不合法`);
        return;
      }
      if (isOptionWidget(f.widget)) {
        const bad = (f.options ?? []).some((o: PropOption) => !o.label.trim() || !o.value.trim());
        if (bad) {
          f.uiExpanded = true;
          ElMessage.error(`字段「${f.name}」存在文案或值为空的候选项`);
          return;
        }
      }
    }
    form.value.paramSchema = fieldRows.value.length ? JSON.stringify({ fields: fieldRows.value.map(fromFieldRow) }) : '';
  }

  // 高级区 JSON 列校验
  if (
    !validateJsonColumn('配置示例', form.value.dataExample, false) ||
    !validateJsonColumn('输入 Schema', form.value.inputSchema) ||
    !validateJsonColumn('输出 Schema', form.value.outputSchema)
  ) {
    return;
  }

  // 工件三列不走治理提交（脚本走独立保存端点；后端对库存件另有契约列保护）
  const { scriptLang: _lang, scriptBody: _body, version: _ver, ...payload } = form.value;
  submitting.value = true;
  try {
    if (isEdit.value) {
      await updateComponent(payload);
    } else {
      await addComponent(payload);
    }
    modal.msgSuccess(isEdit.value ? '修改成功' : '新增成功');
    visible.value = false;
    emit('success');
  } finally {
    submitting.value = false;
  }
}

defineExpose({ open });
</script>

<style lang="scss" scoped>
.cf-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.cf-header__title-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cf-header__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--el-text-color-primary, #1d2129);
}

.cf-header__code {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.cf-section {
  margin-bottom: 22px;

  & + & {
    border-top: 1px dashed var(--el-border-color-lighter, #ebeef5);
    padding-top: 18px;
  }
}

.cf-section--locked {
  opacity: 0.92;
}

.cf-section__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  color: var(--el-text-color-primary, #1d2129);
  margin-bottom: 14px;
  padding-left: 9px;
  border-left: 3px solid var(--el-color-primary);
  line-height: 15px;
}

.cf-hint {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);

  &--warn {
    color: var(--el-color-warning, #e6a23c);
  }

  &--error {
    color: var(--el-color-danger, #f56c6c);
  }
}

.cf-color {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.cf-color__swatch {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  cursor: pointer;
  padding: 0;
  transition: transform 0.15s;

  &:hover {
    transform: scale(1.12);
  }
}

.cf-locked-alert {
  margin-bottom: 14px;
}

.cf-section__spacer {
  flex: 1;
}

// 脚本执行体
.cf-diag {
  margin-top: 10px;
  border: 1px solid var(--el-color-danger-light-5, #fab6b6);
  border-radius: 8px;
  background: var(--el-color-danger-light-9, #fef0f0);
  padding: 10px 12px;
  max-height: 200px;
  overflow-y: auto;
}

.cf-diag__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-danger, #f56c6c);
  margin-bottom: 6px;
}

.cf-diag__row {
  display: flex;
  gap: 8px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-regular, #363b41);
}

.cf-diag__loc {
  flex-shrink: 0;
  font-family: 'JetBrains Mono', Consolas, monospace;
  color: var(--el-color-danger, #f56c6c);
  font-weight: 600;
}

.cf-script-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
}

.cf-fields__bar-tag {
  margin-right: auto;
}

// 库存脚本件：物化字段卡片正文只读（头部仍可展开查看）
.field-card.is-readonly .field-card__body {
  pointer-events: none;
  opacity: 0.85;
}

// 字段构造器
.cf-fields {
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--el-fill-color-blank, #fff);
}

.cf-fields__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.cf-fields__bar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary, #1d2129);
}

.cf-fields__bar-tools {
  display: flex;
  gap: 8px;
}

.cf-fields__json-tools {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.cf-mono,
.cf-fields__json,
.cf-adv__json {
  :deep(.el-textarea__inner) {
    font-family: 'JetBrains Mono', Consolas, monospace;
    font-size: 12px;
    line-height: 1.6;
  }
}

.cf-adv__json.is-error :deep(.el-textarea__inner) {
  border-color: var(--el-color-danger, #f56c6c);
}

.field-card {
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 8px;
  margin-bottom: 8px;
  background: var(--el-fill-color-blank, #fff);
  transition: border-color 0.2s;

  &.is-open {
    border-color: var(--el-color-primary-light-5, #a0cfff);
  }
}

.field-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  cursor: pointer;
  user-select: none;
}

.field-card__arrow {
  transition: transform 0.2s;
}

.field-card.is-open .field-card__arrow {
  transform: rotate(90deg);
}

.field-card__summary {
  font-size: 13px;
  color: var(--el-text-color-regular, #363b41);
  font-style: normal;

  b {
    font-family: 'JetBrains Mono', Consolas, monospace;
    color: var(--el-text-color-primary, #1d2129);
  }

  em {
    font-style: normal;
    color: var(--el-text-color-secondary);
  }
}

.field-card__req {
  color: var(--el-color-danger, #f56c6c) !important;
}

.field-card__spacer {
  flex: 1;
}

.field-card__body {
  padding: 4px 14px 8px;
  border-top: 1px dashed var(--el-border-color-lighter, #ebeef5);

  :deep(.el-form-item) {
    margin-bottom: 12px;
  }
}

.cf-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.cf-options__row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cf-adv {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cf-adv__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary, #1d2129);
  margin-top: 6px;
}

.cf-adv__sub {
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.cf-deprecated {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.cf-advanced {
  border-top: 1px dashed var(--el-border-color-lighter, #ebeef5);
  margin-top: 4px;

  :deep(.el-collapse-item__header) {
    border: none;
    height: 38px;
  }

  :deep(.el-collapse-item__wrap) {
    border: none;
  }
}

.cf-advanced__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.cf-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
