import type { PropOption, PropSchema, PropShowWhen, WidgetKind } from '@/api/databus/component/types';
import type { ConnectorConfigField } from '@/api/databus/connector/types';

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

/** 分组兜底名：schema 没写 group 的字段归「基础」tab */
export const BASIC_GROUP = '基础';

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
  return [{ field: w.field, eq: w.eq, ne: w.ne, in: w.in, notIn: w.notIn }];
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
    widget: resolveWidget(field),
    required: field.sensitive && isEdit ? false : !!field.required,
    placeholder: field.placeholder ?? null,
    options: toOptions(field),
    showWhen: toShowWhen(field)
  };
}

/** schema → [字段名, 定义] 有序数组（后端是 LinkedHashMap，序列化后键序即声明序，不再另排） */
export function schemaEntries(
  schema: Record<string, ConnectorConfigField> | undefined
): Array<[string, ConnectorConfigField]> {
  return Object.entries(schema ?? {});
}

/** 分组清单（保持首次出现顺序；无 group 的字段归 BASIC_GROUP，且 BASIC_GROUP 恒排第一） */
export function schemaGroups(
  schema: Record<string, ConnectorConfigField> | undefined
): string[] {
  const groups: string[] = [];
  for (const [, field] of schemaEntries(schema)) {
    const g = field.group || BASIC_GROUP;
    if (!groups.includes(g)) {
      groups.push(g);
    }
  }
  if (groups.length === 0) {
    return [];
  }
  // 「基础」永远第一个 tab：连接ID/名称/类型这些平台固定字段也住在这个 tab 里
  return groups.sort((a, b) => (a === BASIC_GROUP ? -1 : b === BASIC_GROUP ? 1 : 0));
}

/**
 * showWhen 求值，语义与 SchemaField.vue 逐字一致（同字段多条规则 AND，先命中先返回）。
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
 * 该由连接器自己在执行期精确报错（如 JDBC 的「缺少必填配置 host（或改用高级项「自定义 JDBC URL」）」）。
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
    if (isBlank(model[name])) {
      return field.label ?? name;
    }
  }
  return null;
}

/** 空值判定：null/undefined/空串/纯空白串/空数组/空对象都算没填（0 与 false 是有意义的值，不算） */
function isBlank(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return false;
}
