/**
 * ElNode 模型树 + 投影 + 坐标缓存 + 选中态恢复。
 *
 * 数据流：
 *   CmpProperty ──parseCmpProperty──▶ ElNode 树（唯一数据源）
 *   ElNode 树  ──projectToGraph──▶ Vue Flow nodes[] + edges[]（画布投影）
 *   ElNode 树  ──serializeToCmpProperty──▶ CmpProperty（保存）
 *
 * 编辑动作全部改树，然后 projectToGraph 整体重投影；
 * 坐标缓存（id→{x,y}）跨重投影保留用户拖拽后的位置，选中态按 id 恢复。
 */

import { inject, provide, ref, type InjectionKey, type Ref } from 'vue';
import type { Edge, Node } from '@vue-flow/core';
import type { CmpProperty } from '@/api/databus/el/types';
import { getDef, resolveDefByCmpId, defaultCmpId, type CmpDef } from '../cmp-defs';

// ────────────────────────────────────────────────────────────────
// 1. ElNode 模型（与 client ELNode 同构，字段命名沿用本项目）
// ────────────────────────────────────────────────────────────────

/**
 * 前端模型树的节点。是画布唯一数据源，所有编辑动作都落到这棵树上。
 * - type 为 EL 关键字时是算子（THEN/IF/SWITCH/...），可能含 condition/children
 * - type 为 'NodeComponent' 时是业务组件叶子，cmpId 必填
 */
export interface ElNode {
  /** 画布稳定 id（uuid 风格），用于投影时 reconcile 与坐标缓存 */
  id: string;
  /** THEN/IF/SWITCH/FOR/WHILE/ITERATOR/CATCH/WHEN/AND/OR/NOT/CHAIN/NodeComponent */
  type: string;
  /** 业务组件的 LiteFlow nodeId（叶子必填） */
  cmpId?: string;
  /** 算子的条件位节点（IF/SWITCH/循环） */
  condition?: ElNode;
  /** 子分支（THEN/WHEN/IF/SWITCH/CATCH/AND/OR/CHAIN） */
  children?: ElNode[];
  /** LiteFlow tag 属性 */
  tag?: string;
  /** LiteFlow data 属性 */
  data?: string;
  /** 该节点在父算子中的分支标签: true/false/caseN/异常 等 */
  branchLabel?: string;
  /** 所属父算子的 id（便于反向查找） */
  parentOperatorId?: string;
  /** 拖拽位置缓存（不参与 EL 序列化，仅投影恢复坐标用） */
  cachedPosition?: { x: number; y: number };
}

// ────────────────────────────────────────────────────────────────
// 2. 节点尺寸常量（与 cmp-defs 配合，供投影器与 dagre 共用）
// ────────────────────────────────────────────────────────────────

export const NODE_W = 150;
export const NODE_H = 56;
export const GATEWAY_W = 56;
export const GATEWAY_H = 56;
export const JUNCTION_W = 16;
export const JUNCTION_H = 16;
/** 默认起始坐标（start 节点位置；仅投影器内部使用） */
const START_X = 40;
const START_Y = 40;
/** 默认节点间距（投影时初始摆放，dagre 会重排）
 *  默认走 TB 方向：cursorY 递增、cursorX 固定，
 *  与 handle Top/Bottom 方位一致，避免横向排布导致连线绕圈。 */
export const NODE_GAP_X = 210;
export const NODE_GAP_Y = 100;

// ────────────────────────────────────────────────────────────────
// 3. CmpNodeData（画布节点 data 结构）
// ────────────────────────────────────────────────────────────────

/**
 * 画布节点 data。算子不做物理嵌套容器，结构语义全部拍平到节点字段：
 * - operator：区分算子网关与业务卡
 * - gatewayKind：WHEN/CATCH/AND/OR/NOT 自建网关的算子类型
 * - outlets：网关出口句柄定义，供投影与 SWITCH 增删 case 用
 * - isCondition：IF/SWITCH/循环的 condition 组件本身充当网关
 * - junctionOf / placeholderOf：汇合点/空槽占位关联的算子 id，用于级联删除与填槽
 */
export interface CmpNodeData {
  defType: string;
  cmpId: string;
  tag: string;
  data: string;
  label: string;
  color: string;
  virtual: boolean;
  operator?: boolean;
  /** 自建网关的算子类型（WHEN/CATCH/AND/OR/NOT） */
  gatewayKind?: string;
  /** IF/SWITCH/循环的 condition 组件标记（本身是网关） */
  isCondition?: boolean;
  /** 该节点关联的算子 id（junction/placeholder 反向找到所属算子） */
  junctionOf?: string;
  placeholderOf?: string;
  /** 网关出口句柄定义：[{handle, label}]，SWITCH 的 case 列表也走这里 */
  outlets?: { handle: string; label: string }[];
  /** SWITCH 的 case 名称列表（用于属性面板编辑，与 outlets 同步） */
  cases?: string[];
  /** FOR 循环参数 */
  forStart?: string;
  forEnd?: string;
  forStep?: string;
  [key: string]: unknown;
}

// ────────────────────────────────────────────────────────────────
// 4. 投影上下文（单次 projectToGraph 调用内有效）
// ────────────────────────────────────────────────────────────────

interface ProjectContext {
  nodes: Node<CmpNodeData>[];
  edges: Edge[];
  /** 每次投影递增的序号，用于生成唯一 id */
  seq: number;
  /** 坐标缓存：ElNode.id → {x,y}，跨重投影保留用户拖拽位置 */
  positionCache: Map<string, { x: number; y: number }>;
  /** 本次投影中已产出的节点 id 集合（用于 detect 重复） */
  produced: Set<string>;
  /** 默认摆放坐标（递增） */
  cursorX: number;
  cursorY: number;
}

/** 递归单元的端口：父算子只连接子单元的首尾 */
interface Port {
  startId: string;
  endId: string;
}

// ────────────────────────────────────────────────────────────────
// 5. 解析：CmpProperty → ElNode 树
// ────────────────────────────────────────────────────────────────

let elNodeSeq = 0;
function genElNodeId(): string {
  elNodeSeq += 1;
  return `el_${Date.now().toString(36)}_${elNodeSeq}`;
}

/**
 * CmpProperty 树 → ElNode 树。
 * 保留 ElNode.id 给每个节点（叶子与算子都给），用于投影时坐标缓存。
 */
function parseCmpProperty(cmp: CmpProperty | null | undefined): ElNode | null {
  if (!cmp) return null;
  return parseNode(cmp, undefined);
}

function parseNode(cmp: CmpProperty, parentOperatorId: string | undefined): ElNode {
  const def = getDef(cmp.type);
  const isOperator = !!def?.operator;
  const node: ElNode = {
    id: genElNodeId(),
    type: cmp.type,
    parentOperatorId
  };

  if (!isOperator) {
    // 业务组件叶子
    node.cmpId = cmp.id ?? '';
    if (cmp.properties?.tag) node.tag = cmp.properties.tag;
    if (cmp.properties?.data) node.data = cmp.properties.data;
    return node;
  }

  // 算子
  if (cmp.condition) {
    node.condition = parseNode(cmp.condition, node.id);
  }
  if (cmp.children && cmp.children.length > 0) {
    node.children = cmp.children.map((c) => parseNode(c, node.id));
  }
  if (cmp.properties?.tag) node.tag = cmp.properties.tag;
  return node;
}

// ────────────────────────────────────────────────────────────────
// 6. 序列化：ElNode 树 → CmpProperty（保存用，纯字段映射）
// ────────────────────────────────────────────────────────────────

/**
 * ElNode 树 → CmpProperty。不读画布 nodes/edges，直接序列化模型树。
 * virtual 节点（start/end）跳过——它们是 LiteFlow EL 的隐式边界，不写入链路 JSON。
 */
function serializeToCmpProperty(root: ElNode | null): CmpProperty | null {
  if (!root) return null;
  const result = serializeNode(root);
  return result;
}

function serializeNode(node: ElNode): CmpProperty | null {
  const def = getDef(node.type);
  // virtual 节点（start/end）不参与序列化：LiteFlow EL 的边界是隐式的
  if (def?.virtual) return null;
  const isOperator = !!def?.operator;

  // CHAIN 特例：后端没有 ChainParser（JSON→EL 方向缺失），
  // 把 CHAIN 转成普通 NodeComponent + id=chainId，后端 generateEL 输出 chainId，
  // LiteFlow 引擎自动在 chainMap 里查找同名子链
  if (node.type === 'CHAIN') {
    const leaf: CmpProperty = {
      id: node.cmpId || node.tag || node.id,
      type: 'NodeComponent'
    };
    if (node.tag) leaf.properties = { tag: node.tag };
    return leaf;
  }

  if (!isOperator) {
    // 业务叶子
    const leaf: CmpProperty = {
      id: node.cmpId || undefined,
      type: 'NodeComponent'
    };
    if (node.tag || node.data) {
      leaf.properties = {
        ...(node.tag ? { tag: node.tag } : {}),
        ...(node.data ? { data: node.data } : {})
      };
    }
    return leaf;
  }

  // 算子
  const prop: CmpProperty = { type: node.type };
  if (node.condition) {
    const cond = serializeNode(node.condition);
    if (cond) prop.condition = cond;
  }
  if (node.children && node.children.length > 0) {
    const mapped = node.children
      .filter((c): c is ElNode => !!c)
      .map(serializeNode)
      .filter((c): c is CmpProperty => c !== null);
    if (mapped.length > 0) prop.children = mapped;
  }
  if (node.tag) {
    prop.properties = { tag: node.tag };
  }
  return prop;
}

// ────────────────────────────────────────────────────────────────
// 7. 投影：ElNode 树 → Vue Flow nodes[] + edges[]
// ────────────────────────────────────────────────────────────────

/**
 * ElNode 树 → 平级 nodes + edges。
 * 整体重投影：每次调用都全量产出 nodes/edges，坐标从 positionCache 按 id 恢复。
 *
 * 摊平规则：
 * - 业务叶子：建 1 个业务卡节点
 * - THEN：不建节点，子项首尾串联
 * - IF/SWITCH/循环：condition 充当网关 + 1 个 junction；分支用 sourceHandle 区分
 * - WHEN/CATCH/AND/OR/NOT：自建 gateway + 1 个 junction
 * - CHAIN：渲染为引用节点
 */
function projectToGraph(
  root: ElNode | null,
  positionCache: Map<string, { x: number; y: number }>,
  selectedIds: Set<string> = new Set()
): { nodes: Node<CmpNodeData>[]; edges: Edge[] } {
  const ctx: ProjectContext = {
    nodes: [],
    edges: [],
    seq: 0,
    positionCache,
    produced: new Set(),
    cursorX: START_X,
    cursorY: START_Y + NODE_GAP_Y
  };

  if (!root) {
    // 空画布：不产出任何节点（start/end 改为用户手动从物料区拖入）
    return { nodes: ctx.nodes, edges: ctx.edges };
  }

  projectNode(root, ctx, undefined);

  // 恢复选中态：Vue Flow Node 的 selected 是可选字段，用类型断言写入
  for (const n of ctx.nodes) {
    if (selectedIds.has(n.id)) {
      (n as Node<CmpNodeData> & { selected?: boolean }).selected = true;
    }
  }

  return { nodes: ctx.nodes, edges: ctx.edges };
}

/** 投影单个 ElNode，返回 {startId, endId} 端口 */
function projectNode(node: ElNode, ctx: ProjectContext, parentOperatorId: string | undefined): Port {
  const def = getDef(node.type);
  const isOperator = !!def?.operator;

  // ── 业务组件叶子 ──
  if (!isOperator) {
    const cmpDef = resolveDefByCmpId(node.cmpId ?? '') ?? fallbackDef(node.cmpId ?? '');
    const id = node.id;
    // def.virtual: start/end 是虚拟节点，不参与 EL 序列化（投影后仍可手动删除，仅作视觉标记）
    const isVirtual = !!def?.virtual;
    const data: CmpNodeData = {
      defType: cmpDef.type,
      cmpId: node.cmpId ?? '',
      tag: node.tag ?? '',
      data: node.data ?? '',
      label: cmpDef.label,
      color: cmpDef.color,
      virtual: isVirtual
    };
    const pos = getPosition(ctx, id);
    ctx.nodes.push({
      id,
      type: 'cmp',
      position: pos,
      data,
      style: isVirtual
        ? { width: `${GATEWAY_W}px`, height: `${GATEWAY_H}px` }
        : { width: `${NODE_W}px` },
      deletable: true
    });
    ctx.produced.add(id);
    return { startId: id, endId: id };
  }

  // ── 算子 ──
  switch (node.type) {
    case 'THEN':
      return projectThen(node, ctx);
    case 'WHEN':
      return projectWhen(node, ctx);
    case 'IF':
      return projectIf(node, ctx);
    case 'SWITCH':
      return projectSwitch(node, ctx);
    case 'FOR':
    case 'WHILE':
    case 'ITERATOR':
      return projectLoop(node, ctx);
    case 'CATCH':
      return projectCatch(node, ctx);
    case 'AND':
    case 'OR':
    case 'NOT':
      return projectBoolean(node, ctx);
    case 'CHAIN':
      return projectChain(node, ctx);
    default:
      // 未知算子退化为业务节点
      return projectLeafFallback(node, ctx);
  }
}

// ── THEN：不建网关，子项首尾串联 ──
function projectThen(node: ElNode, ctx: ProjectContext): Port {
  const children = node.children ?? [];
  if (children.length === 0) {
    // 空 THEN：THEN 是隐式算子不建网关，用 placeholder 给 start 提供连边目标，
    // 文案提示用户往槽里拖节点。槽位身份 placeholderOf=自身 id + handle='then'：
    // 只有带着身份，拖到虚框本体时 findPlaceholderAt 才能认出它并由
    // replacePlaceholder 回填（children 为空，追加即落到 children[0]；
    // THEN 自身注册为 operator，opNode 即自身）。
    // 注意：拖到虚框上下两条 seq 边属于「线上插入」，节点进外层链路，虚框保留——
    // 框归框、边归边，落点所见即所得。
    const ph = buildPlaceholder(ctx, node.id, '拖入业务节点', node.id, 'then');
    return { startId: ph.id, endId: ph.id };
  }
  let prevEnd: string | undefined;
  let firstStart: string | undefined;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    let cp: Port;
    if (child) {
      cp = projectNode(child, ctx, node.id);
    } else {
      // 稀疏空洞 = 串行空槽（空分支「线上插入」后保留的虚框，见 makeThenWithTailSlot）：
      // 与空 THEN 的虚框同款身份（placeholderOf=THEN id + handle='then'），
      // 额外带 slotIndex 让 replacePlaceholder 精确回填该洞。
      // 序列化时空洞被 filter 过滤，不进 EL；撤销快照 JSON 往返会把洞变成 null，!child 同样命中。
      const ph = buildPlaceholder(
        ctx,
        `${node.id}_ph_${i}`,
        '拖入业务节点',
        node.id,
        'then',
        i
      );
      cp = { startId: ph.id, endId: ph.id };
    }
    if (!firstStart) firstStart = cp.startId;
    if (prevEnd) {
      // seq 边：parentId=THEN id，从 children[i-1] → children[i] 之间插入
      ctx.edges.push(
        buildEdge(
          `e_${prevEnd}_${cp.startId}`,
          prevEnd,
          cp.startId,
          'seq',
          undefined,
          undefined,
          undefined,
          { parentId: node.id, seqFromIndex: i - 1, seqToIndex: i }
        )
      );
    }
    prevEnd = cp.endId;
  }
  return { startId: firstStart ?? '', endId: prevEnd ?? '' };
}

// ── WHEN：gateway 扇出 → 各分支 → junction 汇合 ──
function projectWhen(node: ElNode, ctx: ProjectContext): Port {
  const gatewayId = node.id;
  const def = getDef('WHEN')!;
  const children = node.children ?? [];
  // 至少产出 2 个分支占位（让用户看到 WHEN 并行形态，知道往哪拖业务节点）
  const branchCount = Math.max(children.length, 2);
  const outlets = Array.from({ length: branchCount }, (_, i) => ({
    handle: `branch_${i}`,
    label: `并行${i + 1}`
  }));
  const gatewayNode = buildGatewayNode(ctx, gatewayId, def, 'WHEN', outlets, node.tag);
  ctx.nodes.push(gatewayNode);
  ctx.produced.add(gatewayId);

  const junctionId = `${gatewayId}_end`;
  // junction 的 inlets 与 gateway outlets 一一对应（每分支一个 target handle）
  const junctionNode = buildJunctionNode(ctx, junctionId, gatewayId, outlets);
  ctx.nodes.push(junctionNode);
  ctx.produced.add(junctionId);

  for (let i = 0; i < branchCount; i++) {
    const child = children[i];
    if (child) {
      const cp = projectNode(child, ctx, node.id);
      if (cp.startId) {
        ctx.edges.push(
          buildEdge(
            `e_${gatewayId}_${i}`, gatewayId, cp.startId, 'branch', outlets[i].handle,
            undefined, undefined,
            { parentId: gatewayId, branchIndex: i }
          )
        );
      }
      if (cp.endId) {
        ctx.edges.push(
          buildEdge(
            `e_${i}_${junctionId}`, cp.endId, junctionId, 'merge',
            undefined, undefined, outlets[i].handle,
            { parentId: gatewayId, branchIndex: i }
          )
        );
      }
    } else {
      // 空分支槽（稀疏数组空洞/超出 children.length）：补 placeholder
      const phId = `${gatewayId}_ph_${outlets[i].handle}`;
      buildPlaceholder(ctx, phId, `空${outlets[i].label}`, gatewayId, outlets[i].handle);
      ctx.edges.push(
        buildEdge(
          `e_${gatewayId}_${outlets[i].handle}_ph`, gatewayId, phId, 'jump', outlets[i].handle, outlets[i].label,
          undefined,
          { parentId: gatewayId, branchIndex: i }
        )
      );
      ctx.edges.push(
        buildEdge(
          `e_ph_${outlets[i].handle}_${junctionId}`, phId, junctionId, 'merge',
          undefined, undefined, outlets[i].handle,
          { parentId: gatewayId, branchIndex: i }
        )
      );
    }
  }
  return { startId: gatewayId, endId: junctionId };
}

// ── IF：condition 充当网关，true/false 两个 sourceHandle ──
function projectIf(node: ElNode, ctx: ProjectContext): Port {
  // 无 condition：用 IF 自己的 def 产出菱形网关，让用户看到 IF 的视觉形态
  // （而不是走 fallback leaf 把 IF 当业务卡渲染——这就是用户报「IF 灰色长方形」的根因）
  const ifDef = getDef('IF')!;
  const outlets = [
    { handle: 'true', label: '真' },
    { handle: 'false', label: '假' }
  ];
  // condition 存在则用 condition 的 id + def；否则用 IF 节点自己的 id + IF def
  let condId: string;
  let condDef: CmpDef = ifDef;
  let condTag: string | undefined = node.tag;
  if (node.condition) {
    const realCondDef = resolveDefByCmpId(node.condition.cmpId ?? '');
    if (realCondDef) condDef = realCondDef;
    condTag = node.condition.tag ?? condTag;
    condId = node.condition.id;
  } else {
    condId = node.id;
  }
  const condNode = buildConditionGatewayNode(ctx, condId, condDef, outlets, condTag);
  ctx.nodes.push(condNode);
  ctx.produced.add(condId);

  const junctionId = `${condId}_end`;
  const junctionInlets = [
    { handle: 'true', label: '真' },
    { handle: 'false', label: '假' }
  ];
  const junctionNode = buildJunctionNode(ctx, junctionId, condId, junctionInlets);
  ctx.nodes.push(junctionNode);
  ctx.produced.add(junctionId);

  const children = node.children ?? [];
  const labels = ['true', 'false'];
  for (let i = 0; i < 2; i++) {
    const child = children[i];
    if (child) {
      const cp = projectNode(child, ctx, node.id);
      if (cp.startId) {
        ctx.edges.push(
          buildEdge(
            `e_${condId}_${labels[i]}`, condId, cp.startId, 'branch', labels[i], labels[i] === 'true' ? '真' : '假',
            undefined,
            { parentId: node.id, branchIndex: i }
          )
        );
      }
      if (cp.endId) {
        ctx.edges.push(
          buildEdge(
            `e_${labels[i]}_${junctionId}`, cp.endId, junctionId, 'merge', undefined, undefined, labels[i],
            { parentId: node.id, branchIndex: i }
          )
        );
      }
    } else {
      // 空分支槽（稀疏数组空洞/未初始化）：补 placeholder
      const phId = `${condId}_ph_${labels[i]}`;
      buildPlaceholder(ctx, phId, i === 0 ? '空真分支' : '空假分支', condId, labels[i]);
      ctx.edges.push(
        buildEdge(
          `e_${condId}_${labels[i]}_ph`, condId, phId, 'jump', labels[i], labels[i] === 'true' ? '真' : '假',
          undefined,
          { parentId: node.id, branchIndex: i }
        )
      );
      ctx.edges.push(
        buildEdge(
          `e_ph_${labels[i]}_${junctionId}`, phId, junctionId, 'merge', undefined, undefined, labels[i],
          { parentId: node.id, branchIndex: i }
        )
      );
    }
  }
  return { startId: condId, endId: junctionId };
}

// ── SWITCH：condition 充当网关，N 个 case 出口 ──
function projectSwitch(node: ElNode, ctx: ProjectContext): Port {
  // 无 condition：用 SWITCH 自己的 def 产出菱形网关 + 默认 1 个 case 占位
  const switchDef = getDef('SWITCH')!;
  const children = node.children ?? [];
  // 至少产出 1 个 case 占位（用户没拖入 case 时也能看到 SWITCH 形态）
  const caseCount = Math.max(children.length, 1);
  const outlets = Array.from({ length: caseCount }, (_, i) => ({
    handle: `case_${i + 1}`,
    label: `case${i + 1}`
  }));
  let condId: string;
  let condDef: CmpDef = switchDef;
  let condTag: string | undefined = node.tag;
  if (node.condition) {
    const realCondDef = resolveDefByCmpId(node.condition.cmpId ?? '');
    if (realCondDef) condDef = realCondDef;
    condTag = node.condition.tag ?? condTag;
    condId = node.condition.id;
  } else {
    condId = node.id;
  }
  const condNode = buildConditionGatewayNode(ctx, condId, condDef, outlets, condTag);
  // SWITCH 的 cases 字段供属性面板用
  condNode.data.cases = outlets.map((o) => o.label);
  ctx.nodes.push(condNode);
  ctx.produced.add(condId);

  const junctionId = `${condId}_end`;
  const junctionNode = buildJunctionNode(ctx, junctionId, condId, outlets);
  ctx.nodes.push(junctionNode);
  ctx.produced.add(junctionId);

  for (let i = 0; i < caseCount; i++) {
    const child = children[i];
    const handle = outlets[i].handle;
    const label = outlets[i].label;
    if (child) {
      const cp = projectNode(child, ctx, node.id);
      if (cp.startId) {
        ctx.edges.push(
          buildEdge(`e_${condId}_${handle}`, condId, cp.startId, 'branch', handle, label, undefined,
            { parentId: node.id, branchIndex: i })
        );
      }
      if (cp.endId) {
        ctx.edges.push(
          buildEdge(`e_${handle}_${junctionId}`, cp.endId, junctionId, 'merge', undefined, undefined, handle,
            { parentId: node.id, branchIndex: i })
        );
      }
    } else {
      // 空分支槽（稀疏数组空洞/超出 children.length）：补 placeholder
      const phId = `${condId}_ph_${handle}`;
      buildPlaceholder(ctx, phId, `空${label}`, condId, handle);
      ctx.edges.push(
        buildEdge(`e_${condId}_${handle}_ph`, condId, phId, 'jump', handle, label, undefined,
          { parentId: node.id, branchIndex: i })
      );
      ctx.edges.push(
        buildEdge(`e_ph_${handle}_${junctionId}`, phId, junctionId, 'merge', undefined, undefined, handle,
          { parentId: node.id, branchIndex: i })
      );
    }
  }
  return { startId: condId, endId: junctionId };
}

// ── FOR/WHILE/ITERATOR：condition 充当网关，DO 分支 → junction（不画回边） ──
function projectLoop(node: ElNode, ctx: ProjectContext): Port {
  // 无 condition：用循环算子自己的 def 产出菱形网关 + DO 占位
  const loopDef = getDef(node.type)!;
  const outlets = [{ handle: 'do', label: '循环体' }];
  let condId: string;
  let condDef: CmpDef = loopDef;
  let condTag: string | undefined = node.tag;
  if (node.condition) {
    const realCondDef = resolveDefByCmpId(node.condition.cmpId ?? '');
    if (realCondDef) condDef = realCondDef;
    condTag = node.condition.tag ?? condTag;
    condId = node.condition.id;
  } else {
    condId = node.id;
  }
  const condNode = buildConditionGatewayNode(ctx, condId, condDef, outlets, condTag);
  ctx.nodes.push(condNode);
  ctx.produced.add(condId);

  const junctionId = `${condId}_end`;
  const junctionNode = buildJunctionNode(ctx, junctionId, condId, outlets);
  ctx.nodes.push(junctionNode);
  ctx.produced.add(junctionId);

  const children = node.children ?? [];
  const child0 = children[0];
  if (child0) {
    const cp = projectNode(child0, ctx, node.id);
    if (cp.startId) {
      ctx.edges.push(buildEdge(`e_${condId}_do`, condId, cp.startId, 'branch', 'do', '循环体', undefined,
        { parentId: node.id, branchIndex: 0 }));
    }
    if (cp.endId) {
      ctx.edges.push(
        buildEdge(`e_do_${junctionId}`, cp.endId, junctionId, 'merge', undefined, undefined, 'do',
          { parentId: node.id, branchIndex: 0 })
      );
    }
  } else {
    // 空 DO 槽占位（children[0] 为 undefined/null 或 children 为空）
    const phId = `${condId}_ph_do`;
    buildPlaceholder(ctx, phId, '空循环体', condId, 'do');
    ctx.edges.push(buildEdge(`e_${condId}_do_ph`, condId, phId, 'jump', 'do', '循环体', undefined,
      { parentId: node.id, branchIndex: 0 }));
    ctx.edges.push(buildEdge(`e_ph_do_${junctionId}`, phId, junctionId, 'merge', undefined, undefined, 'do',
      { parentId: node.id, branchIndex: 0 }));
  }
  return { startId: condId, endId: junctionId };
}

// ── CATCH：gateway 两路 try/catch → junction ──
function projectCatch(node: ElNode, ctx: ProjectContext): Port {
  const gatewayId = node.id;
  const def = getDef('CATCH')!;
  const outlets = [
    { handle: 'try', label: '主体' },
    { handle: 'catch', label: '异常处理' }
  ];
  const gatewayNode = buildGatewayNode(ctx, gatewayId, def, 'CATCH', outlets, node.tag);
  ctx.nodes.push(gatewayNode);
  ctx.produced.add(gatewayId);

  const junctionId = `${gatewayId}_end`;
  const junctionNode = buildJunctionNode(ctx, junctionId, gatewayId, outlets);
  ctx.nodes.push(junctionNode);
  ctx.produced.add(junctionId);

  const children = node.children ?? [];
  const handles = ['try', 'catch'];
  const labels = ['主体', '异常'];
  for (let i = 0; i < 2; i++) {
    const child = children[i];
    if (child) {
      const cp = projectNode(child, ctx, node.id);
      if (cp.startId) {
        ctx.edges.push(
          buildEdge(`e_${gatewayId}_${handles[i]}`, gatewayId, cp.startId, 'branch', handles[i], labels[i], undefined,
            { parentId: node.id, branchIndex: i })
        );
      }
      if (cp.endId) {
        ctx.edges.push(
          buildEdge(`e_${handles[i]}_${junctionId}`, cp.endId, junctionId, 'merge', undefined, undefined, handles[i],
            { parentId: node.id, branchIndex: i })
        );
      }
    } else {
      // 空分支槽：补 placeholder
      const phId = `${gatewayId}_ph_${handles[i]}`;
      buildPlaceholder(ctx, phId, `空${labels[i]}`, gatewayId, handles[i]);
      ctx.edges.push(buildEdge(`e_${gatewayId}_${handles[i]}_ph`, gatewayId, phId, 'jump', handles[i], labels[i], undefined,
        { parentId: node.id, branchIndex: i }));
      ctx.edges.push(buildEdge(`e_ph_${handles[i]}_${junctionId}`, phId, junctionId, 'merge', undefined, undefined, handles[i],
        { parentId: node.id, branchIndex: i }));
    }
  }
  return { startId: gatewayId, endId: junctionId };
}

// ── AND/OR/NOT：gateway 扇出（AND/OR 两路、NOT 一路）→ junction ──
function projectBoolean(node: ElNode, ctx: ProjectContext): Port {
  const gatewayId = node.id;
  const def = getDef(node.type)!;
  const children = node.children ?? [];
  const childCount = node.type === 'NOT' ? 1 : 2;
  const labels =
    node.type === 'AND' ? ['与1', '与2'] : node.type === 'OR' ? ['或1', '或2'] : ['非'];
  const edgeLabels = node.type === 'AND' ? '+' : node.type === 'OR' ? '*' : '-';
  const outlets = Array.from({ length: childCount }, (_, i) => ({
    handle: `b${i + 1}`,
    label: labels[i]
  }));
  const gatewayNode = buildGatewayNode(ctx, gatewayId, def, node.type, outlets, node.tag);
  ctx.nodes.push(gatewayNode);
  ctx.produced.add(gatewayId);

  const junctionId = `${gatewayId}_end`;
  const junctionNode = buildJunctionNode(ctx, junctionId, gatewayId, outlets);
  ctx.nodes.push(junctionNode);
  ctx.produced.add(junctionId);

  for (let i = 0; i < childCount; i++) {
    const child = children[i];
    if (child) {
      const cp = projectNode(child, ctx, node.id);
      if (cp.startId) {
        ctx.edges.push(
          buildEdge(`e_${gatewayId}_b${i + 1}`, gatewayId, cp.startId, 'branch', `b${i + 1}`, edgeLabels, undefined,
            { parentId: node.id, branchIndex: i })
        );
      }
      if (cp.endId) {
        ctx.edges.push(
          buildEdge(`e_b${i + 1}_${junctionId}`, cp.endId, junctionId, 'merge', undefined, undefined, `b${i + 1}`,
            { parentId: node.id, branchIndex: i })
        );
      }
    } else {
      // 空分支槽：补 placeholder
      const phId = `${gatewayId}_ph_b${i + 1}`;
      buildPlaceholder(ctx, phId, `空${labels[i]}`, gatewayId, `b${i + 1}`);
      ctx.edges.push(buildEdge(`e_${gatewayId}_b${i + 1}_ph`, gatewayId, phId, 'jump', `b${i + 1}`, edgeLabels, undefined,
        { parentId: node.id, branchIndex: i }));
      ctx.edges.push(buildEdge(`e_ph_b${i + 1}_${junctionId}`, phId, junctionId, 'merge', undefined, undefined, `b${i + 1}`,
        { parentId: node.id, branchIndex: i }));
    }
  }
  return { startId: gatewayId, endId: junctionId };
}

// ── CHAIN：引用节点（业务卡样式） ──
function projectChain(node: ElNode, ctx: ProjectContext): Port {
  const id = node.id;
  const def = getDef('CHAIN')!;
  const data: CmpNodeData = {
    defType: 'CHAIN',
    cmpId: node.cmpId ?? node.tag ?? '',
    tag: node.tag ?? '',
    data: '',
    label: def.label,
    color: def.color,
    virtual: false,
    operator: true
  };
  const pos = getPosition(ctx, id);
  ctx.nodes.push({
    id,
    type: 'cmp',
    position: pos,
    data,
    style: { width: `${NODE_W}px` },
    deletable: true
  });
  ctx.produced.add(id);
  return { startId: id, endId: id };
}

// ── 兜底：把未知算子当业务卡渲染 ──
function projectLeafFallback(node: ElNode, ctx: ProjectContext): Port {
  const id = node.id;
  const def = fallbackDef(node.type);
  const data: CmpNodeData = {
    defType: node.type,
    cmpId: node.cmpId ?? '',
    tag: node.tag ?? '',
    data: node.data ?? '',
    label: def.label,
    color: def.color,
    virtual: false
  };
  const pos = getPosition(ctx, id);
  ctx.nodes.push({
    id,
    type: 'cmp',
    position: pos,
    data,
    style: { width: `${NODE_W}px` },
    deletable: true
  });
  ctx.produced.add(id);
  return { startId: id, endId: id };
}

// ────────────────────────────────────────────────────────────────
// 8. 节点构建辅助
// ────────────────────────────────────────────────────────────────

/** 自建网关节点（WHEN/CATCH/AND/OR/NOT）——圆形或菱形，由 GatewayNode.vue 渲染 */
function buildGatewayNode(
  ctx: ProjectContext,
  id: string,
  def: CmpDef,
  gatewayKind: string,
  outlets: { handle: string; label: string }[],
  tag?: string
): Node<CmpNodeData> {
  const pos = getPosition(ctx, id);
  return {
    id,
    type: 'gateway',
    position: pos,
    data: {
      defType: def.type,
      cmpId: '',
      tag: tag ?? '',
      data: '',
      label: def.label,
      color: def.color,
      virtual: false,
      operator: true,
      gatewayKind,
      outlets
    },
    style: { width: `${GATEWAY_W}px`, height: `${GATEWAY_H}px` },
    deletable: true
  };
}

/** 条件组件作为网关（IF/SWITCH/循环的 condition）——菱形，带多个 source handle */
function buildConditionGatewayNode(
  ctx: ProjectContext,
  id: string,
  condDef: CmpDef,
  outlets: { handle: string; label: string }[],
  tag?: string
): Node<CmpNodeData> {
  const pos = getPosition(ctx, id);
  return {
    id,
    type: 'gateway',
    position: pos,
    data: {
      defType: condDef.type,
      cmpId: id,
      tag: tag ?? '',
      data: '',
      label: condDef.label,
      color: condDef.color,
      virtual: false,
      operator: true,
      isCondition: true,
      outlets
    },
    style: { width: `${GATEWAY_W}px`, height: `${GATEWAY_H}px` },
    deletable: true
  };
}

/** 汇合锚点：小圆点，随分支结构增删，不可手动删除。
 *  inlets 决定顶边 target handle 数量与 id（每分支一个 handle，避免冲突）。 */
function buildJunctionNode(
  ctx: ProjectContext,
  id: string,
  gatewayId: string,
  inlets: { handle: string; label: string }[] = [{ handle: 'in', label: '' }]
): Node<CmpNodeData> {
  const pos = getPosition(ctx, id);
  return {
    id,
    type: 'junction',
    position: pos,
    data: {
      defType: 'junction',
      cmpId: '',
      tag: '',
      data: '',
      label: '',
      color: '#909399',
      virtual: false,
      junctionOf: gatewayId,
      outlets: inlets
    },
    style: { width: `${JUNCTION_W}px`, height: `${JUNCTION_H}px` },
    deletable: false
  };
}

/** 空槽占位：虚线框，拖入即填槽 */
function buildPlaceholder(
  ctx: ProjectContext,
  id: string,
  label: string,
  gatewayId?: string,
  handle?: string,
  slotIndex?: number
): Node<CmpNodeData> {
  const pos = getPosition(ctx, id);
  ctx.produced.add(id);
  const node: Node<CmpNodeData> = {
    id,
    type: 'placeholder',
    position: pos,
    data: {
      defType: 'placeholder',
      cmpId: '',
      tag: '',
      data: '',
      label,
      color: '#c0c4cc',
      virtual: false,
      placeholderOf: gatewayId,
      ...(handle ? { [HANDLE_KEY]: handle } : {}),
      ...(slotIndex !== undefined ? { [SLOT_INDEX_KEY]: slotIndex } : {})
    },
    style: { width: `${NODE_W}px`, height: `${NODE_H}px` },
    deletable: false
  };
  ctx.nodes.push(node);
  return node;
}

const HANDLE_KEY = '__placeholderHandle__';
const SLOT_INDEX_KEY = '__placeholderSlotIndex__';

/** 从 placeholder data 取回 handle（投影器内部约定） */
export function getPlaceholderHandle(data: CmpNodeData): string | undefined {
  return data[HANDLE_KEY] as string | undefined;
}

/** 从 placeholder data 取回 THEN 串行空槽的 children 索引（投影器内部约定）。
 *  空 THEN 的整槽虚框不带索引（回填时追加到首个空洞/末尾）。 */
export function getPlaceholderSlotIndex(data: CmpNodeData): number | undefined {
  const v = data[SLOT_INDEX_KEY];
  return typeof v === 'number' ? v : undefined;
}

/** 这条边在 ElNode 树里的语义锚点——投影层到语义层的直接映射，
 *  让 insertOnEdge 等操作无需用画布节点 id 反推树位置。 */
export interface EdgeTreeAnchor {
  /** 这条边所属的父算子 id（THEN/IF/SWITCH/WHEN/循环/CATCH/布尔 的 id；start 链的 seq 边是 THEN id） */
  parentId: string;
  /** 分支索引：THEN seq 无；IF 0=true/1=false；WHEN 0/1/2...；SWITCH case_N→N-1；循环 0；CATCH try=0/catch=1；布尔 b1=0/b2=1 */
  branchIndex?: number;
  /** seq 边专用：在 THEN.children 中，source 所在的 child 索引（seqFromIndex → seqToIndex 即插入点） */
  seqFromIndex?: number;
  /** seq 边专用：在 THEN.children 中，target 所在的 child 索引——新节点应插在此位置 */
  seqToIndex?: number;
}

function buildEdge(
  id: string,
  source: string,
  target: string,
  kind: string,
  sourceHandle?: string,
  label?: string,
  targetHandle?: string,
  treeAnchor?: EdgeTreeAnchor
): Edge {
  const data: Record<string, unknown> = { kind };
  if (treeAnchor) data.treeAnchor = treeAnchor;
  const edge: Edge = {
    id,
    source,
    target,
    data
  };
  if (sourceHandle) edge.sourceHandle = sourceHandle;
  if (targetHandle) edge.targetHandle = targetHandle;
  if (label) edge.label = label;
  return edge;
}

/** 从缓存取坐标，无缓存则用 cursor 默认摆放（TB 方向：y 递增、x 固定） */
function getPosition(ctx: ProjectContext, id: string): { x: number; y: number } {
  const cached = ctx.positionCache.get(id);
  if (cached) return cached;
  const pos = { x: ctx.cursorX, y: ctx.cursorY };
  ctx.cursorY += NODE_GAP_Y;
  return pos;
}

function fallbackDef(type: string): CmpDef {
  return {
    type,
    label: type,
    desc: '未注册组件',
    color: '#909399',
    icon: 'ph:question'
  };
}

// ────────────────────────────────────────────────────────────────
// 9. 树遍历辅助（编辑 API 用）
// ────────────────────────────────────────────────────────────────

/** 在子树上递归查找节点，返回节点引用或 null */
function findInSubtree(node: ElNode, id: string): ElNode | null {
  if (node.id === id) return node;
  if (node.condition) {
    const found = findInSubtree(node.condition, id);
    if (found) return found;
  }
  if (node.children) {
    for (const child of node.children) {
      if (!child) continue;
      const found = findInSubtree(child, id);
      if (found) return found;
    }
  }
  return null;
}

/** 查找节点的父位置：返回 { parent, index, inCondition }
 *  - inCondition=true：节点是 parent.condition（index 无意义）
 *  - inCondition=false：节点是 parent.children[index]
 * 找不到返回 null（根节点或不存在）
 */
interface ParentPos {
  parent: ElNode;
  index: number;
  inCondition: boolean;
}
function findParentInSubtree(node: ElNode, id: string): ParentPos | null {
  if (node.condition && node.condition.id === id) {
    return { parent: node, index: -1, inCondition: true };
  }
  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (!child) continue;
      if (child.id === id) {
        return { parent: node, index: i, inCondition: false };
      }
      const found = findParentInSubtree(child, id);
      if (found) return found;
    }
  }
  if (node.condition) {
    const found = findParentInSubtree(node.condition, id);
    if (found) return found;
  }
  return null;
}

/** 克隆 ElNode 树（撤销快照用，深拷贝断开响应式引用） */
export function cloneElNode(node: ElNode | null): ElNode | null {
  if (!node) return null;
  return JSON.parse(JSON.stringify(node)) as ElNode;
}

// ────────────────────────────────────────────────────────────────
// 10. useElTreeModel composable（状态 + 编辑入口 + 投影 + 坐标缓存）
// ────────────────────────────────────────────────────────────────

/**
 * 前端模型树状态。唯一数据源，所有编辑改树后由调用方触发重投影。
 *
 * 编辑动作约定：
 *   1. 调用本 composable 的 mutate 方法改树（root.value 响应式更新）
 *   2. 由调用方（useCanvasController）调 project(selectedIds) 拿新 nodes/edges
 *   3. 由调用方 setNodes/setEdges 写回 Vue Flow store
 *
 * 树结构变更不自动触发投影——避免编辑途中半投影；由控制器在合适时机统一投影。
 */
export function useElTreeModel() {
  /** 模型树根节点 */
  const root: Ref<ElNode | null> = ref(null);
  /** 坐标缓存：ElNode.id → {x,y}，跨重投影保留 */
  const positionCache = new Map<string, { x: number; y: number }>();

  /**
   * 从 CmpProperty 载入：解析为 ElNode 树，清空坐标缓存（新图）。
   * 非空输入自动用 THEN(start, parsed, end) 包裹——
   * start/end 是 virtual 节点，序列化时自动过滤，不影响 LiteFlow EL；
   * 空输入（清空画布/页面刷新）→ root 保持 null → 投影返回空画布。
   */
  function loadFromCmpProperty(cmp: CmpProperty | null) {
    positionCache.clear();
    if (!cmp) {
      root.value = null;
      return;
    }
    const parsed = parseCmpProperty(cmp);
    if (!parsed) {
      root.value = null;
      return;
    }
    const startNode = makeLeaf('start');
    const endNode = makeLeaf('end');
    const thenWrap: ElNode = {
      id: genElNodeId(),
      type: 'THEN',
      children: [startNode, parsed, endNode]
    };
    parsed.parentOperatorId = thenWrap.id;
    root.value = thenWrap;
  }

  /** 投影到 Vue Flow nodes/edges（整体重投影） */
  function project(selectedIds: Set<string> = new Set()): {
    nodes: Node<CmpNodeData>[];
    edges: Edge[];
  } {
    return projectToGraph(root.value, positionCache, selectedIds);
  }

  /** 序列化为 CmpProperty（保存用，不读画布） */
  function toCmpProperty(): CmpProperty | null {
    return serializeToCmpProperty(root.value);
  }

  /** 缓存节点拖拽后的位置（onNodeDragStop 调用） */
  function cachePosition(id: string, x: number, y: number) {
    positionCache.set(id, { x, y });
  }

  /** 整树替换（撤销栈恢复用）：替换 root 并保留坐标缓存 */
  function replaceTree(newRoot: ElNode | null) {
    root.value = newRoot;
  }

  /** 在树上递归查找节点 */
  function findNode(id: string): ElNode | null {
    if (!root.value) return null;
    return findInSubtree(root.value, id);
  }

  /** 生成新 ElNode 叶子 */
  function makeLeaf(defType: string): ElNode {
    const def = getDef(defType);
    const isOperator = !!def?.operator;
    const isVirtual = !!def?.virtual;
    // virtual 节点（start/end）保留 type 与固定 cmpId，不走 NodeComponent + 随机 cmpId 的默认路径
    return {
      id: genElNodeId(),
      type: isOperator ? defType : (isVirtual ? defType : 'NodeComponent'),
      cmpId: isOperator ? undefined : (isVirtual ? defType : defaultCmpId(defType)),
      parentOperatorId: undefined
    };
  }

  /** 生成新 ElNode 算子（含 children/condition 占位） */
  function makeOperator(defType: string): ElNode {
    return {
      id: genElNodeId(),
      type: defType,
      parentOperatorId: undefined
    };
  }

  /**
   * 拖到画布空白：作为独立顺序节点追加到主链末尾（对叶子与算子均适用）。
   * - root 为 null：包成 THEN(newChild)
   * - root 是 THEN：push 到 children
   * - root 是其他算子：包成 THEN(旧root, newChild)
   */
  function appendChildToRoot(child: ElNode) {
    if (!root.value) {
      const thenNode: ElNode = {
        id: genElNodeId(),
        type: 'THEN',
        children: [child]
      };
      child.parentOperatorId = thenNode.id;
      root.value = thenNode;
      return;
    }
    if (root.value.type === 'THEN') {
      if (!root.value.children) root.value.children = [];
      child.parentOperatorId = root.value.id;
      root.value.children.push(child);
      return;
    }
    // 包一层 THEN
    const oldRoot = root.value;
    const newThen: ElNode = {
      id: genElNodeId(),
      type: 'THEN',
      children: [oldRoot, child]
    };
    oldRoot.parentOperatorId = newThen.id;
    child.parentOperatorId = newThen.id;
    root.value = newThen;
  }

  /**
   * 在锚点节点前面插入兄弟节点（同 parent 的 children 数组）。
   * 锚点必须是某 parent 的 children[i]，不能是 condition 或根。
   * 插入后新节点与锚点平级。
   */
  function insertBefore(anchorId: string, newNode: ElNode): boolean {
    if (!root.value) return false;
    const pos = findParentInSubtree(root.value, anchorId);
    if (!pos || pos.inCondition) return false;
    const siblings = pos.parent.children!;
    newNode.parentOperatorId = pos.parent.id;
    siblings.splice(pos.index, 0, newNode);
    return true;
  }

  /**
   * 在锚点节点后面插入兄弟节点。
   */
  function insertAfter(anchorId: string, newNode: ElNode): boolean {
    if (!root.value) return false;
    const pos = findParentInSubtree(root.value, anchorId);
    if (!pos || pos.inCondition) return false;
    const siblings = pos.parent.children!;
    newNode.parentOperatorId = pos.parent.id;
    siblings.splice(pos.index + 1, 0, newNode);
    return true;
  }

  /**
   * 替换节点：保留 id 与位置，重置 type/cmpId/tag/data/condition/children。
   * 用于 replaceNode（保留连线）与 replacePlaceholder（占位变真实叶子）。
   */
  function replaceNode(nodeId: string, defType: string): boolean {
    const node = findNode(nodeId);
    if (!node) return false;
    const def = getDef(defType);
    const isOperator = !!def?.operator;
    // 保留 id 与 parentOperatorId，重置其余字段
    node.type = isOperator ? defType : 'NodeComponent';
    node.cmpId = isOperator ? undefined : defaultCmpId(defType);
    node.tag = undefined;
    node.data = undefined;
    if (isOperator) {
      // 算子：清空 condition/children，等编辑动作填入
      node.condition = undefined;
      node.children = undefined;
    } else {
      // 叶子：清空 condition/children
      node.condition = undefined;
      node.children = undefined;
    }
    return true;
  }

  /**
   * 删除节点：从父的 children/condition 摘除。
   * - 叶子/算子：从父 children 摘除；若父 THEN children 变空，父也摘除（递归）
   * - condition：不允许直接删单删——改为级联删其所属算子（IF/SWITCH/循环不能无 condition）
   * - 根节点：清空 root
   */
  function removeNode(nodeId: string): boolean {
    if (!root.value) return false;
    if (root.value.id === nodeId) {
      root.value = null;
      return true;
    }
    const pos = findParentInSubtree(root.value, nodeId);
    if (!pos) return false;
    if (pos.inCondition) {
      // condition 节点：改为删除其所属算子（递归）
      return removeNode(pos.parent.id);
    }
    const siblings = pos.parent.children!;
    siblings.splice(pos.index, 1);
    // 父是 THEN 且已无任何真实子节点（稀疏空洞/null 不算）时，向上摘除空 THEN。
    // 典型路径：空分支线上插入产生的 THEN(节点+尾部空槽)，节点被删光后不应残留空 THEN
    // （会序列化成无意义的 THEN()）。摘除方式按爷爷类型区分：
    //  - 爷爷也是 THEN（顺序容器）：splice 收缩，继续链式上溯
    //  - 爷爷是分支槽位算子（IF/SWITCH/WHEN/CATCH/AND/OR/NOT/循环）：只能置空该槽，
    //    splice 会让后续分支顶位（IF 的 false 会顶成 true，分支语义错位）
    let emptyThen: ElNode | null =
      pos.parent.type === 'THEN' && (!pos.parent.children || pos.parent.children.every((c) => !c))
        ? pos.parent
        : null;
    while (emptyThen && root.value) {
      if (root.value.id === emptyThen.id) {
        root.value = null;
        break;
      }
      const gpPos = findParentInSubtree(root.value, emptyThen.id);
      if (!gpPos || gpPos.inCondition) break;
      if (gpPos.parent.type === 'THEN') {
        gpPos.parent.children!.splice(gpPos.index, 1);
        emptyThen =
          !gpPos.parent.children || gpPos.parent.children.every((c) => !c) ? gpPos.parent : null;
      } else {
        gpPos.parent.children![gpPos.index] = undefined as unknown as ElNode;
        emptyThen = null;
      }
    }
    return true;
  }

  /** 更新叶子节点的 cmpId/tag/data（属性面板编辑用） */
  function updateLeafData(nodeId: string, patch: Partial<Pick<ElNode, 'cmpId' | 'tag' | 'data'>>): boolean {
    const node = findNode(nodeId);
    if (!node) return false;
    if (patch.cmpId !== undefined) node.cmpId = patch.cmpId;
    if (patch.tag !== undefined) node.tag = patch.tag;
    if (patch.data !== undefined) node.data = patch.data;
    return true;
  }

  /** 更新算子节点的 tag（属性面板编辑用） */
  function updateOperatorTag(nodeId: string, tag: string): boolean {
    const node = findNode(nodeId);
    if (!node) return false;
    node.tag = tag;
    return true;
  }

  /** SWITCH 增 case：在 children 末尾追加一个空叶子（占位） */
  function addCase(switchId: string): boolean {
    const node = findNode(switchId);
    if (!node || node.type !== 'SWITCH') return false;
    if (!node.children) node.children = [];
    const leaf = makeLeaf('boCreate'); // 占位用任意业务类型，用户可后续替换
    leaf.parentOperatorId = switchId;
    node.children.push(leaf);
    return true;
  }

  /** SWITCH 删 case：移除 children[index] */
  function removeCase(switchId: string, index: number): boolean {
    const node = findNode(switchId);
    if (!node || node.type !== 'SWITCH' || !node.children) return false;
    if (index < 0 || index >= node.children.length) return false;
    if (node.children.length <= 1) return false; // 至少保留一个 case
    node.children.splice(index, 1);
    return true;
  }

  /** 创建一个空 THEN 节点（供分支包装等场景使用） */
  function makeThen(): ElNode {
    return {
      id: genElNodeId(),
      type: 'THEN',
      children: []
    };
  }

  /**
   * 创建 THEN(child + 尾部空槽)：空分支「线上插入」专用结构。
   * 尾部稀疏空洞在投影中是虚框（placeholder 保留，用户可继续填充/插线），
   * 序列化时被 filter 过滤，EL 输出仍是干净的 THEN(child)。
   */
  function makeThenWithTailSlot(child: ElNode): ElNode {
    const node: ElNode = {
      id: genElNodeId(),
      type: 'THEN',
      children: [child]
    };
    node.children[1] = undefined as unknown as ElNode;
    return node;
  }

  /** 获取树根的浅克隆（撤销快照用，避免响应式引用污染） */
  function snapshot(): ElNode | null {
    return cloneElNode(root.value);
  }

  return {
    root,
    loadFromCmpProperty,
    project,
    toCmpProperty,
    cachePosition,
    replaceTree,
    findNode,
    makeLeaf,
    makeOperator,
    makeThen,
    makeThenWithTailSlot,
    appendChildToRoot,
    insertBefore,
    insertAfter,
    replaceNode,
    removeNode,
    updateLeafData,
    updateOperatorTag,
    addCase,
    removeCase,
    snapshot
  };
}

// ────────────────────────────────────────────────────────────────
// 11. provide/inject（与 useCanvasController 同款契约）
// ────────────────────────────────────────────────────────────────

export type ElTreeModel = ReturnType<typeof useElTreeModel>;

export const EL_TREE_KEY = Symbol('el-tree-model') as InjectionKey<ElTreeModel>;

/** index.vue 创建并 provide；控制器/属性面板/大纲/预览 inject 同一实例 */
export function provideElTreeModel(): ElTreeModel {
  const model = useElTreeModel();
  provide(EL_TREE_KEY, model);
  return model;
}

export function useElTreeModelInject(): ElTreeModel {
  const model = inject(EL_TREE_KEY);
  if (!model) {
    throw new Error('useElTreeModelInject 必须在 provideElTreeModel 之后使用');
  }
  return model;
}
