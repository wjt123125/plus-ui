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
 * - lfNodeType: 业务组件在 LiteFlow 中的节点类型（缺省 NodeComponent；
 *   布尔条件组件为 NodeBooleanComponent，只能放在 IF/WHILE 等条件槽）
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
  lfNodeType?: 'NodeComponent' | 'NodeBooleanComponent';
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

  // ── 业务组件（均有后端真实现，注册名与后端 @LiteflowComponent 一致） ──
  {
    type: 'httpRequest',
    label: 'Http 请求',
    desc: '发起 HTTP 调用（GET/POST），响应存入 $.数据空间.response',
    color: '#409eff',
    icon: 'ph:globe',
    group: 'business'
  },
  {
    type: 'condition',
    label: '条件判断',
    desc: '布尔条件：按 JSONPath 与比较符求值，供 IF/WHILE 条件槽使用',
    color: '#e6a23c',
    icon: 'ph:equals',
    lfNodeType: 'NodeBooleanComponent',
    group: 'business'
  },
  {
    type: 'setValue',
    label: '赋值',
    desc: '把值（常量或路径取值）写入上下文 $.数据空间.path',
    color: '#67c23a',
    icon: 'ph:pencil-simple',
    group: 'business'
  },
  {
    type: 'fieldMap',
    label: '字段映射',
    desc: '按 mappings 把来源路径逐条搬运到目标路径；from/to 同时含 [*] 触发数组批量搬运，可选 type 字段做类型转换（int/string/boolean/double）',
    color: '#9c27b0',
    icon: 'ph:arrows-left-right',
    group: 'business'
  },
  {
    type: 'response',
    label: '流程响应',
    desc: '设置链路返回结果，固定写入 $.response.result/msg/data',
    color: '#f56c6c',
    icon: 'ph:flag-checkered',
    group: 'business'
  },

  // ── BPM 业务组件（均有后端真实现，注册名与后端 @LiteflowComponent 一致；
  //    顺序按 BPM 主线编排自然递进：会话 → 建 BO → 启流程 → 完任务） ──
  {
    type: 'sessionCreate',
    label: 'BPM 会话',
    short: '会话',
    desc: '创建 BPM 会话（登录获取 sid），响应平铺到 $.数据空间',
    color: '#409eff',
    icon: 'ph:sign-in',
    group: 'business'
  },
  {
    type: 'boCreate',
    label: 'BPM 建 BO',
    short: '建 BO',
    desc: '创建 BPM 业务对象（BO），支持 6 种回写策略（no/all/boId/add/exclude/include），结果存 $.数据空间.boResults',
    color: '#9c27b0',
    icon: 'ph:database',
    group: 'business'
  },
  {
    type: 'processStart',
    label: 'BPM 启流程',
    short: '启流程',
    desc: '启动 BPM 流程实例，title 支持 ${$.xxx} 模板替换，响应平铺到 $.数据空间',
    color: '#e6a23c',
    icon: 'ph:rocket',
    group: 'business'
  },
  {
    type: 'taskComplete',
    label: 'BPM 完任务',
    short: '完任务',
    desc: '按 processInstanceId 提交 BPM 任务（全部尝试），部分失败按 failOnError 决定是否中断',
    color: '#67c23a',
    icon: 'ph:seal-check',
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
 * 是否为布尔条件组件（lfNodeType=NodeBooleanComponent）。
 * 布尔组件只能放入 IF/WHILE/AND/OR/NOT 等条件槽，不能作为普通顺序叶子。
 */
export function isBooleanDef(def: CmpDef | undefined | null): boolean {
  return def?.lfNodeType === 'NodeBooleanComponent';
}

/**
 * 标识规则（2026-09-16 修订）：
 * - 组件注册名（CmpProperty.id / EL nodeId）= def.type，如同类组件可重复：httpRequest1/condition1
 *   的区分不放在 nodeId，而放在 tag。
 * - tag = 数据空间名（ElNode.cmpId 字段承载），画布强制唯一；默认名 = 注册名 + 同类型序号
 *   （httpRequest1、condition1），由 useElTreeModel 扫树计数生成。
 * - EL 形态：THEN(httpRequest.tag("httpRequest1").data("..."))
 * - 组件产出统一写在 $.数据空间名.xxx 下（response 组件例外，固定写 $.response.*）。
 */
