/**
 * 组件定义注册表。
 *
 * 唯一数据源原则（2026-10-06）：
 * - 业务物料唯一来源是后端 /databus/component/options：编辑器挂载即预拉，
 *   applyComponentOptions 全量替换物料区；接口失败物料区就是空的，
 *   画布上已存在的未注册件渲染为灰色「未注册组件」（fallbackDef），不做本地数据兜底。
 * - 本表只定义画布语法结构件（start/end 虚拟节点 + THEN/IF 等 EL 算子），
 *   它们是前端画布的编排语法，后端不持有 operator/virtual/conditionKind 语义。
 *
 * icon 为 Iconify 图标名称字符串（如 ph:play，Phosphor 集合）：
 * 与 RuoYi 菜单图标走同一套存储与渲染方式（SvgIcon 组件），字符串可直接入库；
 * 未来物料市场 jar 组件注册时，icon 可存 URL 或内联 SVG，渲染层再扩展分支。
 */
import { ref, shallowRef } from 'vue';
import type {
  ComponentGroupOption,
  ComponentOption,
  NodeTypeKind
} from '@/api/databus/component/types';

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
 * - group: 物料面板分组（key 由后端分组字典下发，前端不做值白名单）
 * - bizCategory: 业务域（由 /options 的 domain 原样透传，后端派生后取值 bpm/common/slot）。
 *   与 lfNodeType 正交：槽件同时带 lfNodeType（拖拽行为语义）与 bizCategory='slot'（分组归属语义）。
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
  lfNodeType?:
    | 'NodeComponent'
    | 'NodeBooleanComponent'
    | 'NodeForComponent'
    | 'NodeIteratorComponent'
    | 'NodeSwitchComponent';
  group?: string;
  /** 业务域分类（business 叶子的选择器分段依据），来自 /options domain */
  bizCategory?: string;
}

/**
 * 画布语法结构件：前端编排层独有，不是后端物料。
 * 虚拟起止节点 + 12 个 EL 算子，静态、唯一、不可被 /options 覆盖。
 */
const STRUCTURE_DEFS: CmpDef[] = [
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
    desc: '按次数循环：FOR(计数器).DO(循环体)，体内用 $i 取当前轮下标（0 基）',
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
    color: '#909399',
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
  }
];

/**
 * 面板分组编译期兜底（字典端点失败/未到位时用，保证面板不白屏）。
 * label/color/sort 与 databus_component_group 的 seed 行逐字一致，字典到位后由 paletteGroups 覆盖。
 */
export const FALLBACK_GROUPS: ComponentGroupOption[] = [
  { key: 'flow', label: '流程节点', color: '#909399', sort: 10 },
  { key: 'sequence', label: '顺序编排', color: '#409eff', sort: 20 },
  { key: 'branch', label: '条件分支', color: '#e6a23c', sort: 30 },
  { key: 'loop', label: '循环迭代', color: '#67c23a', sort: 40 },
  { key: 'other', label: '异常与逻辑', color: '#f56c6c', sort: 50 },
  { key: 'subflow', label: '子流程', color: '#909399', sort: 60 },
  { key: 'business', label: '业务组件', color: '#409eff', sort: 70 }
];

/**
 * 面板分组运行时值（顺序/标题/组色）。字典到位后由 useComponentTaxonomy 赋值。
 * 用 shallowRef 承载是为了 cmp-recommend 的同步 tie-break：读到的永远是「当前值」，
 * 字典没到就用兜底、到了自动切，无需 await（详见元数据后端化设计文档 §5.3）。
 */
export const paletteGroups = shallowRef<ComponentGroupOption[]>([...FALLBACK_GROUPS]);

/**
 * 全部已注册组件：结构件（静态）+ 业务物料（/options 全量下发，原地增删）。
 * 数组引用保持稳定，消费侧靠 materialTick 追踪物料区变更。
 */
export const CMP_DEFS: CmpDef[] = [...STRUCTURE_DEFS];

const STRUCTURE_TYPES = new Set(STRUCTURE_DEFS.map((d) => d.type));
const DEF_MAP = new Map(STRUCTURE_DEFS.map((d) => [d.type, d]));

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
 * 物料合流响应式滴答。模块级数组/Map 的原地变更不可被 Vue 追踪，
 * 每次 applyComponentOptions 后自增；渲染侧 computed 引用本值即可刷新。
 */
export const materialTick = ref(0);

/**
 * 远程 group 白名单 = 分组字典的 key 集合（paletteGroups 当前值 ∪ 编译期兜底七组）。
 * 字典外的值降级到兜底组 business，避免脏数据把面板分组打穿；
 * 字典新增一行即被识别，无需前端发版。
 */
function knownGroupKeys(): Set<string> {
  const keys = new Set<string>(FALLBACK_GROUPS.map((g) => g.key));
  for (const g of paletteGroups.value) {
    keys.add(g.key);
  }
  return keys;
}

/** 后端 NodeTypeKind → LiteFlow 节点 lfNodeType；NODE/null 为普通叶子（不写该字段） */
function mapNodeType(nodeType?: NodeTypeKind | null): CmpDef['lfNodeType'] | undefined {
  switch (nodeType) {
    case 'BOOLEAN':
      return 'NodeBooleanComponent';
    case 'FOR':
      return 'NodeForComponent';
    case 'ITERATOR':
      return 'NodeIteratorComponent';
    case 'SWITCH':
      return 'NodeSwitchComponent';
    default:
      return undefined;
  }
}

/** /options 单项 → 本地 CmpDef（纯展示映射；结构行为字段一律不出现） */
function toCmpDef(opt: ComponentOption, validGroups: Set<string>): CmpDef {
  const lfNodeType = mapNodeType(opt.nodeType);
  const def: CmpDef = {
    type: opt.code,
    label: opt.name || opt.code,
    desc: opt.description ?? '',
    color: opt.color ?? '#409eff',
    icon: opt.icon ?? 'ph:puzzle-piece',
    group: opt.group && validGroups.has(opt.group) ? opt.group : 'business'
  };
  if (opt.shortName) def.short = opt.shortName;
  if (lfNodeType) def.lfNodeType = lfNodeType;
  // 域由后端下发（含 slot 派生结果），前端不再做值白名单与 nodeType 守卫
  if (opt.domain) {
    def.bizCategory = opt.domain;
  }
  return def;
}

/**
 * 用后端 /options 结果全量替换物料区（业务物料唯一数据源）。
 *
 * - 结构件（start/end + EL 算子）永不参与替换；
 * - 每次调用先清空上一批物料再重建：后端停用/删除的件下一秒就从面板消失；
 * - 接口失败不调用本函数，物料区保持上一批（会话期仅首拉）或为空，绝不塞本地数据。
 */
export function applyComponentOptions(options: ComponentOption[]): void {
  const validGroups = knownGroupKeys();
  // 直接遍历 Map.keys()：删除当前游标键在 Map 迭代规范下安全（未访问到的键删除后即跳过）
  for (const type of DEF_MAP.keys()) {
    if (!STRUCTURE_TYPES.has(type)) {
      DEF_MAP.delete(type);
    }
  }
  for (let i = CMP_DEFS.length - 1; i >= 0; i--) {
    if (!STRUCTURE_TYPES.has(CMP_DEFS[i].type)) {
      CMP_DEFS.splice(i, 1);
    }
  }
  for (const opt of options) {
    // 无 code 的脏项跳过；与结构件撞码的远程项不允许覆盖画布语法
    if (!opt?.code || STRUCTURE_TYPES.has(opt.code)) continue;
    const def = toCmpDef(opt, validGroups);
    CMP_DEFS.push(def);
    DEF_MAP.set(def.type, def);
  }
  materialTick.value++;
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
