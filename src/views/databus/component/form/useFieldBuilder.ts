import { ElMessage } from 'element-plus';
import { ref } from 'vue';
import {
  EXPR_ROLE_OPTIONS,
  OPTION_WIDGETS,
  WIDGET_OPTIONS,
  widgetLabel
} from '../model/labels';
import type {
  ExprRole,
  PropOption,
  PropSchema,
  WidgetKind
} from '@/api/databus/component/types';

/**
 * 参数 Tab 的字段构造器（从 ComponentForm 抽出，2026-10-07 分包重构）。
 * 双模式纪律：可视化为主模型实时序列化 paramSchema；JSON 模式解析失败不允许切回（不丢数据）。
 */

/** 字段构造器行：PropSchema 基础键可视化，uiPlaceholder/uiExprRole 结构化高级键，其余高级键存 JSON 文本 */
export interface FieldRow extends PropSchema {
  uiExpanded: boolean;
  uiPlaceholder: string;
  uiExprRole: ExprRole | '';
  uiAdvanced: string;
  uiAdvError?: string;
}

/** 可视化直接编辑的基础键 + 结构化高级键；其余键全部归入高级 JSON */
const BASE_KEYS = ['name', 'label', 'widget', 'required', 'description', 'options'] as const;
const STRUCT_ADV_KEYS = ['placeholder', 'exprRole'] as const;
/** 纯前端行状态键，序列化时必须剔除，禁止进入 paramSchema */
const UI_KEYS = ['uiExpanded', 'uiPlaceholder', 'uiExprRole', 'uiAdvanced', 'uiAdvError'] as const;

type SchemaContainer = { fields?: PropSchema[]; schema?: { fields?: PropSchema[] } };

export function useFieldBuilder() {
  const fieldRows = ref<FieldRow[]>([]);
  const jsonMode = ref(false);
  const schemaJson = ref('');
  const parseHint = ref('');

  function isOptionWidget(widget?: WidgetKind | string | null): boolean {
    return OPTION_WIDGETS.includes(widget as WidgetKind);
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

  function hasAdvanced(f: FieldRow): boolean {
    return advancedCount(f) > 0;
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

  /** 解析 schema 原文进可视化行；失败锁定 JSON 模式（不丢数据），返回是否成功 */
  function load(raw: string | null | undefined): boolean {
    parseHint.value = '';
    if (!raw || !raw.trim()) {
      fieldRows.value = [];
      jsonMode.value = false;
      schemaJson.value = '';
      return true;
    }
    let obj: SchemaContainer;
    try {
      obj = JSON.parse(raw);
    } catch (e) {
      parseHint.value = 'paramSchema 不是合法 JSON，已锁定 JSON 高级模式：' + (e as Error).message;
      jsonMode.value = true;
      schemaJson.value = raw;
      fieldRows.value = [];
      return false;
    }
    const fields = obj?.fields ?? obj?.schema?.fields;
    if (!Array.isArray(fields)) {
      parseHint.value = '未找到 fields 数组，已锁定 JSON 高级模式（新形态应为 {"fields":[...]}）';
      jsonMode.value = true;
      schemaJson.value = raw;
      fieldRows.value = [];
      return false;
    }
    fieldRows.value = fields.map(toFieldRow);
    jsonMode.value = false;
    schemaJson.value = '';
    return true;
  }

  function reset() {
    fieldRows.value = [];
    jsonMode.value = false;
    schemaJson.value = '';
    parseHint.value = '';
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
      let obj: SchemaContainer;
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

  /**
   * 提交前校验并序列化 paramSchema。
   * 失败时弹消息、展开问题行，返回 null（调用方负责挂 params 红点并跳转）。
   */
  function commit(): string | null {
    if (jsonMode.value) {
      if (!schemaJson.value.trim()) {
        return '';
      }
      if (!validateSchemaJson()) {
        return null;
      }
      return JSON.stringify(JSON.parse(schemaJson.value));
    }
    for (const f of fieldRows.value) {
      if (!f.name.trim()) {
        f.uiExpanded = true;
        ElMessage.error('存在未填字段名的配置字段');
        return null;
      }
      if (!f.widget) {
        f.uiExpanded = true;
        ElMessage.error(`字段「${f.name}」未选控件类型`);
        return null;
      }
      if (!validateAdvanced(f)) {
        f.uiExpanded = true;
        ElMessage.error(`字段「${f.name}」的高级结构 JSON 不合法`);
        return null;
      }
      if (isOptionWidget(f.widget)) {
        const bad = (f.options ?? []).some((o: PropOption) => !o.label.trim() || !o.value.trim());
        if (bad) {
          f.uiExpanded = true;
          ElMessage.error(`字段「${f.name}」存在文案或值为空的候选项`);
          return null;
        }
      }
    }
    return fieldRows.value.length ? JSON.stringify({ fields: fieldRows.value.map(fromFieldRow) }) : '';
  }

  return {
    // 状态
    fieldRows,
    jsonMode,
    schemaJson,
    parseHint,
    // 常量透传给模板
    WIDGET_OPTIONS,
    EXPR_ROLE_OPTIONS,
    // 判定与操作
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
    beautifySchemaJson,
    // 生命周期与提交
    load,
    reset,
    commit
  };
}

export type FieldBuilder = ReturnType<typeof useFieldBuilder>;
