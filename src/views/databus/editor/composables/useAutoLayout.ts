/**
 * 自动排列 composable:dagre 分层 + 补丁档后处理修正分支顺序,消除贝塞尔 Y 交叉。
 *
 * 两层分工:
 *   ① dagre 负责分层(x 坐标)和整体排布——把节点按链路顺序分配到不同 rank,
 *      同 rank 内节点用 barycenter 启发式估算一个"合理"的上下顺序。
 *   ② 补丁档后处理:dagre 跑完后,对每个 gateway 直接扇出的分支层按 outlet
 *      数组索引从上到下重新分配 y 坐标。分支节点的子孙整体跟随平移。
 *
 * 为什么需要补丁档?
 *   GatewayNode.vue 的 outlet handle 位置物理钉死:top% = i/(n-1)*100,
 *   即 outlets[0] 最上、outlets[1] 居中、outlets[2] 最下。dagre barycenter
 *   启发式对"网关扇出 + 对称汇合"的菱形结构,三个分支重心值完全相同,
 *   tie-break 取决于喂入顺序,可能排出 case3/case2/case1 反序——
 *   此时 case3 节点在最上排,但 handle 在最下端(top%=100%),贝塞尔
 *   曲线从下端甩到最上排再甩回 junction 最下端,自然 Y 交叉。
 *   补丁档强制 dagre 的同层节点按 outlet 顺序排列,handle 物理位置
 *   和节点排顺序一致,贝塞尔零交叉。
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
  NODE_GAP_Y,
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
    // 只负责 rank 分配(x 坐标)和整体排布,y 坐标后处理修正

    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 80, marginx: 20, marginy: 20 });
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
    // 后处理原地改 y(保持 dagre 算的 x 不变),最后 setNodes 写回

    type LaidNode = { x: number; y: number; w: number; h: number };
    const laid: Record<string, LaidNode> = {};
    for (const n of flowNodes) {
      const d = g.node(n.id)!;
      laid[n.id] = { x: d.x - d.width / 2, y: d.y - d.height / 2, w: d.width, h: d.height };
    }

    // 预构建 descendants 邻接表:sourceId → 所有边可达的 targetIds（含 merge 边）。
    // BFS 平移分支子树时要穿过「嵌套网关的汇合点」到达其后置续节点
    // （merge 边是进入嵌套 junction 的唯一路径，若一刀切排除，槽内为
    // 「嵌套菱形 + 续尾」结构时，嵌套 junction 和续尾节点漏平移，留在 dagre
    // 原位与其他分支节点重叠——2026-10-06 链 29 的 CATCH catch 槽即此症）；
    // 但不能穿过「本网关自己的汇合点」(${gwId}_end)，否则会串到兄弟分支，
    // 该截断在 BFS 内按 junctionId 逐网关判定。
    const edgeList = getEdges.value;
    const descendants = new Map<string, string[]>();
    for (const e of edgeList) {
      if (!descendants.has(e.source)) descendants.set(e.source, []);
      descendants.get(e.source)!.push(e.target);
    }

    // 对每个 gateway,把 dagre 排好的分支顺序按 outlet 数组索引重新分配
    // outlet 数组顺序 = 物理 handle 顺序(GatewayNode.vue handleStyle top% 钉死,
    // LR 布局下 handle 沿网关右边垂直分布):
    //   IF: outlets[0]=true(上) outlets[1]=false(下)
    //   SWITCH: outlets[0]=case_1(最上) outlets[1]=case_2 outlets[2]=case_3(最下)
    //   CATCH: outlets[0]=try outlets[1]=catch
    //   AND/OR/NOT: outlets[0]=b1 outlets[1]=b2
    //   WHEN: outlets[0]=branch_0 outlets[1]=branch_1 ...
    const gatewayNodes = flowNodes.filter((n) => n.type === 'gateway');

    // 分支子树收集：从 branch 根 BFS，穿过嵌套网关的汇合点及其 seq 续尾，
    // 只截断「本网关自己」的汇合点。包围盒测量与整块平移共用同一遍历，
    // 保证「按多高分配条带」与「平移哪些节点」的范围严格一致。
    function collectBranchSubtree(rootId: string, ownJunctionId: string): Set<string> {
      const visited = new Set<string>();
      const stack = [rootId];
      while (stack.length > 0) {
        const id = stack.pop()!;
        if (visited.has(id)) continue;
        visited.add(id);
        for (const k of descendants.get(id) ?? []) {
          if (!visited.has(k) && k !== ownJunctionId) stack.push(k);
        }
      }
      return visited;
    }

    // 步骤 a:为每个网关产出修正计划——分支清单（branch/jump 两种边都要，
    // 否则 placeholder 分支仍按 dagre 原始顺序排列 → 交叉）＋全分支子树闭包
    interface GwPlan {
      gwId: string;
      junctionId: string;
      branches: { outletIdx: number; nodeId: string }[];
      /** 所有分支子树闭包的并集，仅用于判定网关间嵌套深度 */
      subtreeIds: Set<string>;
    }
    const plans: GwPlan[] = [];
    for (const gw of gatewayNodes) {
      const gwId = gw.id;
      const gwData = gw.data as CmpNodeData | undefined;
      const outlets = gwData?.outlets ?? [];
      if (outlets.length < 2) continue; // 单分支无需修正(循环体只有一个 outlet)
      const branches: GwPlan['branches'] = [];
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
        if (branchEdge && laid[branchEdge.target]) {
          branches.push({ outletIdx: i, nodeId: branchEdge.target });
        }
      }
      if (branches.length < 2) continue;

      // 按 outletIdx 排序(outlets 数组顺序即预期从上到下顺序)
      branches.sort((a, b) => a.outletIdx - b.outletIdx);
      const junctionId = `${gwId}_end`;
      const subtreeIds = new Set<string>();
      for (const b of branches) {
        for (const id of collectBranchSubtree(b.nodeId, junctionId)) subtreeIds.add(id);
      }
      plans.push({ gwId, junctionId, branches, subtreeIds });
    }

    // 步骤 b:处理顺序——嵌套最深（depth 最大＝最外层）的网关最后排：
    // 深度 0 是最内层，升序处理。外层网关要按「内层补丁后」的真实子树
    // 包围盒分配条带高（catch 槽根节点只有 56px、子树内嵌 SWITCH 四路
    // 扇出真实高约 350，先排外层会按原始位置测高，与内层重排后有偏差）
    const depthCache = new Map<string, number>();
    function planDepth(p: GwPlan): number {
      const cached = depthCache.get(p.gwId);
      if (cached !== undefined) return cached;
      let d = 0;
      for (const q of plans) {
        if (q.gwId !== p.gwId && p.subtreeIds.has(q.gwId)) d = Math.max(d, planDepth(q) + 1);
      }
      depthCache.set(p.gwId, d);
      return d;
    }
    plans.sort((a, b) => planDepth(a) - planDepth(b));

    for (const plan of plans) {
      const { gwId, junctionId, branches } = plan;
      const gwCenterY = laid[gwId].y + laid[gwId].h / 2;

      // 步骤 c:每个分支条带高＝其子树真实包围盒高（BFS min y → max y+h）。
      //  不能只取分支根节点高：CATCH 的 try 槽只有一个抛异常节点，catch 槽
      //  根（inspect）背后却挂着 SWITCH 四路扇出；按根高排条带必然互相压叠，
      //  短分支的长 merge 边没有自己的水平走廊，只能从兄弟列节点上扫过去。
      let groupHeight = 0;
      const spans = branches.map((b) => {
        const ids = collectBranchSubtree(b.nodeId, junctionId);
        let minY = Infinity;
        let maxY = -Infinity;
        for (const id of ids) {
          const l = laid[id];
          if (!l) continue;
          if (l.y < minY) minY = l.y;
          if (l.y + l.h > maxY) maxY = l.y + l.h;
        }
        if (!Number.isFinite(minY)) {
          const l = laid[b.nodeId];
          minY = l.y;
          maxY = l.y + l.h;
        }
        return { ids, minY, maxY, h: maxY - minY, centerY: (minY + maxY) / 2 };
      });
      spans.forEach((sp, i) => {
        groupHeight += sp.h;
        if (i < spans.length - 1) groupHeight += NODE_GAP_Y;
      });

      // 步骤 d:条带群在网关中心两侧居中，各分支子树整块平移
      //  （dagre 已排好子树内部相对位置，平移只改它在整图中的垂直位置；
      //   不同分支各走各的闭包，互不干扰）
      let cursorY = gwCenterY - groupHeight / 2;
      for (const sp of spans) {
        const delta = cursorY + sp.h / 2 - sp.centerY;
        if (Math.abs(delta) > 0.5) {
          for (const id of sp.ids) {
            const l = laid[id];
            if (l) l.y += delta;
          }
        }
        cursorY += sp.h + NODE_GAP_Y;
      }

      // 步骤 e:汇合点对齐条带群中心，修正量沿汇合后的 seq 单流继续传播
      //  （junction 出边只有汇合后单流，边有向，BFS 不可能串回兄弟分支）。
      //  途中若遇到后续网关（含它自己的汇合点），整块一起平移；该网关轮到
      //  自己时再按当前位置做一次「绝对居中」，平移量被自然吸收、结果幂等。
      const junction = laid[junctionId];
      if (junction) {
        const jDelta = gwCenterY - junction.h / 2 - junction.y;
        if (Math.abs(jDelta) > 0.5) {
          const visited = new Set<string>();
          const stack = [junctionId];
          while (stack.length > 0) {
            const id = stack.pop()!;
            if (visited.has(id)) continue;
            visited.add(id);
            const l = laid[id];
            if (l) l.y += jDelta;
            for (const k of descendants.get(id) ?? []) {
              if (!visited.has(k)) stack.push(k);
            }
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
