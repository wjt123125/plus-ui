/**
 * 组件定义注册表。
 *
 * icon 为 Iconify 图标名称字符串（如 ph:play，Phosphor 集合）：
 * 与 RuoYi 菜单图标走同一套存储与渲染方式（SvgIcon 组件），字符串可直接入库；
 * 未来物料市场 jar 组件注册时，icon 可存 URL 或内联 SVG，渲染层再扩展分支。
 * 所有名称已通过 api.iconify.design 核实存在（2026-09-14）。
 */

/** HTML5 拖拽 MIME：面板 dragstart 写入、画布 drop 时读取桩类型 */
export const DND_MIME = 'application/x-databus-cmp';

/** 算子所需的条件组件类型，对应 LiteFlow Node 类型 */
export type ConditionKind = 'if' | 'switch' | 'for' | 'while' | 'iterator' | 'boolean' | 'none';

/**
 * 组件定义。
 * - virtual: 开始/结束是画布虚拟节点，不参与 EL 序列化
 * - singleton: 画布上只允许存在一个
 * - operator: 是否为 LiteFlow EL 编排算子（而非业务组件）。
 *   算子在画布上渲染为 gateway/junction/placeholder 等平级结构节点（不做物理嵌套容器），
 *   由 useElTreeModel 投影器从模型树摊平
 * - conditionKind: 算子需要的条件组件类型
 * - group: 物料面板分组
 */
export interface CmpDef {
  type: string;
  label: string;
  /** 物料面板网格里的短标签（可选，缺省用 label） */
  short?: string;
  desc: string;
  color: string;
  /** Iconify 图标名（集合:名称），渲染走 SvgIcon */
  icon: string;
  virtual?: boolean;
  singleton?: boolean;
  operator?: boolean;
  conditionKind?: ConditionKind;
  group?: 'flow' | 'sequence' | 'branch' | 'loop' | 'other' | 'subflow' | 'business';
}

export const CMP_DEFS: CmpDef[] = [
  // ── 虚拟节点 ──
  {
    type: 'start',
    label: '开始',
    desc: '链路起点（虚拟节点）',
    color: '#67c23a',
    icon: 'ph:play',
    virtual: true,
    singleton: true,
    group: 'flow'
  },
  {
    type: 'end',
    label: '结束',
    desc: '链路终点（虚拟节点）',
    color: '#f56c6c',
    icon: 'ph:stop',
    virtual: true,
    singleton: true,
    group: 'flow'
  },

  // ── 顺序类算子 ──
  {
    type: 'THEN',
    label: '串行(THEN)',
    short: '串行',
    desc: '串行编排：子节点按顺序依次执行',
    color: '#409eff',
    icon: 'ph:flow-arrow',
    operator: true,
    conditionKind: 'none',
    group: 'sequence'
  },
  {
    type: 'WHEN',
    label: '并行(WHEN)',
    short: '并行',
    desc: '并行编排：子节点同时执行',
    color: '#409eff',
    icon: 'ph:git-fork',
    operator: true,
    conditionKind: 'none',
    group: 'sequence'
  },

  // ── 分支类算子 ──
  {
    type: 'IF',
    label: '条件(IF)',
    short: '条件',
    desc: '条件编排：条件成立走真分支，否则走假分支',
    color: '#e6a23c',
    icon: 'ph:git-branch',
    operator: true,
    conditionKind: 'if',
    group: 'branch'
  },
  {
    type: 'SWITCH',
    label: '选择(SWITCH)',
    short: '选择',
    desc: '选择编排：按条件值选择对应分支执行',
    color: '#e6a23c',
    icon: 'ph:tree-structure',
    operator: true,
    conditionKind: 'switch',
    group: 'branch'
  },

  // ── 循环类算子 ──
  {
    type: 'FOR',
    label: 'For循环(FOR)',
    short: '计数循环',
    desc: '按次数循环：FOR(起始;结束;步长).DO(循环体)',
    color: '#67c23a',
    icon: 'ph:list-numbers',
    operator: true,
    conditionKind: 'for',
    group: 'loop'
  },
  {
    type: 'WHILE',
    label: 'While循环(WHILE)',
    short: '条件循环',
    desc: '条件循环：WHILE(条件).DO(循环体)',
    color: '#67c23a',
    icon: 'ph:arrows-clockwise',
    operator: true,
    conditionKind: 'while',
    group: 'loop'
  },
  {
    type: 'ITERATOR',
    label: '迭代(ITERATOR)',
    short: '迭代循环',
    desc: '迭代循环：ITERATOR(迭代器).DO(循环体).BREAK(跳出条件)',
    color: '#67c23a',
    icon: 'ph:repeat',
    operator: true,
    conditionKind: 'iterator',
    group: 'loop'
  },

  // ── 异常与逻辑类算子 ──
  {
    type: 'CATCH',
    label: '捕获异常(CATCH)',
    short: '异常捕获',
    desc: '异常捕获：CATCH(主体).DO(异常处理体)',
    color: '#f56c6c',
    icon: 'ph:bug',
    operator: true,
    conditionKind: 'none',
    group: 'other'
  },
  {
    type: 'AND',
    label: '与(AND)',
    short: '与',
    desc: '布尔与：需配合两个条件组件使用',
    color: '#409eff',
    icon: 'ph:intersect',
    operator: true,
    conditionKind: 'boolean',
    group: 'other'
  },
  {
    type: 'OR',
    label: '或(OR)',
    short: '或',
    desc: '布尔或：需配合两个条件组件使用',
    color: '#67c23a',
    icon: 'ph:union',
    operator: true,
    conditionKind: 'boolean',
    group: 'other'
  },
  {
    type: 'NOT',
    label: '非(NOT)',
    short: '非',
    desc: '布尔非：对条件结果取反',
    color: '#9c27b0',
    icon: 'ph:prohibit',
    operator: true,
    conditionKind: 'boolean',
    group: 'other'
  },

  // ── 子流程 ──
  {
    type: 'CHAIN',
    label: '子流程(CHAIN)',
    short: '子流程',
    desc: '子流程调用：引用其他链路',
    color: '#909399',
    icon: 'ph:link',
    operator: true,
    conditionKind: 'none',
    group: 'subflow'
  },

  // ── 业务组件（桩） ──
  {
    type: 'httpRequest',
    label: 'Http 请求',
    desc: '桩组件：发起 HTTP 调用',
    color: '#409eff',
    icon: 'ph:globe',
    group: 'business'
  },
  {
    type: 'formula',
    label: '公式',
    desc: '桩组件：公式引擎计算',
    color: '#e6a23c',
    icon: 'ph:function',
    group: 'business'
  },
  {
    type: 'boCreate',
    label: 'BO 创建',
    desc: '桩组件：创建业务对象',
    color: '#f56c6c',
    icon: 'ph:package',
    group: 'business'
  }
];

/** 物料面板分组顺序、标题与组色（标题圆点用） */
export const PALETTE_GROUPS: { key: NonNullable<CmpDef['group']>; label: string; color: string }[] = [
  { key: 'flow', label: '流程节点', color: '#909399' },
  { key: 'sequence', label: '顺序编排', color: '#409eff' },
  { key: 'branch', label: '条件分支', color: '#e6a23c' },
  { key: 'loop', label: '循环迭代', color: '#67c23a' },
  { key: 'other', label: '异常与逻辑', color: '#f56c6c' },
  { key: 'subflow', label: '子流程', color: '#909399' },
  { key: 'business', label: '业务组件', color: '#409eff' }
];

const DEF_MAP = new Map(CMP_DEFS.map((d) => [d.type, d]));

export function getDef(type: string): CmpDef | undefined {
  return DEF_MAP.get(type);
}

/**
 * 依据组件 ID 反查定义（httpRequest_xxx → httpRequest）。
 * 反序列化 EL 时组件可能已不在面板中，找不到返回 undefined。
 */
export function resolveDefByCmpId(cmpId: string): CmpDef | undefined {
  if (DEF_MAP.has(cmpId)) {
    return DEF_MAP.get(cmpId);
  }
  return CMP_DEFS.find((d) => !d.virtual && !d.operator && cmpId.startsWith(`${d.type}_`));
}

/** 生成默认组件 ID：httpRequest_a1b2c3（算子节点不用 cmpId，走 type 本身） */
export function defaultCmpId(type: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${type}_${rand}`;
}
