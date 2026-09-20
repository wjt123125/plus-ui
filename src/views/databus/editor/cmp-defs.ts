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
 * - defaultTitle: 业务组件留空「节点标题」时的默认推断（动宾 + 参数值，≤15 字）。
 *   入参为组件配置 data 解析后的 cfg；返回空串表示 cfg 缺字段推断不出，由展示层
 *   回退 label。算子/虚拟节点不填，展示层直接用 label 兜底。
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
  /** 留空节点标题时的默认推断（仅业务组件）；风格见文件末 title builders 注释 */
  defaultTitle?: (cfg: any) => string;
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
    desc: '通用 HTTP：GET/POST/PUT/PATCH/DELETE，JSON/表单/raw 三种请求体，basic/bearer 鉴权；状态码与响应存入 $.数据空间.status/response，mappings 抽取字段',
    color: '#409eff',
    icon: 'ph:globe',
    group: 'business',
    defaultTitle: titleOfHttpRequest
  },
  {
    type: 'condition',
    label: '条件判断',
    desc: '布尔条件：按 JSONPath 与比较符求值，供 IF/WHILE 条件槽使用',
    color: '#e6a23c',
    icon: 'ph:equals',
    lfNodeType: 'NodeBooleanComponent',
    group: 'business',
    defaultTitle: () => '条件判定'
  },
  {
    type: 'setValue',
    label: '赋值',
    desc: '把值（常量或路径取值）写入上下文 $.数据空间.path',
    color: '#67c23a',
    icon: 'ph:pencil-simple',
    group: 'business',
    defaultTitle: titleOfSetValue
  },
  {
    type: 'fieldMap',
    label: '字段映射',
    desc: '按 mappings 把来源路径逐条搬运到目标路径；from/to 同时含 [*] 触发数组批量搬运，可选 type 字段做类型转换（int/string/boolean/double）',
    color: '#9c27b0',
    icon: 'ph:arrows-left-right',
    group: 'business',
    defaultTitle: titleOfFieldMap
  },
  {
    type: 'dataPatch',
    label: '数据补丁',
    desc: '按 merge 语义把 patch 字段覆盖到 target 命中的每个对象：[*] 全量/[i] 索引/[?(...)] 过滤均可，未声明字段（含 ID）保留、缺失字段新增；典型用于 boQuery 后改字段再交 boUpdate 回写，命中对象数写入 $.数据空间.patchedCount',
    color: '#009688',
    icon: 'ph:git-diff',
    group: 'business',
    defaultTitle: () => '补丁合并'
  },
  {
    type: 'response',
    label: '流程响应',
    desc: '设置链路返回结果，固定写入 $.response.result/msg/data',
    color: '#f56c6c',
    icon: 'ph:flag-checkered',
    group: 'business',
    defaultTitle: () => '流程响应'
  },

  // ── BPM 业务组件（均有后端真实现，注册名与后端 @LiteflowComponent 一致；
  //    顺序按 BPM 主线编排自然递进：会话 → 建/查/改/删 BO → 启流程 → 终止流程 → 完任务
  //    依据：旧系统 ProcessCreate 先产出 processInstanceId，
  //          BoCreate 的 method=create 必须 bindId 指向已存在的流程实例 ID） ──
  {
    type: 'sessionCreate',
    label: 'BPM 会话',
    short: '会话',
    desc: '创建 BPM 会话（登录获取 sid），响应平铺到 $.数据空间',
    color: '#409eff',
    icon: 'ph:sign-in',
    group: 'business',
    defaultTitle: () => '创建会话'
  },
  {
    type: 'processStart',
    label: 'BPM 启流程',
    short: '启流程',
    desc: '启动 BPM 流程实例，title 支持 ${$.xxx} 模板替换，响应平铺到 $.数据空间（含 processInstanceId 供下游 boCreate.bindId 引用）',
    color: '#e6a23c',
    icon: 'ph:rocket',
    group: 'business',
    defaultTitle: () => '启动流程'
  },
  {
    type: 'boCreate',
    label: 'BPM 建 BO',
    short: '建 BO',
    desc: '创建 BPM 业务对象（BO），method=create 时 bindId 必填且引用上一步 processStart.processInstanceId，支持 6 种回写策略',
    color: '#9c27b0',
    icon: 'ph:database',
    group: 'business',
    defaultTitle: (cfg: any) => titleOfBoVerb(cfg, '新建')
  },
  {
    type: 'boQuery',
    label: 'BPM 查 BO',
    short: '查 BO',
    desc: '查询 BPM 业务对象（BO）数据，支持 list/listPage/count 三种方法、maxRecord 影响量校验、动态条件与关联表/子表挂载',
    color: '#409eff',
    icon: 'ph:magnifying-glass',
    group: 'business',
    defaultTitle: titleOfBoQuery
  },
  {
    type: 'boUpdate',
    label: 'BPM 改 BO',
    short: '改 BO',
    desc: '按记录 ID 更新 BPM 业务对象（BO）数据，records 必须含 ID 字段（可先 boQuery 查出再整体回写），BPM 端整体事务 all-or-nothing',
    color: '#e6a23c',
    icon: 'ph:pencil-line',
    group: 'business',
    defaultTitle: (cfg: any) => titleOfBoVerb(cfg, '更新')
  },
  {
    type: 'boDelete',
    label: 'BPM 删 BO',
    short: '删 BO',
    desc: '删除 BPM 业务对象（BO）数据，method=remove 按记录 ID 逐条删 / removeByBindId 按流程实例批量删，BPM 端整体事务 all-or-nothing',
    color: '#f56c6c',
    icon: 'ph:trash',
    group: 'business',
    defaultTitle: (cfg: any) => titleOfBoVerb(cfg, '删除')
  },
  {
    type: 'processTerminate',
    label: 'BPM 终止流程',
    short: '终止流程',
    desc: '终止 BPM 流程实例（userId 为终止操作人），流程已结束时幂等返回 terminated=false 不报错',
    color: '#909399',
    icon: 'ph:prohibit',
    group: 'business',
    defaultTitle: () => '终止流程'
  },
  {
    type: 'taskComplete',
    label: 'BPM 完任务',
    short: '完任务',
    desc: '按 processInstanceId 提交 BPM 任务（全部尝试），部分失败按 failOnError 决定是否中断',
    color: '#67c23a',
    icon: 'ph:seal-check',
    group: 'business',
    defaultTitle: () => '提交任务'
  },
  {
    type: 'rdsExecute',
    label: 'BPM SQL 执行',
    short: 'SQL 执行',
    desc: '在 BPM 后台注册的 RDS 数据源上执行 SQL：标量/单行/多行查询、更新与批量（8 种方法），结果存 $.数据空间.data',
    color: '#16a34a',
    icon: 'ph:table',
    group: 'business',
    defaultTitle: titleOfRdsExecute
  },
  {
    type: 'idCardToUserId',
    label: '身份证换用户',
    short: '证换用户',
    desc: '按 path 读取逗号分隔的身份证号，查 BPM 用户表换成 userId 原地写回；全部未命中报错，部分未命中告警',
    color: '#0891b2',
    icon: 'ph:identification-card',
    group: 'business',
    defaultTitle: () => '身份证换 ID'
  },
  {
    type: 'fileUpload',
    label: 'BPM 上传附件',
    short: '上传附件',
    desc: '读取数据空间文件数组（base64），本地摘要校验后上传到 BO 记录附件字段，结果存 $.数据空间.files',
    color: '#7c3aed',
    icon: 'ph:upload-simple',
    group: 'business',
    defaultTitle: titleOfFileUpload
  },
  {
    type: 'fileDownload',
    label: 'BPM 下载附件',
    short: '下载附件',
    desc: '按 boId + 附件字段名读取 BO 记录全部文件转 base64，结果存 $.数据空间.files（可直接接上传组件）',
    color: '#0369a1',
    icon: 'ph:download-simple',
    group: 'business',
    defaultTitle: titleOfFileDownload
  },
  {
    type: 'script',
    label: '脚本',
    short: '脚本',
    desc: 'Groovy 等脚本语言编写的任意代码，可读写数据空间',
    color: '#9c27b0',
    icon: 'ph:code',
    group: 'business',
    defaultTitle: titleOfScript
  },
  {
    type: 'booleanScript',
    label: '条件脚本',
    short: '条件脚本',
    desc: '返回 true/false 的脚本节点，可放入 IF/WHILE 条件槽',
    color: '#e6a23c',
    icon: 'ph:terminal-window',
    lfNodeType: 'NodeBooleanComponent',
    group: 'business',
    defaultTitle: titleOfBooleanScript
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

// ── 节点标题默认推断（2026-09-20 拍板，设计正本 databus-preview-step-result.md §5）──────────
// 风格：动宾 + 参数值，≤15 字，不带运行时数量（数量归 summary）、不带 tag/nodeId（已有列）。
// 函数声明提升，故可在上方 CMP_DEFS 字面量中直接引用；cfg 缺关键字段时返回空串，
// 由 resolveNodeTitle 回退 def.label。

/** 超 15 字截断（路径/BO 名可能很长），保留 14 字加省略号 */
function clipTitle(text: string): string {
  return text.length > 15 ? `${text.slice(0, 14)}…` : text;
}

/** httpRequest：method + URL 路径，如 GET /auth/code */
function titleOfHttpRequest(cfg: any): string {
  const method = String(cfg?.method ?? '').trim().toUpperCase();
  let path = String(cfg?.url ?? '').trim();
  if (path) {
    // 剥掉协议与主机，只留路径（相对地址直接补斜杠）
    path = path.replace(/^[a-zA-Z][\w+.-]*:\/\/[^/]+/, '');
    if (!path.startsWith('/')) {
      path = `/${path}`;
    }
  }
  if (!method && !path) {
    return '';
  }
  return clipTitle(`${method} ${path}`.trim());
}

/** setValue：动作 + 写入路径，如 赋值 $.user.name */
function titleOfSetValue(cfg: any): string {
  const path = String(cfg?.path ?? '').trim();
  return path ? clipTitle(`赋值 ${path}`) : '';
}

/** fieldMap：动作 + 静态映射条数，如 搬运 3 字段 */
function titleOfFieldMap(cfg: any): string {
  const count = Array.isArray(cfg?.mappings) ? cfg.mappings.length : 0;
  return count > 0 ? `搬运 ${count} 字段` : '';
}

/** boCreate / boUpdate / boDelete：boList[0].boName，如 新建 用户表 */
function titleOfBoVerb(cfg: any, verb: string): string {
  const boName = String(cfg?.boList?.[0]?.boName ?? '').trim();
  return boName ? clipTitle(`${verb} ${boName}`) : '';
}

/** boQuery：主表 main.boName，如 查询 用户表 */
function titleOfBoQuery(cfg: any): string {
  const boName = String(cfg?.main?.boName ?? '').trim();
  return boName ? clipTitle(`查询 ${boName}`) : '';
}

/** rdsExecute：SQL: + 方法名，如 SQL: getMaps */
function titleOfRdsExecute(cfg: any): string {
  const method = String(cfg?.method ?? '').trim();
  return method ? clipTitle(`SQL: ${method}`) : '';
}

/** fileUpload / fileDownload：动作 + 附件字段名，如 上传 BO_FIELD_FILE；缺字段时回退「上传附件」 */
function titleOfFileVerb(cfg: any, verb: string): string {
  const field = String(cfg?.boItemName ?? cfg?.fieldName ?? '').trim();
  return field ? clipTitle(`${verb} ${field}`) : `${verb}附件`;
}

function titleOfFileUpload(cfg: any): string {
  return titleOfFileVerb(cfg, '上传');
}

function titleOfFileDownload(cfg: any): string {
  return titleOfFileVerb(cfg, '下载');
}

/** script：language + 「脚本」，如 Groovy 脚本；缺 language 返回空串回退 label */
function titleOfScript(cfg: any): string {
  const language = String(cfg?.language ?? '').trim();
  if (!language) return '';
  const lang = language.charAt(0).toUpperCase() + language.slice(1);
  return clipTitle(`${lang} 脚本`);
}

/** booleanScript：直接返回「条件脚本」风格名，与 label 等价、不重复 cfg */
function titleOfBooleanScript(_cfg: any): string {
  return '条件脚本';
}

/**
 * 节点展示标题三段兜底（画布节点 / 属性面板 / 试运行步骤表统一入口）：
 * 用户显式标题 → 业务组件按当前 cfg 推断默认 → 组件 label。
 *
 * @param def       物料定义（算子/虚拟节点没有 defaultTitle，直接落 label）
 * @param userTitle 画布 properties.title（用户填的正本，空白等同未填）
 * @param cfg       组件配置 data 解析后的对象；data 为空或非法 JSON 时传 null/{}
 */
export function resolveNodeTitle(
  def: Pick<CmpDef, 'label' | 'defaultTitle'> | undefined,
  userTitle?: string | null,
  cfg?: unknown
): string {
  const custom = userTitle?.trim();
  if (custom) {
    return custom;
  }
  if (def?.defaultTitle) {
    try {
      const inferred = def.defaultTitle(cfg ?? {});
      if (inferred) {
        return inferred;
      }
    } catch {
      // cfg 形态异常时静默回退 label
    }
  }
  return def?.label ?? '';
}
