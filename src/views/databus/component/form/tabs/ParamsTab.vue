<!-- ③ 参数 Tab：节点类型/配置形态 + 配置字段可视化构造器（高级结构 popover，可切 JSON 高级模式） -->
<template>
  <el-tab-pane name="params">
    <template #label>
      <TabLabel title="参数" :invalid="invalid" />
    </template>
    <el-form-item label="节点类型">
      <el-select
        v-model="form.nodeType"
        placeholder="普通节点"
        clearable
        :disabled="hasArtifact"
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
    <el-form-item label="配置形态">
      <el-select
        v-model="form.editor"
        placeholder="表单配置"
        clearable
        :disabled="hasArtifact"
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

    <!-- 字段构造器 -->
    <div class="cf-fields">
      <div class="cf-fields__bar">
        <span class="cf-fields__bar-title">配置字段（{{ fieldRows.length }}）</span>
        <el-tag
          v-if="hasArtifact"
          size="small"
          type="success"
          effect="plain"
          class="cf-fields__bar-tag"
        >
          由脚本 @DatabusProp 物化，只读
        </el-tag>
        <div v-if="!hasArtifact" class="cf-fields__bar-tools">
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
          :class="{ 'is-open': f.uiExpanded, 'is-readonly': hasArtifact }"
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
            <template v-if="!hasArtifact">
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
                  <el-input
                    v-model="f.description"
                    maxlength="200"
                    placeholder="表单项下方小灰字（可留空）"
                  />
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
                      高级设置<el-tag
                        v-if="hasAdvanced(f)"
                        size="small"
                        type="warning"
                        effect="plain"
                        round
                      >
                        {{ advancedCount(f) }}
                      </el-tag>
                    </el-button>
                  </template>
                  <div class="cf-adv">
                    <div class="cf-adv__title">占位提示</div>
                    <el-input
                      v-model="f.uiPlaceholder"
                      maxlength="100"
                      placeholder="输入框 placeholder（可留空）"
                    />
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
        <el-empty
          v-if="!fieldRows.length"
          description="还没有配置字段；点「添加字段」或切 JSON 模式"
          :image-size="60"
        />
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
  </el-tab-pane>
</template>

<script setup lang="ts">
import { ArrowDown, ArrowRight, ArrowUp, Delete, Plus } from '@element-plus/icons-vue';
import { EDITOR_OPTIONS, NODE_TYPE_OPTIONS } from '../../model/labels';
import type { ComponentFormModel } from '../form.types';
import type { FieldBuilder } from '../useFieldBuilder';
import TabLabel from './TabLabel.vue';

defineOptions({ name: 'ParamsTab' });

const props = defineProps<{
  form: ComponentFormModel;
  builder: FieldBuilder;
  /** 库存脚本件：物化字段只读，节点类型/配置形态禁改 */
  hasArtifact: boolean;
  invalid?: boolean;
}>();

// 解构出的 ref 保持响应式（不在此处解 .value），方法直接在模板绑定
const {
  fieldRows,
  jsonMode,
  schemaJson,
  parseHint,
  WIDGET_OPTIONS,
  EXPR_ROLE_OPTIONS,
  widgetLabel,
  isOptionWidget,
  hasAdvanced,
  advancedCount,
  addOption,
  addField,
  moveField,
  removeField,
  toggleJsonMode,
  validateSchemaJson,
  beautifySchemaJson
} = props.builder;
</script>

<style lang="scss" scoped>
@use './shared.scss';

.cf-fields {
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--el-fill-color-blank, #fff);

  &__bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  &__bar-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary, #1d2129);
  }

  &__bar-tag {
    margin-right: auto;
  }

  &__bar-tools {
    display: flex;
    gap: 8px;
  }

  &__json-tools {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 6px;
  }

  &__json {
    :deep(.el-textarea__inner) {
      font-family: 'JetBrains Mono', Consolas, monospace;
      font-size: 12px;
      line-height: 1.6;
    }
  }
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

  // 库存脚本件：物化字段卡片正文只读（头部仍可展开查看）
  &.is-readonly .field-card__body {
    pointer-events: none;
    opacity: 0.85;
  }

  &__head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    cursor: pointer;
    user-select: none;
  }

  &__arrow {
    transition: transform 0.2s;
  }

  &.is-open .field-card__arrow {
    transform: rotate(90deg);
  }

  &__summary {
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

  &__req {
    color: var(--el-color-danger, #f56c6c) !important;
  }

  &__spacer {
    flex: 1;
  }

  &__body {
    padding: 4px 14px 8px;
    border-top: 1px dashed var(--el-border-color-lighter, #ebeef5);

    :deep(.el-form-item) {
      margin-bottom: 12px;
    }
  }
}

.cf-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;

  &__row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
}

.cf-adv {
  display: flex;
  flex-direction: column;
  gap: 6px;

  &__title {
    font-size: 12px;
    font-weight: 600;
    color: var(--el-text-color-primary, #1d2129);
    margin-top: 6px;
  }

  &__sub {
    font-weight: 400;
    color: var(--el-text-color-secondary);
  }

  &__json {
    :deep(.el-textarea__inner) {
      font-family: 'JetBrains Mono', Consolas, monospace;
      font-size: 12px;
    }

    &.is-error :deep(.el-textarea__inner) {
      border-color: var(--el-color-danger, #f56c6c);
    }
  }
}
</style>
