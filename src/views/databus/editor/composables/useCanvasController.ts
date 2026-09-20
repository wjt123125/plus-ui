/**
 * 画布操作控制器。
 *
 * 画布是 ElNode 模型树的投影：所有编辑动作都走「改树 → 重投影 → setNodes/setEdges」，
 * 不直接增删画布上的 nodes/edges。结构变更后按需跑一次 autoLayout。
 * copy/paste/selectAll/deselect 保留在画布交互层（Vue Flow 原生能力）。
 */
import { inject, provide, reactive, ref, type InjectionKey, type Ref } from 'vue';
import { useVueFlow, type Node, type Rect } from '@vue-flow/core';
import { ElMessage } from 'element-plus';
import { getDef, isBooleanDef } from '../cmp-defs';
import { getPlaceholderHandle, getPlaceholderSlotIndex, GATEWAY_TOTAL_H, GATEWAY_W, JUNCTION_H, JUNCTION_W, NODE_GAP_Y, NODE_H, NODE_W, type CmpNodeData, type ElNode, type ElTreeModel, type EdgeTreeAnchor } from './useElTreeModel';

/** 组件选择弹层的使用场景 */
export type PickerMode = 'prepend' | 'append' | 'replace' | 'insertEdge';

/** 右键菜单场景 */
export type MenuScene = 'node' | 'edge' | 'blank';

export interface MenuState {
  visible: boolean;
  x: number;
  y: number;
  scene: MenuScene;
  nodeId: string | null;
  edgeId: string | null;
}

export interface PickerState {
  visible: boolean;
  /** 弹层左上角的视口坐标（clientX/clientY，不随缩放平移变化） */
  x: number;
  y: number;
  mode: PickerMode;
  /** 锚点节点：prepend/append/replace 时存在 */
  nodeId: string | null;
  /** 锚点边：insertEdge 时存在 */
  edgeId: string | null;
  /** 锚点组件类型（def.type）——弹窗无需引 VueFlow 即可计算推荐 */
  anchorDefType: string | null;
  /** 需排除的组件类型（如已存在的 singleton：start/end） */
  excludedTypes: string[];
}

interface CreateControllerOptions {
  treeModel: ElTreeModel;
  /** 编辑动作完成后入撤销栈 */
  pushHistory: () => void;
  /** 编辑动作完成后回调（供 index.vue 触发 EL 预览刷新） */
  onCommit?: () => void;
  /** 顶层共享的 dagre 排列实例（结构变更后调用） */
  autoLayout: (opts?: import('./useAutoLayout').AutoLayoutOptions) => void;
}

/** 剪贴板条目：业务叶子的轻量快照（不含画布坐标，paste 时追加到树末尾） */
interface ClipboardItem {
  defType: string;
  data: string;
}

const PASTE_OFFSET = 30;

export interface CanvasController {
  selectedId: Ref<string | null>;
  canPaste: Ref<boolean>;
  picker: PickerState;
  menu: MenuState;
  select: (id: string | null) => void;
  /** 左侧面板拖拽落画布 */
  insertNodeAt: (type: string, x: number, y: number) => void;
  /** 悬浮操作组/右键菜单/边「+」触发的四类结构操作入口 */
  openPicker: (payload: {
    x: number;
    y: number;
    mode: PickerMode;
    nodeId?: string | null;
    edgeId?: string | null;
  }) => void;
  closePicker: () => void;
  /** 弹层中选定某类组件后，按 mode 执行图修改 */
  pickDef: (defType: string) => void;
  /** 属性面板给 IF/WHILE 挂载/替换布尔条件件，返回条件件画布 id */
  attachCondition: (opId: string, defType: string) => string | null;
  openMenu: (payload: {
    x: number;
    y: number;
    scene: MenuScene;
    nodeId?: string | null;
    edgeId?: string | null;
  }) => void;
  closeMenu: () => void;
  requestDeleteNode: (id?: string) => Promise<void>;
  copy: (nodeId?: string) => void;
  paste: () => void;
  selectAll: () => void;
  deselect: () => void;
  /** 属性面板编辑后调：重投影 + 入栈 + EL 预览刷新 */
  commit: () => void;
  /** 双击边/属性面板编辑边 label：通过 edge.data.treeAnchor 定位父算子 → 改 outletLabels[branchIndex] → 重投影 */
  updateEdgeLabel: (edgeId: string, newLabel: string) => void;
  /** 一键 dagre 排列全图，坐标同步写回树缓存（跨重投影保留） */
  autoLayout: () => void;
  /** 拖拽过程中当前命中的 edge id（CmpBezierEdge 显示 + 圆圈）；与占位符命中互斥 */
  dragOverEdgeId: Ref<string | null>;
  /** 拖拽过程中当前命中的占位符 id（PlaceholderNode 虚框高亮）；与 edge 命中互斥 */
  dragOverPlaceholderId: Ref<string | null>;
  /** dragover 时调：统一裁决落点（虚框本体 → 填槽；边 → 线上插入；空白 → 追加链尾），
   *  与 insertNodeAt 共用 resolveDropTarget，保证高亮的目标就是松手生效的目标 */
  setDragOverTarget: (x: number, y: number) => void;
  /** drop/dragleave 时调：清空边与占位符高亮 */
  clearDragOverTarget: () => void;
}

export const CANVAS_CTRL_KEY = Symbol('canvas-controller') as InjectionKey<CanvasController>;

export function createCanvasController(options: CreateControllerOptions): CanvasController {
  const { treeModel, pushHistory, autoLayout: runAutoLayout } = options;
  const { getNodes, getEdges, findNode, findEdge, setNodes, setEdges, addSelectedNodes, getIntersectingNodes } =
    useVueFlow();

  const selectedId = ref<string | null>(null);
  const clipboard = ref<ClipboardItem[] | null>(null);
  const canPaste = ref(false);

  const picker = reactive<PickerState>({
    visible: false,
    x: 0,
    y: 0,
    mode: 'append',
    nodeId: null,
    edgeId: null,
    anchorDefType: null,
    excludedTypes: []
  });

  const menu = reactive<MenuState>({
    visible: false,
    x: 0,
    y: 0,
    scene: 'blank',
    nodeId: null,
    edgeId: null
  });

  function select(id: string | null) {
    selectedId.value = id;
  }

  /**
   * 重投影：读当前画布选中态 → treeModel.project → setNodes/setEdges。
   * 所有编辑动作完成后调一次，保留选中态与坐标缓存。
   */
  function reproject() {
    const selectedIds = new Set(
      getNodes.value.filter((n) => n.selected).map((n) => n.id)
    );
    const { nodes, edges } = treeModel.project(selectedIds);
    setNodes(nodes);
    setEdges(edges);
  }

  /** 编辑动作通用收尾：重投影 + 入栈 + EL 预览刷新 */
  function commit() {
    reproject();
    pushHistory();
    options.onCommit?.();
  }

  /** 双击边/属性面板编辑边 label：
   *  treeAnchor.branchIndex 定位 outlet → 改 outletLabels[branchIndex] → commit 重投影。
   *  seq 边（无 branchIndex）不响应——它不是分支边，没有可编辑的 outlet label。 */
  function updateEdgeLabel(edgeId: string, newLabel: string) {
    const edge = findEdge(edgeId);
    if (!edge) return;
    const anchor = (edge.data as { treeAnchor?: EdgeTreeAnchor } | undefined)?.treeAnchor;
    if (!anchor || anchor.branchIndex === undefined) return;
    treeModel.updateOutletLabel(anchor.parentId, anchor.branchIndex, newLabel);
    commit();
  }

  /** 一键 dagre 排列全图（含 fitView + 写回坐标缓存） */
  function autoLayout() {
    runAutoLayout({ fitView: true });
  }

  // ── 拖拽落画布 ──
  /**
   * 指针中心是否落在 IF/SWITCH/循环的条件菱形网关上。
   * 网关可能是算子自身（还没挂条件件）或独立的 condition 叶子（已挂），
   * 返回画布节点；调用方再经树模型定位所属算子。
   */
  function findConditionGatewayAt(x: number, y: number): Node<CmpNodeData> | null {
    const cx = x + NODE_W / 2;
    const cy = y + NODE_H / 2;
    for (const n of getNodes.value) {
      if (n.type !== 'gateway') continue;
      const d = n.data as CmpNodeData;
      if (!d.isCondition) continue;
      const w = n.dimensions?.width ?? GATEWAY_W;
      const h = n.dimensions?.height ?? GATEWAY_TOTAL_H;
      const p = n.computedPosition;
      if (cx >= p.x && cx <= p.x + w && cy >= p.y && cy <= p.y + h) return n;
    }
    return null;
  }

  /** 把布尔条件物料挂到算子的 condition 位（已挂则替换组件类型，保留画布 id 与分支连线），返回条件件 id */
  function attachCondition(opId: string, defType: string): string | null {
    const opNode = treeModel.findNode(opId);
    if (!opNode) return null;
    if (!opNode.condition) {
      const leaf = treeModel.makeLeaf(defType);
      leaf.parentOperatorId = opNode.id;
      opNode.condition = leaf;
    } else {
      treeModel.replaceNode(opNode.condition.id, defType);
    }
    return opNode.condition?.id ?? null;
  }

  /** 本档支持试运行的条件算子（条件件为 NodeBooleanComponent） */
  const BOOLEAN_CONDITION_OPS = new Set(['IF', 'WHILE']);

  /**
   * 拖业务/算子到画布，落点所见即所得（resolveDropTarget 统一裁决，与 dragover 高亮同源）：
   * - 落在 IF/WHILE 条件菱形：挂/替换布尔条件件（条件槽护栏，只收 boolean 物料）
   * - 指针中心落在占位符虚框本体（含 4px 抗抖动）：填充该槽
   * - 落在边上（即使边连着空槽）：一律按边自身语义在线上插入（insertOnEdge）——
   *   不做「端点是占位符就改成填槽」的隐性重定向。空 THEN 邻接的 seq 边插入后
   *   新节点进外层链路、虚框仍保留在画布上（用户看得到，可继续往里拖或删除）；
   *   网关空槽的 jump/merge 边插入后分支包装成 THEN(新节点+尾部空槽)，
   *   新节点在分支线上、虚框下移保留——空槽不再被线上插入悄悄吃掉
   * - 落在空白：appendChildToRoot + commit（不重排，保留用户对节点位置的控制）
   */
  function insertNodeAt(type: string, x: number, y: number) {
    const def = getDef(type);
    if (!def) return;
    if (def.singleton && getNodes.value.some((n) => (n.data as CmpNodeData).defType === def.type)) {
      ElMessage.warning(`「${def.label}」在画布上只能存在一个`);
      return;
    }

    // 条件槽护栏：布尔条件件只能进 IF/WHILE 的条件菱形；普通业务件不能进条件菱形
    const condGateway = findConditionGatewayAt(x, y);
    if (condGateway) {
      const gwElNode = treeModel.findNode(condGateway.id);
      const opNode =
        gwElNode && getDef(gwElNode.type)?.operator
          ? gwElNode
          : gwElNode?.parentOperatorId
            ? treeModel.findNode(gwElNode.parentOperatorId)
            : null;
      const opType = opNode?.type ?? '';
      if (BOOLEAN_CONDITION_OPS.has(opType)) {
        if (!isBooleanDef(def)) {
          ElMessage.warning(`「${opType}」的条件槽只能放入「条件判断」组件`);
          return;
        }
        const condId = attachCondition(opNode!.id, type);
        if (condId) {
          commit();
          select(condId);
          runAutoLayout({ fitView: false });
        }
        return;
      }
      // SWITCH/FOR/ITERATOR 条件件不是布尔组件，本档不支持配置
      ElMessage.warning(`「${getDef(opType)?.label ?? opType}」的条件组件本档暂不支持配置`);
      return;
    }
    if (isBooleanDef(def)) {
      ElMessage.warning('「条件判断」是布尔组件，请拖到 IF/WHILE 的条件菱形槽位上');
      return;
    }

    const target = resolveDropTarget(x, y);
    if (target?.kind === 'placeholder') {
      if (fillPlaceholder(target.id, type)) return;
      // fillPlaceholder 理论上不会失败（target 来自现役占位符）；失败则继续往下走兜底
    } else if (target?.kind === 'edge') {
      // insertOnEdge 内部已 commit() + runAutoLayout({ fitView: false })，这里不要重复调
      insertOnEdge(target.id, type);
      return;
    }

    // 追加到根前算一个默认坐标，避免新节点和已有节点（特别是 dagre 排好的分支结构）重叠：
    // Y 取所有节点最大 bottom + NODE_GAP_Y，X 对齐主链末端节点，找不到就用落点 x，
    // 让新节点排在主链正下方
    let newX = x;
    let newY = y;
    const canvasNodes = getNodes.value;
    if (canvasNodes.length > 0) {
      const bottom = (n: typeof canvasNodes[number]) => {
        const d = n.data as CmpNodeData;
        const h = d.defType === 'junction' ? JUNCTION_H : (d.operator ? GATEWAY_TOTAL_H : NODE_H);
        return n.position.y + h;
      };
      const maxBottom = canvasNodes.reduce((m, n) => Math.max(m, bottom(n)), 0);
      newY = maxBottom + NODE_GAP_Y;
      // X：主链末端节点（非 virtual 非 junction 非 placeholder）的 position.x，找不到就用落点 x
      const mainEnd = canvasNodes.toReversed().find((n) => {
        const d = n.data as CmpNodeData;
        return !d.virtual && !d.junctionOf && !d.placeholderOf;
      });
      newX = mainEnd ? mainEnd.position.x : x;
    }

    if (def.operator) {
      // 算子节点：追加到主链末尾，位置自动算好
      const op = treeModel.makeOperator(type);
      treeModel.cachePosition(op.id, newX, newY);
      treeModel.appendChildToRoot(op);
    } else {
      // 业务叶子：追加到主链末尾，缓存自动算好的坐标
      const leaf = treeModel.makeLeaf(type);
      treeModel.cachePosition(leaf.id, newX, newY);
      treeModel.appendChildToRoot(leaf);
    }
    commit();
  }

  /** 占位符命中容错（px）：以拖拽节点中心（即鼠标指针的 flow 坐标）为探测点，
   *  进入虚框本体后仅外扩这一点点抗事件抖动。不能用大外扩带——分支线与虚框邻接时，
   *  150×56 的拖拽节点在窄空隙里必然擦到虚框，会把「指针在线上」误判成填槽 */
  const PH_HIT_PAD = 4;

  /**
   * 落点命中检测：拖拽节点中心（=鼠标指针位置）进入 placeholder 虚框本体（含 PH_HIT_PAD
   * 极小容错）时返回其 id，否则 null。中心命中制——「指向哪就是哪」：
   * 指针在虚框内 → 填槽；指针在框外邻接的线上 → 交 findEdgeAt 判线上插入。
   * 用官方 getIntersectingNodes(rect, partially=true) 检测，相比手写矩形相交：
   *  - 命中坐标用 VueFlow 的 computedPosition（已应用 extent:'parent' 钳制、父容器位移等派生计算），
   *    dagre 重排后立刻同步，避免 store 与 DOM 不一致导致命中失败
   *  - 节点尺寸读取 VueFlow 内部异步测量后的 dimensions，placeholder 尺寸变化也能跟上
   * x/y 是新节点左上角（已由 onDrop 减过 NODE_W/2、NODE_H/2 转换而来）。
   */

  function findPlaceholderAt(x: number, y: number): string | null {
    const cx = x + NODE_W / 2;
    const cy = y + NODE_H / 2;
    const rect: Rect = {
      x: cx - PH_HIT_PAD,
      y: cy - PH_HIT_PAD,
      width: PH_HIT_PAD * 2,
      height: PH_HIT_PAD * 2
    };
    const hits = getIntersectingNodes(rect, true)
      .filter((n) => (n.data as CmpNodeData | undefined)?.placeholderOf);
    return hits[0]?.id ?? null;
  }

  /**
   * 拖拽落点的唯一裁决入口（insertNodeAt 松手与 setDragOverTarget 悬停共用，
   * 保证高亮的目标就是实际生效的目标）：
   *   1. 指针中心进入占位符虚框本体（含 4px 抗抖动）→ placeholder（填槽）
   *   2. 其余任何命中边的情况 → edge（一律在线上插入，不看边端点是否为占位符；
   *      空分支的 jump/merge 边会保槽包装成 THEN(新节点+空槽)，虚框不消失）
   *   3. 都不命中 → null（追加到主链末尾）
   */
  function resolveDropTarget(x: number, y: number):
    | { kind: 'placeholder'; id: string }
    | { kind: 'edge'; id: string }
    | null {
    const phId = findPlaceholderAt(x, y);
    if (phId) return { kind: 'placeholder', id: phId };
    const edgeId = findEdgeAt(x, y);
    return edgeId ? { kind: 'edge', id: edgeId } : null;
  }

  /** 填充占位符的统一收尾：改树成功 → commit + 不 fitView 重排，返回 false 表示槽位无效 */
  function fillPlaceholder(phId: string, defType: string): boolean {
    if (!replacePlaceholder(phId, defType)) return false;
    commit();
    // 填槽改变画布拓扑（语义空位被真实节点取代，下游链路与 merge 边路径随之变化），
    // 跑一次不 fitView 的重排，与 insertOnEdge 行为对齐；保留当前视口缩放/位置
    runAutoLayout({ fitView: false });
    return true;
  }

  /**
   * 落点命中检测：返回与新节点矩形最近距离 <10px 的 edge id（无则 null）。
   * 命中体用新节点矩形 9 点采样（4 角 + 4 边中点 + 中心）——视觉语义即"拖拽中的节点本体靠近边"，
   * 而非鼠标点靠近，体感更直观。VueFlow 无"点是否在 edge 上"的官方 API，需自写距离检测。
   *
   * 距离必须量到「屏幕上真正画出来的贝塞尔曲线」（edgeRenderedPolyline 按 handle 物理位置
   * 复算端点、三次贝塞尔分段采样），不能量节点中心连直线：网关扇出边起点是菱形底边按
   * outlet 分布的 handle（最大偏移半宽 28px），终点是分支节点顶边中点，中心连线相对实际
   * 曲线在整条扇出边上系统错位 14~40px——旧直线算法对扇出边几乎永远进不了 10px 阈值，
   * 表现为拖到扇出线上松手却追加到主链末尾、或错命中相邻的汇合边（节点跑到分支下面那条线）。
   * 端点节点用 computedPosition + dimensions（已应用 extent 钳制等派生计算）。
   */
  function findEdgeAt(x: number, y: number): string | null {
    const samples: ReadonlyArray<readonly [number, number]> = [
      [x, y],
      [x + NODE_W, y],
      [x, y + NODE_H],
      [x + NODE_W, y + NODE_H],
      [x + NODE_W / 2, y],
      [x + NODE_W / 2, y + NODE_H],
      [x, y + NODE_H / 2],
      [x + NODE_W, y + NODE_H / 2],
      [x + NODE_W / 2, y + NODE_H / 2]
    ];
    let bestId: string | null = null;
    let bestDist = EDGE_HIT_PAD;
    for (const edge of getEdges.value) {
      const s = getNodes.value.find((n) => n.id === edge.source);
      const t = getNodes.value.find((n) => n.id === edge.target);
      if (!s || !t) continue;
      const polyline = edgeRenderedPolyline(edge, s, t);
      for (const [px, py] of samples) {
        const d = pointToPolylineDistance(px, py, polyline);
        if (d < bestDist) {
          bestDist = d;
          bestId = edge.id;
        }
      }
    }
    return bestId;
  }

  /** 边命中阈值（px）：9 个采样点已覆盖整个拖拽矩形，阈值大就过度敏感 */
  const EDGE_HIT_PAD = 10;
  /** 贝塞尔命中检测分段数：24 段在最大扇出跨度上折线误差远小于 1px */
  const BEZIER_HIT_STEPS = 24;

  /** findEdgeAt 需要的节点结构（结构化类型，getNodes 的 GraphNode 天然满足） */
  interface EdgeHitNode {
    type?: string;
    computedPosition: { x: number; y: number };
    dimensions?: { width?: number; height?: number };
    data?: unknown;
  }

  /** 尺寸兜底（dimensions 未测出时），与 useAutoLayout 的 SIZE_MAP 同源 */
  function fallbackNodeSize(nodeType?: string): { w: number; h: number } {
    if (nodeType === 'gateway') return { w: GATEWAY_W, h: GATEWAY_TOTAL_H };
    if (nodeType === 'junction') return { w: JUNCTION_W, h: JUNCTION_H };
    return { w: NODE_W, h: NODE_H };
  }

  /**
   * 复算一条边实际渲染的贝塞尔端点（flow 坐标），与 CmpBezierEdge → getBezierPath 同源：
   * - target：四类节点（cmp/gateway/junction/placeholder）的 target handle 全是
   *   Position.Top 居中 → 顶边中点
   * - source：gateway 底边 outlet handle 按 left%=i/(n-1)*100 物理分布
   *   （GatewayNode.handleStyle 钉死），按 edge.sourceHandle 取对应 outlet；
   *   其余节点都是 Position.Bottom 居中 → 底边中点
   */
  function edgeRenderedEndpoints(
    edge: { sourceHandle?: string | null },
    s: EdgeHitNode,
    t: EdgeHitNode
  ): { sx: number; sy: number; tx: number; ty: number } {
    const sf = fallbackNodeSize(s.type);
    const sw = s.dimensions?.width ?? sf.w;
    const sh = s.dimensions?.height ?? sf.h;
    const tf = fallbackNodeSize(t.type);
    const tw = t.dimensions?.width ?? tf.w;

    let sx = s.computedPosition.x + sw / 2;
    const sy = s.computedPosition.y + sh;
    if (s.type === 'gateway' && edge.sourceHandle) {
      const outlets = (s.data as CmpNodeData | undefined)?.outlets ?? [];
      const idx = outlets.findIndex((o) => o.handle === edge.sourceHandle);
      if (idx >= 0) {
        const n = outlets.length;
        const leftPct = n <= 1 ? 0.5 : idx / (n - 1);
        sx = s.computedPosition.x + sw * leftPct;
      }
    }
    return { sx, sy, tx: t.computedPosition.x + tw / 2, ty: t.computedPosition.y };
  }

  /**
   * 把边实际绘制的三次贝塞尔拍扁成折线采样点。控制点与 @vue-flow/core 的
   * getBezierPath（Bottom→Top、距离正向）一致：calculateControlOffset 返回
   * 0.5*distance，故 cp1=(sx, 中)、cp2=(tx, 中)。TB 布局下边始终向下，无反向分支。
   */
  function edgeRenderedPolyline(
    edge: { sourceHandle?: string | null },
    s: EdgeHitNode,
    t: EdgeHitNode
  ): Array<[number, number]> {
    const { sx, sy, tx, ty } = edgeRenderedEndpoints(edge, s, t);
    const midY = (sy + ty) / 2;
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= BEZIER_HIT_STEPS; i++) {
      const u = i / BEZIER_HIT_STEPS;
      const inv = 1 - u;
      const px =
        inv ** 3 * sx + 3 * inv * inv * u * sx + 3 * inv * u * u * tx + u ** 3 * tx;
      const py =
        inv ** 3 * sy + 3 * inv * inv * u * midY + 3 * inv * u * u * midY + u ** 3 * ty;
      pts.push([px, py]);
    }
    return pts;
  }

  /** 点到折线（贝塞尔采样点串）的最短距离 */
  function pointToPolylineDistance(
    px: number,
    py: number,
    pts: ReadonlyArray<readonly [number, number]>
  ): number {
    let min = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = pointToSegmentDistance(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      if (d < min) min = d;
    }
    return min;
  }

  function pointToSegmentDistance(
    px: number, py: number,
    x1: number, y1: number,
    x2: number, y2: number
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
  }

  /**
   * 拖拽过程中的两类高亮目标（互斥，由 resolveDropTarget 统一裁决）：
   * - dragOverEdgeId：边命中，CmpBezierEdge 显示 + 圆圈
   * - dragOverPlaceholderId：占位符虚框本体命中，PlaceholderNode 虚线框高亮
   * dragover 每秒触发数十次，重复赋同值不触发响应式更新（Vue 按值比较），
   * 只有真正跨边界时相关组件才重渲染。
   */
  const dragOverEdgeId = ref<string | null>(null);
  const dragOverPlaceholderId = ref<string | null>(null);

  function setDragOverTarget(x: number, y: number) {
    const target = resolveDropTarget(x, y);
    dragOverEdgeId.value = target?.kind === 'edge' ? target.id : null;
    dragOverPlaceholderId.value = target?.kind === 'placeholder' ? target.id : null;
  }

  function clearDragOverTarget() {
    dragOverEdgeId.value = null;
    dragOverPlaceholderId.value = null;
  }

  /**
   * 填槽：找到 placeholder 所属算子，把新叶子放进对应 children 槽位。
   * - THEN 串行槽（handle='then'，含空 THEN 整槽与 THEN 内稀疏空槽）：按虚框携带的
   *   slotIndex 精确回填，无 slotIndex 时填第一个空洞，再无空洞则追加到末尾——
   *   只填空位，绝不覆盖已有节点
   * - IF/CATCH/AND/OR/NOT/SWITCH/WHEN/循环 的分支槽：handle 决定 children 索引
   *   （IF false→children[1]、CATCH catch→children[1]、AND/OR b2→children[1]，其余→children[0]）
   *
   * 关键：placeholderOf 可能指向"算子自身"（THEN 自身、WHEN/CATCH/AND/OR/NOT 的 gatewayId，
   * 或无独立 condition 的 IF/SWITCH/循环自身 id），也可能指向"condition 组件"（有独立
   * condition 时）。前者直接用 condNode 当算子，后者才需要向上找 parentOperatorId。
   */
  function replacePlaceholder(phCanvasId: string, defType: string): boolean {
    const phNode = getNodes.value.find((n) => n.id === phCanvasId);
    if (!phNode) return false;
    const phData = phNode.data as CmpNodeData;
    if (!phData.placeholderOf) return false;
    const condId = phData.placeholderOf; // condition.id（IF/SWITCH/循环）或 gatewayId（WHEN/CATCH/AND/OR/NOT）
    const handle = getPlaceholderHandle(phData);
    if (!handle) return false;

    const condNode = treeModel.findNode(condId);
    if (!condNode) return false;

    // 确定目标算子节点：condNode 自身就是算子时直接用它；否则 condNode 是 condition 组件，要找它的 parentOperatorId
    let opNode: ReturnType<typeof treeModel.findNode>;
    let opId: string;
    if (getDef(condNode.type)?.operator) {
      // condNode 自己就是算子（WHEN/CATCH/AND/OR/NOT，或无独立 condition 的 IF/SWITCH/循环）
      opNode = condNode;
      opId = condNode.id;
    } else {
      // condNode 是 condition 组件，向上找算子
      const parentOpId = condNode.parentOperatorId;
      if (!parentOpId) return false;
      opNode = treeModel.findNode(parentOpId);
      if (!opNode) return false;
      opId = parentOpId;
    }

    const leaf = treeModel.makeLeaf(defType);
    leaf.parentOperatorId = opId;
    if (!opNode.children) opNode.children = [];

    if (handle === 'then') {
      // THEN 串行槽（空 THEN 整槽 / THEN 内稀疏空槽）：
      // 虚框带 slotIndex 且该位确为空洞时精确回填；否则填第一个空洞，再无空洞则追加末尾。
      // 不能一律 children[0]=——THEN(节点+尾部空槽) 的虚框会覆盖掉已有节点。
      const slotIdx = getPlaceholderSlotIndex(phData);
      if (slotIdx !== undefined && !opNode.children[slotIdx]) {
        opNode.children[slotIdx] = leaf;
      } else {
        const holeIdx = opNode.children.findIndex((c) => !c);
        if (holeIdx >= 0) {
          opNode.children[holeIdx] = leaf;
        } else {
          opNode.children.push(leaf);
        }
      }
      return true;
    }

    // 根据 handle 推断分支槽 children 索引（顺序与网关 outlets 严格对应；handle='then' 已在上方处理）：
    // IF true→0 / false→1；CATCH try→0 / catch→1；AND/OR b1→0 / b2→1；NOT b1→0；
    // FOR/WHILE/ITERATOR do→0；WHEN branch_N→N；SWITCH case_N→N-1（case_1 对应 children[0]）
    let index = 0;
    if (handle === 'false' || handle === 'catch' || handle === 'b2') {
      index = 1;
    } else if (/^branch_(\d+)$/.test(handle)) {
      index = Number.parseInt(handle.slice('branch_'.length), 10);
    } else if (/^case_(\d+)$/.test(handle)) {
      index = Number.parseInt(handle.slice('case_'.length), 10) - 1; // case_1 → 0
    }
    // 直接设稀疏数组：JS 会把空洞位置自动置为 undefined，project 层检测到空位置会补 placeholder
    opNode.children[index] = leaf;
    return true;
  }

  // ── prepend/append/insertOnEdge/replace（picker 弹层选择后执行） ──

  /** 在锚点节点前面插入兄弟 */
  function prepend(nodeId: string, defType: string) {
    const def = getDef(defType);
    if (!def) return;
    const node = def.operator ? treeModel.makeOperator(defType) : treeModel.makeLeaf(defType);
    if (treeModel.insertBefore(nodeId, node)) {
      commit();
      select(node.id);
    } else {
      // 不在 children 中（可能是根/condition）：降级为追加到根
      treeModel.appendChildToRoot(node);
      commit();
      select(node.id);
    }
  }

  /** 在锚点节点后面插入兄弟 */
  function append(nodeId: string, defType: string) {
    const def = getDef(defType);
    if (!def) return;
    const node = def.operator ? treeModel.makeOperator(defType) : treeModel.makeLeaf(defType);
    if (treeModel.insertAfter(nodeId, node)) {
      commit();
      select(node.id);
    } else {
      treeModel.appendChildToRoot(node);
      commit();
      select(node.id);
    }
  }

  /**
   * 空分支线上插入的统一包装：children[idx] = THEN(newNode + 尾部空槽)。
   * 新节点成为分支第一个内容，尾部稀疏空洞继续投影成虚框（placeholder 不被吃掉）；
   * 空洞序列化时自动过滤。适用 jump（gateway→虚框）与空分支 merge（虚框→junction）两种边。
   */
  function wrapEmptyBranch(
    parentNode: NonNullable<ReturnType<ElTreeModel['findNode']>>,
    idx: number,
    newNode: NonNullable<ReturnType<ElTreeModel['findNode']>>,
    parentId: string
  ) {
    const wrapThen = treeModel.makeThenWithTailSlot(newNode);
    wrapThen.parentOperatorId = parentId;
    newNode.parentOperatorId = wrapThen.id;
    parentNode.children![idx] = wrapThen;
  }

  /**
   * 在一条边的中点插入新节点。
   *
   * 定位方式：直接读 edge.data.treeAnchor（投影时写入的语义锚点）定位 ElNode 树位置。
   * junction/placeholder 只是投影产物、不在模型树里，用画布节点 id 反推找不到对应节点。
   *
   * 四种边 kind 各有处理：
   *   seq   → THEN 串行边（含空 THEN 虚框邻接的两条）：splice 到 parent.children[seqToIndex]，
   *            新节点进外层链路，空槽虚框原样保留（点/拖的是边，就只做线上插入，不替用户填槽）
   *   branch → gateway→child（分支非空）：扇出边上的点在分支首节点之前，包装成 THEN(new, old)
   *   merge  → child→junction：汇合边上的点在分支末节点之后，包装成 THEN(old, new)；
   *            空分支（虚框→junction）走 jump 同款保槽包装
   *   jump   → gateway→虚框（空分支）：包装成 THEN(newNode + 尾部空槽)，
   *            新节点在线上、虚框下移保留——不替用户把空槽填掉
   */
  function insertOnEdge(edgeId: string, defType: string) {
    const edge = findEdge(edgeId);
    if (!edge) return;
    const def = getDef(defType);
    if (!def) return;
    const newNode = def.operator ? treeModel.makeOperator(defType) : treeModel.makeLeaf(defType);

    // 画布坐标计算（用于缓存新节点位置）
    const canvasNodes = getNodes.value;
    const canvasSource = canvasNodes.find((n) => n.id === edge.source);
    const canvasTarget = canvasNodes.find((n) => n.id === edge.target);

    // ── 读语义锚点 ──
    const data = (edge.data ?? {}) as Record<string, unknown>;
    const kind = (data.kind as string) ?? '';
    const anchor = data.treeAnchor as EdgeTreeAnchor | undefined;

    // 兜底：异常数据导致边没有 treeAnchor 时追加到根末尾，保证操作不丢失
    if (!anchor) {
      treeModel.appendChildToRoot(newNode);
      cacheMidpoint(newNode.id, canvasSource, canvasTarget);
      commit();
      select(newNode.id);
      return;
    }

    const parentNode = treeModel.findNode(anchor.parentId);
    if (!parentNode || !parentNode.children) {
      treeModel.appendChildToRoot(newNode);
      cacheMidpoint(newNode.id, canvasSource, canvasTarget);
      commit();
      select(newNode.id);
      return;
    }
    newNode.parentOperatorId = anchor.parentId;

    if (kind === 'seq') {
      // ── THEN seq 边 ──
      const spliceIdx = anchor.seqToIndex ?? parentNode.children.length;
      parentNode.children.splice(spliceIdx, 0, newNode);
    } else if (kind === 'jump') {
      // ── gateway → 空槽虚框：空分支线上插入 ──
      // 不直接填槽（那会吃掉虚框）：包装成 THEN(newNode + 尾部空槽)，
      // 新节点落在分支线上、虚框下移保留（用户可继续往框里填或在后续 seq 边上插）。
      wrapEmptyBranch(parentNode, anchor.branchIndex ?? 0, newNode, anchor.parentId);
    } else if (kind === 'branch' || kind === 'merge') {
      // ── 分支边：把分支内容包装成 THEN，新节点的先后由边的方向决定 ──
      const idx = anchor.branchIndex ?? 0;
      const oldChild = parentNode.children[idx];
      if (oldChild) {
        // 非空分支：branch 是网关→首节点的扇出边，新节点必须在老内容之前 THEN(new, old)；
        // merge 是末节点→junction 的汇合边，新节点在老内容之后 THEN(old, new)。
        // 两种边都 push(old, new) 会导致扇出线上插入的节点落到分支节点下面的汇合线。
        const wrapThen = treeModel.makeThen();
        if (kind === 'branch') {
          wrapThen.children!.push(newNode, oldChild);
        } else {
          wrapThen.children!.push(oldChild, newNode);
        }
        wrapThen.parentOperatorId = anchor.parentId;
        oldChild.parentOperatorId = wrapThen.id;
        newNode.parentOperatorId = wrapThen.id;
        parentNode.children[idx] = wrapThen;
        // 包装 THEN 位置对齐 oldChild，避免漂移
        treeModel.cachePosition(wrapThen.id,
          (oldChild.cachedPosition?.x ?? canvasTarget?.position.x ?? 0),
          (oldChild.cachedPosition?.y ?? canvasTarget?.position.y ?? 0)
        );
      } else {
        // 空分支的 merge 边（虚框 → junction）：与 jump 同款，包装 THEN(newNode + 尾部空槽) 保虚框
        wrapEmptyBranch(parentNode, idx, newNode, anchor.parentId);
      }
    }

    cacheMidpoint(newNode.id, canvasSource, canvasTarget);
    commit();
    select(newNode.id);
    // insertOnEdge 会改变整条链路的拓扑（seq splice / 分支包装），新节点坐标和子树位置
    // 都不准确。自动跑一次 dagre 重排，不做 fitView（保留当前视口缩放位置）
    runAutoLayout({ fitView: false });
  }

  /** 把新节点坐标缓存到 source 和 target 画布节点的中点 */
  function cacheMidpoint(
    nodeId: string,
    canvasSource: Node<CmpNodeData> | undefined,
    canvasTarget: Node<CmpNodeData> | undefined
  ) {
    if (!canvasSource || !canvasTarget) return;
    const midX = (canvasSource.position.x + canvasTarget.position.x) / 2 - NODE_W / 2;
    const midY = (canvasSource.position.y + canvasTarget.position.y) / 2 - NODE_H / 2;
    treeModel.cachePosition(nodeId, midX, midY);
  }

  /** 替换节点类型：保留 id/位置/连线，重置 type/cmpId/tag/data */
  function replaceNode(nodeId: string, defType: string) {
    if (treeModel.replaceNode(nodeId, defType)) {
      commit();
      select(nodeId);
    }
  }

  function openPicker(payload: {
    x: number;
    y: number;
    mode: PickerMode;
    nodeId?: string | null;
    edgeId?: string | null;
  }) {
    const maxX = window.innerWidth - 220;
    const maxY = window.innerHeight - 260;
    picker.visible = true;
    picker.x = Math.max(8, Math.min(payload.x, maxX));
    picker.y = Math.max(8, Math.min(payload.y, maxY));
    picker.mode = payload.mode;
    picker.nodeId = payload.nodeId ?? null;
    picker.edgeId = payload.edgeId ?? null;

    // ── 计算 anchorDefType：给推荐算法用 ──
    let anchorType: string | null = null;
    if (payload.nodeId) {
      const n = findNode(payload.nodeId);
      if (n) anchorType = (n.data as CmpNodeData).defType;
    } else if (payload.edgeId) {
      const e = findEdge(payload.edgeId);
      if (e) {
        // 线上插入：取 source 节点类型作为上下文参考
        const src = findNode(e.source);
        if (src) anchorType = (src.data as CmpNodeData).defType;
      }
    }
    picker.anchorDefType = anchorType;

    // ── 计算 excludedTypes：已存在的 singleton（start/end），replace 时把锚点自身也排除 ──
    const excluded = new Set<string>();
    // 画布上已有的 singleton 不能再选
    for (const n of getNodes.value) {
      const defType = (n.data as CmpNodeData).defType;
      const def = getDef(defType);
      if (def?.singleton) excluded.add(defType);
    }
    // replace 场景：把锚点自身排除（不能替换成自己）
    if (payload.mode === 'replace' && anchorType) {
      excluded.add(anchorType);
    }
    picker.excludedTypes = [...excluded];
  }

  function closePicker() {
    picker.visible = false;
    picker.nodeId = null;
    picker.edgeId = null;
    picker.anchorDefType = null;
    picker.excludedTypes = [];
  }

  function openMenu(payload: {
    x: number;
    y: number;
    scene: MenuScene;
    nodeId?: string | null;
    edgeId?: string | null;
  }) {
    const maxX = window.innerWidth - 180;
    const maxY = window.innerHeight - 220;
    menu.visible = true;
    menu.x = Math.max(8, Math.min(payload.x, maxX));
    menu.y = Math.max(8, Math.min(payload.y, maxY));
    menu.scene = payload.scene;
    menu.nodeId = payload.nodeId ?? null;
    menu.edgeId = payload.edgeId ?? null;
  }

  function closeMenu() {
    menu.visible = false;
    menu.nodeId = null;
    menu.edgeId = null;
  }

  function pickDef(defType: string) {
    const { mode, nodeId, edgeId } = picker;
    closePicker();
    if (mode === 'prepend' && nodeId) {
      prepend(nodeId, defType);
    } else if (mode === 'append' && nodeId) {
      append(nodeId, defType);
    } else if (mode === 'replace' && nodeId) {
      replaceNode(nodeId, defType);
    } else if (mode === 'insertEdge' && edgeId) {
      insertOnEdge(edgeId, defType);
    }
  }

  async function requestDeleteNode(id?: string) {
    const targetId = id ?? selectedId.value;
    if (!targetId) return;

    const canvasNode = findNode(targetId);
    if (!canvasNode) return;
    const data = canvasNode.data as CmpNodeData;

    // junction/placeholder 不在树中，不可手动删除
    if (data.junctionOf || data.placeholderOf) return;

    if (treeModel.removeNode(targetId)) {
      commit();
      if (selectedId.value === targetId) select(null);
    }
  }

  // ── 剪贴板（仅业务叶子，paste 时追加到树末尾） ──

  function copy(nodeId?: string) {
    const selected = getNodes.value.filter(
      (n) => {
        const d = n.data as CmpNodeData;
        return !d.virtual && !d.operator && !d.junctionOf && !d.placeholderOf &&
          (nodeId !== undefined ? n.id === nodeId : n.selected);
      }
    );
    if (selected.length === 0) return;
    clipboard.value = selected.map((n) => {
      const d = n.data as CmpNodeData;
      // 只复制物料类型与配置：粘贴时 makeLeaf 重新分配唯一数据空间名，避免重名
      return { defType: d.defType, data: d.data };
    });
    canPaste.value = true;
  }

  function paste() {
    const items = clipboard.value;
    if (!items || items.length === 0) return;
    const newIds: string[] = [];
    for (const item of items) {
      const leaf = treeModel.makeLeaf(item.defType);
      treeModel.updateLeafData(leaf.id, { data: item.data });
      treeModel.appendChildToRoot(leaf);
      newIds.push(leaf.id);
    }
    commit();
    // 选中新粘贴的节点
    setNodes((nds) => nds.map((n) => ({ ...n, selected: newIds.includes(n.id) })));
    select(newIds[0] ?? null);
  }

  function selectAll() {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
  }

  function deselect() {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
    select(null);
  }

  const controller: CanvasController = {
    selectedId,
    canPaste,
    picker,
    menu,
    select,
    insertNodeAt,
    openPicker,
    closePicker,
    pickDef,
    attachCondition,
    openMenu,
    closeMenu,
    requestDeleteNode,
    copy,
    paste,
    selectAll,
    deselect,
    commit,
    updateEdgeLabel,
    autoLayout,
    dragOverEdgeId,
    dragOverPlaceholderId,
    setDragOverTarget,
    clearDragOverTarget
  };

  return controller;
}

/** index.vue 创建并 provide；节点/边/浮层组件 inject 同一实例 */
export function provideCanvasController(options: CreateControllerOptions): CanvasController {
  const controller = createCanvasController(options);
  provide(CANVAS_CTRL_KEY, controller);
  return controller;
}

export function useCanvasController(): CanvasController {
  const controller = inject(CANVAS_CTRL_KEY);
  if (!controller) {
    throw new Error('useCanvasController 必须在 provideCanvasController 之后使用');
  }
  return controller;
}
