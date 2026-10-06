/**
 * 自动排列 composable：ELK（elk.layered 分层算法）出节点坐标。
 *
 * 为什么是 ELK 而不是 dagre？
 *   本画布的网关（IF/SWITCH/WHEN/CATCH/布尔）把 outlet handle 物理钉死在
 *   菱形右边（top% = i/(n-1)，见 GatewayNode.vue），布局必须保证「分支根节点
 *   的上下顺序 == outlet 声明顺序」，否则连线必交叉。dagre 无端口顺序约束，
 *   只能在它排完后手工补丁——补丁一度膨胀到近 300 行（分支重排/子树包围盒
 *   条带/嵌套网关深度排序/junction 对齐与续尾传播），且嵌套场景反复自生
 *   bug。ELK 用两层原生约束解决，无任何后处理补丁：
 *   ① portConstraints: FIXED_ORDER 固定网关/junction 上的端口序；
 *   ② considerModelOrder=NODES_AND_EDGES + forceNodeModelOrder 锁定同层
 *      节点序——只固定端口不够：对称分支重心相同会被 tie-break 反排；
 *      投影器按树先序喂入的节点序即 outlets 语义顺序，锁定它即可。
 *
 * 集成边界：
 *   - ELK 只在显式自动排列（按钮 / 结构变更后）时运行，只产出节点 x/y；
 *     手动拖拽位置缓存（layoutCache）、placeholder、边样式均与本文件无关。
 *   - 边不使用 ELK 的路由 sections，全图统一由 CmpEdge 调
 *     VueFlow getBezierPath 画三次贝塞尔弧线。edgeRouting: ORTHOGONAL 仍要
 *     设置——ELK 在该模式下会为边预留层间通道，节点坐标本身就给跨列长边
 *     让出走廊，弧线不贴着节点走。
 *   - ELK 输出的 port 坐标不消费：Handle 保持 CSS top% 均分，FIXED_ORDER
 *     只借它保证节点顺序与 handle 顺序一致。
 *
 * 体积/异步：
 *   elk.bundled min 约 1.6MB，动态 import 切独立 chunk，首次排列才加载；
 *   ELK API 本身异步，连续触发排列时只认最后一次结果（重入防护）。
 *
 * 尺寸兜底(节点类型 → w×h):
 *   cmp / gateway / junction / placeholder 都有固定尺寸,ELK 用它算 layout。
 *   virtual cmp(start/end) 是圆形 56×56,不走业务卡 150×56。
 */
import { nextTick } from 'vue';
import { useVueFlow } from '@vue-flow/core';
import type { ELK, ElkNode } from 'elkjs/lib/elk.bundled';
import {
  GATEWAY_H,
  GATEWAY_TOTAL_H,
  GATEWAY_W,
  JUNCTION_H,
  JUNCTION_W,
  NODE_H,
  NODE_W
} from './useElTreeModel';
import type { ElTreeModel, CmpNodeData } from './useElTreeModel';

/** ELK 未测出 DOM 尺寸时的兜底（ELK 用这些值算节点间距）。
 *  gateway 用含 label 的总高(GATEWAY_TOTAL_H)，virtual cmp 起止节点走 GATEWAY_H(shape 本身)。 */
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

/** elk.bundled 动态 import:独立 chunk,首次自动排列时才下载 */
let elkPromise: Promise<ELK> | undefined;
function getElk(): Promise<ELK> {
  if (!elkPromise) {
    elkPromise = import('elkjs/lib/elk.bundled.js').then((m) => new m.default());
  }
  return elkPromise;
}

/** 重入防护:每次排列递增序号,await 回来后序号过期则丢弃结果(连续编辑只认最后一次) */
let runSeq = 0;

/** 画布节点的 port 命名约定:ELK 边的 endpoint 引用 "节点id.portId"。
 *  普通节点单入单出;gateway 多出口 id 与 outlet.handle 一致;
 *  junction 多入口 id 与 targetHandle(=outlet.handle) 一致。 */
const PORT_IN = '__in';
const PORT_OUT = '__out';

function portSide(side: 'WEST' | 'EAST'): Record<string, string> {
  return { 'elk.port.side': side };
}

export function useAutoLayout(treeModel: ElTreeModel) {
  const { getNodes, getEdges, setNodes, fitView, vueFlowRef } = useVueFlow();

  async function autoLayout(options: AutoLayoutOptions = {}): Promise<void> {
    const { fitView: shouldFit = true } = options;
    const seq = ++runSeq;
    const flowNodes = getNodes.value;
    if (flowNodes.length === 0) return;

    // ── 阶段 1:把画布节点/边建成 ELK 图 ─────────────────────────────
    const children: ElkNode[] = flowNodes.map((n) => {
      const isVirtualCmp = n.type === 'cmp' && (n.data as CmpNodeData | undefined)?.virtual;
      const fallback = isVirtualCmp
        ? { w: GATEWAY_W, h: GATEWAY_H }
        : (SIZE_MAP[n.type ?? 'cmp'] ?? SIZE_MAP.cmp);
      const width = n.dimensions?.width || fallback.w;
      const height = n.dimensions?.height || fallback.h;
      const data = n.data as CmpNodeData | undefined;

      const ports = [];
      const nodeOpts: Record<string, string> = {};

      if (n.type === 'gateway') {
        // 单入口 + N 出口,出口顺序必须与 outlets 数组(物理 handle 顺序)一致
        nodeOpts['elk.portConstraints'] = 'FIXED_ORDER';
        ports.push({ id: `${n.id}${PORT_IN}`, width: 1, height: 1, layoutOptions: portSide('WEST') });
        for (const o of data?.outlets ?? []) {
          ports.push({
            id: `${n.id}${PORT_OUT}_${o.handle}`,
            width: 1,
            height: 1,
            layoutOptions: portSide('EAST')
          });
        }
      } else if (n.type === 'junction') {
        // N 入口(与所属网关 outlets 同序) + 单出口;JunctionNode 空 outlets 时兜底单入口
        nodeOpts['elk.portConstraints'] = 'FIXED_ORDER';
        const inlets = data?.outlets ?? [];
        if (inlets.length > 0) {
          for (const o of inlets) {
            ports.push({
              id: `${n.id}${PORT_IN}_${o.handle}`,
              width: 1,
              height: 1,
              layoutOptions: portSide('WEST')
            });
          }
        } else {
          ports.push({ id: `${n.id}${PORT_IN}`, width: 1, height: 1, layoutOptions: portSide('WEST') });
        }
        ports.push({ id: `${n.id}${PORT_OUT}`, width: 1, height: 1, layoutOptions: portSide('EAST') });
      } else {
        // cmp/placeholder:start 只出、end 只入,其余一进一出
        // （与 CmpNode 的 Handle v-if 严格一致：左入 !==start，右出 !==end）
        if (data?.defType !== 'start') {
          ports.push({ id: `${n.id}${PORT_IN}`, width: 1, height: 1, layoutOptions: portSide('WEST') });
        }
        if (data?.defType !== 'end') {
          ports.push({ id: `${n.id}${PORT_OUT}`, width: 1, height: 1, layoutOptions: portSide('EAST') });
        }
      }

      return { id: n.id, width, height, ports, layoutOptions: nodeOpts };
    });

    const edges = getEdges.value.map((e) => {
      // ELK 0.12 的 JsonImporter 用扁平 shape 表（node/port 各一张，key 都是
      // 元素自身 id），edge 端点直接写 port id，不做 "nodeId.portId" 拆分
      // （已核实 importer 源码：dCd 拿整串查表，带 '.' 反而查不到）。
      // gateway 多出口 / junction 多入口走具名 port,其余引用单入单出 port。
      const sourceRef = e.sourceHandle
        ? `${e.source}${PORT_OUT}_${e.sourceHandle}`
        : `${e.source}${PORT_OUT}`;
      const targetRef = e.targetHandle
        ? `${e.target}${PORT_IN}_${e.targetHandle}`
        : `${e.target}${PORT_IN}`;
      return { id: e.id, sources: [sourceRef], targets: [targetRef] };
    });

    const graph: ElkNode = {
      id: 'elk-root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        // 间距：层间(水平)80；同层节点(垂直)80——旧补丁档把网关各分支条带
        // 按 NODE_GAP_Y=100 排开，80 是接近旧观感的折中（ELK 同层间距无法
        // 区分「分支组间」与「组内」，统一一档）
        'elk.layered.spacing.nodeNodeBetweenLayers': '80',
        'elk.layered.spacing.nodeNode': '80',
        // 正交边与层间节点的避让间距,给跨列 merge 长边留通道
        'elk.layered.spacing.edgeNodeBetweenLayers': '20',
        // ORTHOGONAL 让 ELK 在节点放置阶段就为正交边预留通道(不读它的 sections)
        'elk.layered.edgeRouting': 'ORTHOGONAL',
        // 节点放置用 ELK 默认的 BRANDES_KOEPF + BALANCED：NETWORK_SIMPLEX 以
        // 「总边长最短」为目标，不对称菱形（一路单节点、一路大子树）会把
        // junction 拽向短路、续尾上甩；BALANCED 组合四种对齐取平衡，主骨架
        // （开始→网关→外层 junction→结束）保持水平。
        // 实测：favorStraightEdges=false 对本结构零效果（单节点 block 位置
        // 由依附端口决定）；RIGHTDOWN 会强制下沉、更丑。
        'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
        'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        // 分支顺序零交叉的关键（对称菱形结构的重心 tie-break 病）：
        // FIXED_ORDER 只固定节点上「端口」的排列，同层「节点」谁先谁后仍由
        // 交叉最小化启发式决定——IF/SWITCH 对称分支重心相同时可能排出反序，
        // 端口序对、节点序反，弧线照样交叉（dagre 时代同病）。
        // 投影器按树先序喂节点，网关分支严格按 outlets 0→n 出现、嵌套子树
        // 连续，模型顺序即期望顺序：NODES_AND_EDGES 让交叉最小化尊重模型序，
        // forceNodeModelOrder 进一步锁定（ELK 官方文档明确要求两者配套）。
        'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
        'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
        'elk.padding': '[top=20,left=20,bottom=20,right=20]'
      },
      children,
      edges
    };

    // ── 阶段 2:ELK 布局(异步) ──────────────────────────────────────
    let result: ElkNode;
    try {
      result = await getElk().then((elk) => elk.layout(graph));
    } catch (err) {
      // 布局失败不应拖垮编辑动作(提交已完成),仅留排查线索
      console.error('[autoLayout] ELK layout failed:', err);
      return;
    }
    if (seq !== runSeq) return; // 期间又触发过更新的排列,本次结果作废

    // ── 阶段 3:写回 ─────────────────────────────────────────────────
    // 坐标取单层 children(根的直接子节点坐标即根坐标系下的绝对坐标)。
    // 用最新 getNodes() 映射,保证连续编辑后写回的节点数组不落后于拓扑。
    // 用 setNodes 替换数组让 VueFlow 完全感知位置变更(直接改 position 在
    // Pinia reactive 下可能不同步 edges 端点/viewport bounds/DOM transform)。
    const posById = new Map<string, { x: number; y: number }>();
    for (const c of result.children ?? []) {
      posById.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });
    }

    const laidNodes = getNodes.value.map((n) => {
      const p = posById.get(n.id);
      if (p) {
        treeModel.cachePosition(n.id, p.x, p.y);
        return { ...n, position: p };
      }
      return n;
    });
    setNodes(laidNodes);

    const host = vueFlowRef.value;
    host?.classList.add(LAYOUTING_CLASS);
    if (shouldFit) {
      // 双层 rAF 确保:① setNodes 后 Vue 渲染出 DOM 节点 ② VueFlow ResizeObserver 完成首次尺寸测量
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
