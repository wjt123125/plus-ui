/**
 * 画布操作控制器（方案 B 网关范式）。
 *
 * 所有编辑动作改为"改 ElNode 树 → 重投影 → setNodes/setEdges"，
 * 不再直接操作画布 nodes/edges。画布只是模型树的投影。
 *
 * 删除了容器范式下的 detectSlotAt/parentNode/extent/expandParent/slot/container 整套逻辑。
 * copy/paste/selectAll/deselect 保留在画布交互层（这些是 Vue Flow 原生能力）。
 */
import { inject, provide, reactive, ref, type InjectionKey, type Ref } from 'vue';
import { useVueFlow, type Node, type Rect } from '@vue-flow/core';
import { ElMessage } from 'element-plus';
import { getDef } from '../cmp-defs';
import type { CmpNodeData } from '../cmp-tree';
import { getPlaceholderHandle, NODE_GAP_Y, NODE_H, NODE_W, type ElTreeModel, type NodeParentPos, type EdgeTreeAnchor } from './useElTreeModel';

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
  /** 锚点组件类型（def.type）——弹窗无需引 Vue Flow 即可计算推荐 */
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
  tag: string;
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
  openMenu: (payload: {
    x: number;
    y: number;
    scene: MenuScene;
    nodeId?: string | null;
    edgeId?: string | null;
  }) => void;
  closeMenu: () => void;
  requestDeleteNode: (id?: string) => Promise<void>;
  requestDeleteEdge: (id?: string) => void;
  copy: (nodeId?: string) => void;
  paste: () => void;
  selectAll: () => void;
  deselect: () => void;
  /** 属性面板编辑后调：重投影 + 入栈 + EL 预览刷新 */
  commit: () => void;
  /** 一键 dagre 排列全图，坐标同步写回树缓存（跨重投影保留） */
  autoLayout: () => void;
  /** 拖拽过程中当前命中的 edge id（用于 CmpBezierEdge 显示 + 圆圈）；为 null 表示未命中任何边 */
  dragOverEdgeId: Ref<string | null>;
  /** 拖拽 dragover 时调：把 flow 坐标落点交给 findEdgeAt 检测，命中变化时才更新 ref（避免高频重渲染） */
  setDragOverEdge: (x: number, y: number) => void;
  /** 拖拽 drop/leave 时调：清掉 + 圆圈 */
  clearDragOverEdge: () => void;
}

export const CANVAS_CTRL_KEY = Symbol('canvas-controller') as InjectionKey<CanvasController>;

export function createCanvasController(options: CreateControllerOptions): CanvasController {
  const { treeModel, pushHistory, autoLayout: runAutoLayout } = options;
  const { getNodes, getEdges, findNode, findEdge, removeEdges, setNodes, setEdges, addSelectedNodes, getIntersectingNodes } =
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

  /** 一键 dagre 排列全图（含 fitView + 写回坐标缓存） */
  function autoLayout() {
    runAutoLayout({ fitView: true });
  }

  // ── 拖拽落画布 ──
  /**
   * 拖业务/算子到画布，按落点命中分三条路径：
   * - 落点在 placeholder 上：replacePlaceholder + commit + runAutoLayout（重排）
   * - 落点在 edge 上（A 范式）：insertOnEdge（内部已 commit + runAutoLayout）
   * - 落点在空白：appendChildToRoot + commit（不重排，保留用户对节点位置的控制）
   */
  function insertNodeAt(type: string, x: number, y: number) {
    const def = getDef(type);
    if (!def) return;
    if (def.singleton && getNodes.value.some((n) => (n.data as CmpNodeData).defType === def.type)) {
      ElMessage.warning(`「${def.label}」在画布上只能存在一个`);
      return;
    }

    // 先检测落点是否命中已有 placeholder（IF 假分支/CATCH 异常槽/逻辑算子空槽 等）
    const phId = findPlaceholderAt(x, y);
    if (phId) {
      if (replacePlaceholder(phId, type)) {
        commit();
        // 替换 placeholder 改变了画布拓扑（语义空位被真实业务节点取代，下游链路与 merge 边路径随之变化），
        // 跑一次不 fitView 的 dagre 重排，与 insertOnEdge 行为对齐；保留当前视口缩放/位置
        runAutoLayout({ fitView: false });
        return;
      }
    }

    // 再检测落点是否命中已有 edge（A 范式：拖到线上自动插入，语义同 picker 的 insertOnEdge）。
    // 必须放在 placeholder 之后、fallback 之前：placeholder 是空槽位、edge 是连线，两者视觉不重叠，顺序不冲突。
    // insertOnEdge 内部已 commit() + runAutoLayout({ fitView: false })，这里不要重复调。
    const hitEdgeId = findEdgeAt(x, y);
    if (hitEdgeId) {
      insertOnEdge(hitEdgeId, type);
      return;
    }

    // 追加到根前：算一个合理的默认坐标，避免新节点和已有节点（特别是 dagre 排好的分支结构）重叠。
    // 取所有节点的最大 bottom + NODE_GAP_Y，X 用主链末端节点的 X（或 START_X 兜底），让新节点排在主链正下方
    let newX = x;
    let newY = y;
    const canvasNodes = getNodes.value;
    if (canvasNodes.length > 0) {
      const NODE_H = 56; // 与 useElTreeModel.NODE_H 一致
      const GATEWAY_H = 56;
      const JUNCTION_H = 16;
      const bottom = (n: typeof canvasNodes[number]) => {
        const d = n.data as CmpNodeData;
        const h = d.defType === 'junction' ? JUNCTION_H : (d.operator ? GATEWAY_H : NODE_H);
        return n.position.y + h;
      };
      const maxBottom = canvasNodes.reduce((m, n) => Math.max(m, bottom(n)), 0);
      newY = maxBottom + NODE_GAP_Y;
      // X：找主链末端节点（非 virtual 非 junction 非 placeholder）的 position.x，兜底用 START_X
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

  /**
   * 落点命中检测：返回画布上与落点 rect 相交的 placeholder 节点 id（无则 null）。
   * 用官方 getIntersectingNodes(rect, partially=true) 检测，相比手写矩形相交：
   *  - 命中坐标用 VueFlow 的 computedPosition（已应用 extent:'parent' 钳制、父容器位移等派生计算），
   *    dagre 重排后立刻同步，避免 store 与 DOM 不一致导致命中失败
   *  - 节点尺寸读取 VueFlow 内部异步测量后的 dimensions，placeholder 尺寸变化也能跟上
   * x/y 是新节点左上角（已由 onDrop 减过 NODE_W/2、NODE_H/2 转换而来），
   * 配上预估宽高组成 Rect 交给官方 API。
   */
  function findPlaceholderAt(x: number, y: number): string | null {
    const rect: Rect = { x, y, width: NODE_W, height: NODE_H };
    const hits = getIntersectingNodes(rect, true)
      .filter((n) => (n.data as CmpNodeData | undefined)?.placeholderOf);
    return hits[0]?.id ?? null;
  }

  /**
   * 落点命中检测：返回与新节点矩形最近距离 <10px 的 edge id（无则 null）。
   * 命中体用新节点矩形 9 点采样（4 角 + 4 边中点 + 中心）——视觉语义即"拖拽中的节点本体靠近边"，
   * 而非鼠标点靠近，体感更直观。VueFlow 无"点是否在 edge 上"的官方 API，需自写点到线段距离。
   * 边端点节点（source/target）中心用 computedPosition + dimensions 计算（已应用 extent 钳制等派生计算）。
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
    let bestDist = 10; // 阈值 10px：采样点已覆盖整个节点矩形，阈值大就过度敏感
    for (const edge of getEdges.value) {
      const s = getNodes.value.find((n) => n.id === edge.source);
      const t = getNodes.value.find((n) => n.id === edge.target);
      if (!s || !t) continue;
      const w1 = s.dimensions?.width ?? NODE_W;
      const h1 = s.dimensions?.height ?? NODE_H;
      const w2 = t.dimensions?.width ?? NODE_W;
      const h2 = t.dimensions?.height ?? NODE_H;
      const p1x = s.computedPosition.x + w1 / 2;
      const p1y = s.computedPosition.y + h1 / 2;
      const p2x = t.computedPosition.x + w2 / 2;
      const p2y = t.computedPosition.y + h2 / 2;
      for (const [px, py] of samples) {
        const d = pointToSegmentDistance(px, py, p1x, p1y, p2x, p2y);
        if (d < bestDist) {
          bestDist = d;
          bestId = edge.id;
        }
      }
    }
    return bestId;
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
   * 拖拽过程中命中的 edge id（仅 CmpBezierEdge 用于显示 + 圆圈）。
   * dragover 每秒触发数十次，仅在跨边界变化时写 ref——只有命中/失命中的两条 edge 重新计算 dragOverMe，
   * 其他 edge 不重渲染。
   */
  const dragOverEdgeId = ref<string | null>(null);

  function setDragOverEdge(x: number, y: number) {
    const newId = findEdgeAt(x, y);
    if (newId !== dragOverEdgeId.value) {
      dragOverEdgeId.value = newId;
    }
  }

  function clearDragOverEdge() {
    if (dragOverEdgeId.value !== null) {
      dragOverEdgeId.value = null;
    }
  }

  /**
   * 替换 placeholder：找到 placeholder 所属算子，按 handle 把新节点放到对应 children 槽位。
   * - THEN placeholder（id=THEN.id，无 placeholderOf）：拖入即 appendChildToRoot，走默认路径
   * - IF/CATCH/AND/OR/NOT placeholder：handle 决定 children 索引
   *   IF false→children[1]、CATCH catch→children[1]、AND/OR b2→children[1]，其余→children[0]
   *
   * 关键：placeholderOf 可能指向"算子自身"（WHEN/CATCH/AND/OR/NOT 的 gatewayId，或无独立 condition 的 IF/SWITCH/循环自身 id），
   * 也可能指向"condition 组件"（有独立 condition 时）。前者直接用 condNode 当算子，
   * 后者才需要向上找 parentOperatorId。之前两种情况一律多跳 parentOperatorId，
   * 导致把算子节点本身从父级 children 里替换掉（整棵算子子树+连线全灭）。
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
    // 根据 handle 推断 children 索引（算子 children 顺序与 outlets 顺序严格对应）：
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
   * 在一条边的中点插入新节点。
   *
   * 核心思路：读 edge.data.treeAnchor（投影时写入的语义锚点），直接定位 ElNode 树位置，
   * 不再用画布节点 id 反推（junction/placeholder 不在树里会导致反推失败）。
   *
   * 四种边 kind 各有处理：
   *   seq   → THEN seq 边：splice 到 parent.children[seqToIndex] 前
   *   branch → gateway→child：把 children[branchIndex] 包装成 THEN(old, new)
   *   merge  → child→junction：同 branch，也包装 children[branchIndex]
   *   jump   → gateway→placeholder：空槽，直接把新节点塞进 children[branchIndex]
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

    // 降级：没有 treeAnchor 时 fallback 到根末尾（比之前的 findNodeParent 反推安全得多）
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
      // ── gateway → placeholder：空槽填充 ──
      const idx = anchor.branchIndex ?? 0;
      parentNode.children[idx] = newNode;
    } else {
      // ── branch / merge：分支边，包装成 THEN(old, new) ──
      const idx = anchor.branchIndex ?? 0;
      const oldChild = parentNode.children[idx];
      if (oldChild) {
        const wrapThen = treeModel.makeThen();
        wrapThen.children!.push(oldChild, newNode);
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
        // 兜底：该分支位置本就空，直接塞
        parentNode.children[idx] = newNode;
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

  /** 删除连线（方案 B：画布边是投影产物，删边只影响视图，下次重投影恢复） */
  function requestDeleteEdge(id?: string) {
    const edgeId = id ?? menu.edgeId;
    if (!edgeId) return;
    removeEdges([edgeId]);
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
      return { defType: d.defType, tag: d.tag, data: d.data };
    });
    canPaste.value = true;
  }

  function paste() {
    const items = clipboard.value;
    if (!items || items.length === 0) return;
    const newIds: string[] = [];
    for (const item of items) {
      const leaf = treeModel.makeLeaf(item.defType);
      treeModel.updateLeafData(leaf.id, { tag: item.tag, data: item.data });
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
    openMenu,
    closeMenu,
    requestDeleteNode,
    requestDeleteEdge,
    copy,
    paste,
    selectAll,
    deselect,
    commit,
    autoLayout,
    dragOverEdgeId,
    setDragOverEdge,
    clearDragOverEdge
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
