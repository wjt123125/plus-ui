import type { PropOption, PropSchema, PropShowWhen, WidgetKind } from '@/api/databus/component/types';
import type { ConnectorConfigField, ConnectorConfigGroup } from '@/api/databus/connector/types';

/**
 * 连接器 configSchema → 组件参数 schema（PropSchema）的适配层（方案 §8.2）。
 *
 * 两套契约**不合并**：PropSchema 的 exprRole（字面量 vs `{{ }}` 表达式）对连接配置毫无意义
 * ——连接配置全是字面量，合并会污染组件契约。这里只做一次机械平移，
 * 好让渲染层直接复用 editor/components/schema-form 的 SchemaField / FieldControl / KeyValueMapEditor。
 *
 * 平移后**刻意不设 exprRole**：FieldControl 只在 `exprRole === 'DATA'` 时才换成 ExprInput，
 * 留空即走普通输入框，正是连接表单要的形态。
 */

/** 未声明 group 的字段归这个默认组（后端 ConfigField 留空时） */
export const DEFAULT_GROUP = 'default';

/** 控件枚举白名单：后端 widget 是自由字符串，越界值一律走推断，避免透传出未知控件 */
const KNOWN_WIDGETS: WidgetKind[] = [
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'BOOLEAN',
  'SELECT',
  'MULTISELECT',
  'PASSWORD',
  'CONNECTION_SELECT',
  'KEY_VALUE_MAP',
  'OBJECT_ROWS',
  'OBJECT',
  'JSON'
];

/**
 * 连接表单的一个 tab（解析后的分组元数据）。
 * 主组渲染为第一个 tab；栅格份数最终由后端 columns 决定（缺省 2，1=单列）。
 */
export interface ResolvedGroup {
  key: string;
  title: string;
  primary: boolean;
  /** 组内栅格份数（1..12）；字段用 span 声明自己占几份 */
  columns: number;
}

/** 分组栅格份数兜底：非法值一律按 2 份（双列），避免前端拿到 0 / 负数 / 小数 */
function resolveColumns(declared: number | null | undefined): number {
  const n = Math.trunc(Number(declared));
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : 2;
}

/** widget 缺省 / 越界时按 sensitive + type 推断 */
function resolveWidget(field: ConnectorConfigField): WidgetKind {
  const declared = field.widget as WidgetKind | undefined;
  if (declared && KNOWN_WIDGETS.includes(declared)) {
    // sensitive 是安全语义，优先级高于连接器自己声明的 TEXT：密码框还能防肩窥
    return field.sensitive && declared === 'TEXT' ? 'PASSWORD' : declared;
  }
  if (field.sensitive) {
    return 'PASSWORD';
  }
  switch (field.type) {
    case 'int':
    case 'long':
    case 'double':
    case 'number':
      return 'NUMBER';
    case 'boolean':
      return 'BOOLEAN';
    case 'array':
    case 'object':
      return 'JSON';
    default:
      return 'TEXT';
  }
}

function toOptions(field: ConnectorConfigField): PropOption[] | null {
  if (!field.options?.length) {
    return null;
  }
  return field.options.map((o) => ({ label: o.label ?? o.value ?? '', value: o.value ?? '' }));
}

function toShowWhen(field: ConnectorConfigField): PropShowWhen[] | null {
  const w = field.showWhen;
  if (!w?.field) {
    return null;
  }
  return [{ field: w.field, eq: w.eq, ne: w.ne, in: w.in, notIn: w.notIn, empty: w.empty }];
}

/**
 * 单字段平移。
 *
 * `isEdit` 只影响一件事：**编辑态把 sensitive 字段的 required 摘掉**。
 * 后端出于安全不回显密码（`entityToVo` 只回显 config 明文列），编辑时留空即沿用库中旧值
 * （Service 层 mergeMissingSensitive 补齐）。若照搬 required，用户改个备注都得重填一遍密码。
 */
export function toPropSchema(
  name: string,
  field: ConnectorConfigField,
  isEdit: boolean
): PropSchema {
  return {
    name,
    label: field.label ?? name,
    description: field.description ?? null,
    help: field.help ?? null,
    widget: resolveWidget(field),
    required: field.sensitive && isEdit ? false : !!field.required,
    placeholder: field.placeholder ?? null,
    unit: field.unit ?? null,
    options: toOptions(field),
    showWhen: toShowWhen(field)
  };
}

/** schema → [字段名, 字段定义] 有序数组（后端是 LinkedHashMap，序列化后键序即声明序，不再另排） */
export function schemaEntries(
  schema: Record<string, ConnectorConfigField> | undefined
): Array<[string, ConnectorConfigField]> {
  return Object.entries(schema ?? {});
}

/** 某分组下的字段（顺序＝schema 声明序；无 group 的字段归 default 组） */
export function fieldsOfGroup(
  schema: Record<string, ConnectorConfigField> | undefined,
  groupKey: string
): Array<[string, ConnectorConfigField]> {
  return schemaEntries(schema).filter(([, field]) => (field.group || DEFAULT_GROUP) === groupKey);
}

/**
 * 分组清单＝tab 清单。
 *
 * 优先用连接器声明的 groups（key/label/primary/columns 全部来自后端）；
 * 老包没声明时按字段 group 首次出现顺序兜底：第一组当作主组（单列），其余双列。
 * 前端不认任何具体 group 名（"基础"/"高级" 都不写死），只认元数据。
 */
export function resolveGroups(
  schema: Record<string, ConnectorConfigField> | undefined,
  declared: ConnectorConfigGroup[] | undefined
): ResolvedGroup[] {
  if (declared?.length) {
    const groups = declared
      .filter((g) => !!g?.key)
      .map<ResolvedGroup>((g) => ({
        key: String(g.key),
        title: g.label || String(g.key),
        primary: !!g.primary,
        columns: resolveColumns(g.columns)
      }));
    if (groups.length) {
      // 主组恒排第一个 tab（契约），其余保持声明顺序（sort 稳定）
      groups.sort((a, b) => Number(b.primary) - Number(a.primary));
      // 声明里漏掉的字段分组补在末尾：宁可多一个没起好名字的 tab，也不让字段静默消失
      for (const key of keysOfGroups(schema)) {
        if (!groups.some((g) => g.key === key)) {
          groups.push({ key, title: key, primary: false, columns: 2 });
        }
      }
      return groups;
    }
  }

  const keys = keysOfGroups(schema);
  return keys.map((key, index) => ({
    key,
    title: key,
    primary: index === 0,
    columns: index === 0 ? 1 : 2
  }));
}

function keysOfGroups(schema: Record<string, ConnectorConfigField> | undefined): string[] {
  const keys: string[] = [];
  for (const [, field] of schemaEntries(schema)) {
    const g = field.group || DEFAULT_GROUP;
    if (!keys.includes(g)) {
      keys.push(g);
    }
  }
  return keys;
}

/**
 * showWhen 求值，语义与 SchemaField.vue 逐字一致（同字段多条规则 AND）。
 * 渲染层的可见性由 SchemaField 自己算，这里重算一遍是为了两件事：
 * ① 生成 el-form 的 rules 时排除隐藏字段（隐藏的必填项不该拦住提交）；
 * ② 「测试连接」按钮的前置校验与表单口径一致。
 * 两份逻辑同源同义，改一处必须改两处——这是复用 SchemaField 而不复用 SchemaForm 的代价。
 */
export function isFieldVisible(
  field: ConnectorConfigField,
  model: Record<string, unknown>
): boolean {
  const w = field.showWhen;
  if (!w?.field) {
    return true;
  }
  const actual = readByPath(model, w.field);
  if (w.empty != null) return w.empty ? isBlankValue(actual) : !isBlankValue(actual);
  if (w.eq != null) return String(actual) === w.eq;
  if (w.ne != null) return String(actual) !== w.ne;
  if (w.in?.length) return w.in.includes(String(actual));
  if (w.notIn?.length) return !w.notIn.includes(String(actual));
  return true;
}

function readByPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
}

/**
 * 生成 config 字段的 el-form rules，键为 `config.<字段名>`（与 SchemaField 的 namePath 对齐）。
 *
 * 必须显式给 rules，不能只靠 el-form-item 的 `required`：那样 async-validator 会吐
 * "config.host is required" 这种英文默认文案。这里给中文提示，且 formRules 排在
 * `required` 自动规则之前，校验失败时优先取到中文消息。
 *
 * 三类字段跳过：① 非必填；② showWhen 判为隐藏；③ 编辑态的 sensitive（见 toPropSchema）。
 *
 * **注意：只拦 required，不做「二选一必填」这类跨字段推断**——连接器 schema 表达不了它，
 * 该由连接器自己在执行期精确报错（如 JDBC 的「缺少必填配置 host（或改用「连接串」页的自定义 JDBC URL）」）。
 */
export function buildConfigRules(
  schema: Record<string, ConnectorConfigField> | undefined,
  model: Record<string, unknown>,
  isEdit: boolean
): Record<string, unknown[]> {
  const rules: Record<string, unknown[]> = {};
  for (const [name, field] of schemaEntries(schema)) {
    const required = field.sensitive && isEdit ? false : !!field.required;
    if (!required || !isFieldVisible(field, model)) {
      continue;
    }
    rules[`config.${name}`] = [
      {
        required: true,
        message: `请填写${field.label ?? name}`,
        trigger: ['blur', 'change']
      }
    ];
  }
  return rules;
}

/**
 * 「测试连接」前置校验：返回第一个缺失的必填字段标签，全齐返回 null。
 * 与 buildConfigRules 同源，区别是它不依赖 el-form 实例（按钮在表单外也要能校验），
 * 且要给出「请先填写 xxx」的引导式提示。
 */
export function findMissingRequired(
  schema: Record<string, ConnectorConfigField> | undefined,
  model: Record<string, unknown>,
  isEdit: boolean
): string | null {
  for (const [name, field] of schemaEntries(schema)) {
    const required = field.sensitive && isEdit ? false : !!field.required;
    if (!required || !isFieldVisible(field, model)) {
      continue;
    }
    if (isBlankValue(model[name])) {
      return field.label ?? name;
    }
  }
  return null;
}

/** 空值判定：null/undefined/空串/纯空白串/空数组/空对象都算没填（0 与 false 是有意义的值，不算） */
export function isBlankValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return false;
}
