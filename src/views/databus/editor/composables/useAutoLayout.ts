/**
 * 自动排列 composable:dagre 分层 + 补丁档后处理修正分支顺序,消除贝塞尔 X 交叉。
 *
 * 两层分工:
 *   ① dagre 负责分层(y 坐标)和整体排布——把节点按链路顺序分配到不同 rank,
 *      同 rank 内节点用 barycenter 启发式估算一个"合理"的左右顺序。
 *   ② 补丁档后处理:dagre 跑完后,对每个 gateway 直接扇出的分支层按 outlet
 *      数组索引从左到右重新分配 x 坐标。分支节点的子孙整体跟随平移。
 *
 * 为什么需要补丁档?
 *   GatewayNode.vue 的 outlet handle 位置物理钉死:left% = i/(n-1)*100,
 *   即 outlets[0] 最左、outlets[1] 居中、outlets[2] 最右。dagre barycenter
 *   启发式对"网关扇出 + 对称汇合"的菱形结构,三个分支重心值完全相同,
 *   tie-break 取决于喂入顺序,可能排出 case3/case2/case1 反序——
 *   此时 case3 节点在最左列,但 handle 在最右端(left%=100%),贝塞尔
 *   曲线从右端甩到最左列再甩回 junction 最右端,自然 X 交叉。
 *   补丁档强制 dagre 的同层节点按 outlet 顺序排列,handle 物理位置
 *   和节点列顺序一致,贝塞尔零交叉。
 *
 * 为什么不直接改 dagre?
 *   dagre 无公开 API 固定层内顺序(已核实 @dagrejs/dagre 3.1.1)。
 *   elkjs 支持 portConstraints:FIXED_ORDER 但 900KB 异步 API,相比
 *   补丁档几十行后处理,收益不匹配。
 *
 * 尺寸兜底(节点类型 → w×h):
 *   cmp / gateway / junction / placeholder 都有固定尺寸,dagre 用它算 layout。
 *   virtual cmp(start/end) 是圆形 56×56,不走业务卡 150×56。
 */
import { nextTick } from 'vue';
import dagre from '@dagrejs/dagre';
import { useVueFlow } from '@vue-flow/core';
import {
  GATEWAY_H,
  GATEWAY_TOTAL_H,
  GATEWAY_W,
  JUNCTION_H,
  JUNCTION_W,
  NODE_GAP_X,
  NODE_H,
  NODE_W
} from './useElTreeModel';
import type { ElTreeModel, CmpNodeData } from './useElTreeModel';

/** dagre 未测出 DOM 尺寸时的兜底。dagre 用这些值算节点间距和连线端点,
 *  不直接写入 VueFlow style(那是 buildGatewayNode/buildJunctionNode 的事)。
 *  gateway 用含 label 的总高(GATEWAY_TOTAL_H),virtual cmp 起止节点走 GATEWAY_H(shape 本身)。 */
const SIZE_MAP: Record<string, { w: number; h: number }> = {
  cmp: { w: NODE_W, h: NODE_H },
  gateway: { w: GATEWAY_W, h: GATEWAY_TOTAL_H },
  junction: { w: JUNCTION_W, h: JUNCTION_H },
  placeholder: { w: NODE_W, h: NODE_H }
};

/** 排列过渡动画时长(ms),与 LAYOUTING_CLASS 配合控制 CSS transition */
const LAYOUT_DURATION = 300;
/** 排列期间加在 FlowCanvas 根元素的 class,禁用节点拖拽过渡抖动 */
const LAYOUTING_CLASS = 'is-flow-layouting';

export interface AutoLayoutOptions {
  /** true:排列完成后 fitView 自适应视口(载入示例/批量变更);
   *   false:只排不缩放(单节点插入/撤销,保留当前视口) */
  fitView?: boolean;
}

export function useAutoLayout(treeModel: ElTreeModel) {
  const { getNodes, getEdges, setNodes, fitView, vueFlowRef } = useVueFlow();

  function autoLayout(options: AutoLayoutOptions = {}): void {
    const { fitView: shouldFit = true } = options;
    const flowNodes = getNodes.value;
    if (flowNodes.length === 0) return;

    // ── 阶段 1:dagre 分层 ─────────────────────────────────────────
    // 只负责 rank 分配(y 坐标)和整体排布,x 坐标后处理修正

    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 80, marginx: 20, marginy: 20 });
    g.setDefaultEdgeLabel(() => ({}));

    // 给 dagre 喂节点尺寸(中心坐标),输出后再转左上角坐标
    flowNodes.forEach((n) => {
      const isVirtualCmp = n.type === 'cmp' && (n.data as CmpNodeData | undefined)?.virtual;
      const fallback = isVirtualCmp
        ? { w: GATEWAY_W, h: GATEWAY_H }
        : (SIZE_MAP[n.type ?? 'cmp'] ?? SIZE_MAP.cmp);
      g.setNode(n.id, {
        width: n.dimensions?.width || fallback.w,
        height: n.dimensions?.height || fallback.h
      });
    });

    // 喂边：所有边等权——kind(seq/branch/merge/jump) 只影响层内顺序后处理，不参与 dagre 分层
    getEdges.value.forEach((e) => {
      g.setEdge(e.source, e.target, {});
    });

    dagre.layout(g);

    // ── 阶段 2:补丁档后处理修正分支顺序 ──────────────────────────────
    // dagre 输出的是中心点,转成左上角坐标存进 laid 字典,
    // 后处理原地改 x(保持 dagre 算的 y 不变),最后 setNodes 写回

    type LaidNode = { x: number; y: number; w: number; h: number };
    const laid: Record<string, LaidNode> = {};
    for (const n of flowNodes) {
      const d = g.node(n.id)!;
      laid[n.id] = { x: d.x - d.width / 2, y: d.y - d.height / 2, w: d.width, h: d.height };
    }

    // 预构建 descendants 邻接表:sourceId → 所有通过非 merge 边可达的 targetIds
    // 用于 BFS 把 branch 根节点的 deltaX 传播到整棵子树(保持 dagre 排好的相对结构)
    // 排除 merge 边是因为它指向 junction,子树到此为止
    const edgeList = getEdges.value;
    const descendants = new Map<string, string[]>();
    for (const e of edgeList) {
      const kind = (e.data as { kind?: string })?.kind;
      if (kind !== 'merge') {
        if (!descendants.has(e.source)) descendants.set(e.source, []);
        descendants.get(e.source)!.push(e.target);
      }
    }

    // 对每个 gateway,把 dagre 排好的分支顺序按 outlet 数组索引重新分配
    // outlet 数组顺序 = 物理 handle 顺序(GatewayNode.vue handleStyle left% 钉死):
    //   IF: outlets[0]=true(左) outlets[1]=false(右)
    //   SWITCH: outlets[0]=case_1(最左) outlets[1]=case_2 outlets[2]=case_3(最右)
    //   CATCH: outlets[0]=try outlets[1]=catch
    //   AND/OR/NOT: outlets[0]=b1 outlets[1]=b2
    //   WHEN: outlets[0]=branch_0 outlets[1]=branch_1 ...
    const gatewayNodes = flowNodes.filter((n) => n.type === 'gateway');
    for (const gw of gatewayNodes) {
      const gwId = gw.id;
      const gwData = gw.data as CmpNodeData | undefined;
      const outlets = gwData?.outlets ?? [];
      if (outlets.length < 2) continue; // 单分支无需修正(循环体只有一个 outlet)

      // 步骤 a:对每个 outlet handle,找到 gateway 发出的非 merge 边 → 目标节点
      // 分支边有两种:kind='branch'(业务分支)和 kind='jump'(placeholder 分支)
      // 两种都要纳入修正,否则 placeholder 分支仍按 dagre 原始顺序排列 → 交叉
      type BranchInfo = { outletIdx: number; nodeId: string; centerX: number };
      const branches: BranchInfo[] = [];
      for (let i = 0; i < outlets.length; i++) {
        const handle = outlets[i].handle;
        const branchEdge = edgeList.find((e) => {
          const kind = (e.data as { kind?: string })?.kind;
          return (
            e.source === gwId &&
            e.sourceHandle === handle &&
            kind !== 'merge' &&
            kind !== undefined // 排除无 kind 的边(理论上不会有,防御性)
          );
        });
        if (branchEdge) {
          const target = laid[branchEdge.target];
          if (target) {
            branches.push({ outletIdx: i, nodeId: branchEdge.target, centerX: target.x + target.w / 2 });
          }
        }
      }
      if (branches.length < 2) continue;

      // 步骤 b:按 outletIdx 排序(outlets 数组顺序即预期从左到右顺序)
      branches.sort((a, b) => a.outletIdx - b.outletIdx);

      // 步骤 c:算分支群总宽,整体在 gateway 中心两侧居中
      const gwCenterX = laid[gwId].x + laid[gwId].w / 2;
      let branchGroupWidth = 0;
      for (let i = 0; i < branches.length; i++) {
        branchGroupWidth += laid[branches[i].nodeId].w;
        if (i < branches.length - 1) branchGroupWidth += NODE_GAP_X;
      }
      // cursorX:分支群起始 x(左边缘),从 gateway 中心向左偏移半群宽
      let cursorX = gwCenterX - branchGroupWidth / 2;

      // 步骤 d:按 outlet 顺序依次分配每个 branch 根节点的目标中心 x,
      //  算出与 dagre 原始 centerX 的差值 deltaX
      const deltaXPerBranch = new Map<string, number>();
      for (const b of branches) {
        const nodeW = laid[b.nodeId].w;
        const targetCenterX = cursorX + nodeW / 2;
        const deltaX = targetCenterX - b.centerX;
        deltaXPerBranch.set(b.nodeId, deltaX);
        cursorX += nodeW + NODE_GAP_X;
      }

      // 步骤 e:BFS 把 deltaX 应用到 branch 根及其所有 reachable 子孙
      //  为什么 BFS?因为 dagre 已经把子孙节点排好了相对位置,整体平移就能
      //  保持分支内部结构不变,只改它在整图中的水平位置
      //  不同 branch 各走各的 BFS,互不干扰
      for (const [rootId, delta] of deltaXPerBranch) {
        const visited = new Set<string>();
        const stack = [rootId];
        while (stack.length > 0) {
          const id = stack.pop()!;
          if (visited.has(id)) continue;
          visited.add(id);
          laid[id].x += delta;
          const kids = descendants.get(id) ?? [];
          for (const k of kids) {
            if (!visited.has(k)) stack.push(k);
          }
        }
      }
    }

    // ── 阶段 3:写回 ─────────────────────────────────────────────────
    // 关键:用 setNodes 替换数组让 VueFlow 完全感知位置变更。
    // 直接修改 flowNodes[i].position 在 Pinia reactive 下可能只部分生效——
    // 某些内部派生状态(edges 端点、viewport bounds、DOM transform)不同步,
    // 导致后续 drop 检测(findPlaceholderAt)用的 position 和用户视觉看到的位置不一致。

    const laidNodes = flowNodes.map((n) => {
      const l = laid[n.id];
      if (l) {
        treeModel.cachePosition(n.id, l.x, l.y);
        return { ...n, position: { x: l.x, y: l.y } };
      }
      return n;
    });
    setNodes(laidNodes);

    const host = vueFlowRef.value;
    host?.classList.add(LAYOUTING_CLASS);
    if (shouldFit) {
      // 双层 rAF 确保:① setNodes 后 Vue 渲染出 DOM 节点 ② VueFlow ResizeObserver 完成首次尺寸测量
      // 直接 fitView 会用零尺寸算 bounds,等于没缩放。
      nextTick(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            fitView({ padding: 0.2, duration: LAYOUT_DURATION });
            setTimeout(
              () => host?.classList.remove(LAYOUTING_CLASS),
              LAYOUT_DURATION + 50
            );
          });
        });
      });
    } else {
      setTimeout(() => host?.classList.remove(LAYOUTING_CLASS), LAYOUT_DURATION + 50);
    }
  }

  return { autoLayout };
}
