/**
 * 自动排列 composable：dagre 一次排全图（方案 B 平级节点，无容器递归子图）。
 *
 * 提取出来供 FlowLayoutButton 与 CanvasController 共用——
 * 任何结构变更（拖入/插入/删除/载入示例）后都可调用，保证画布始终整齐。
 *
 * 坐标写回 treeModel.positionCache：跨重投影保留 dagre 排好的位置，
 * 避免下次重投影又退回 cursor 默认摆放。
 */
import { nextTick } from 'vue';
import dagre from '@dagrejs/dagre';
import { useVueFlow } from '@vue-flow/core';
import { GATEWAY_H, GATEWAY_W, JUNCTION_H, JUNCTION_W, NODE_H, NODE_W } from './useElTreeModel';
import type { CmpNodeData } from '../cmp-tree';
import type { ElTreeModel } from './useElTreeModel';

// 各节点类型的尺寸兜底（DOM 未测量时用）
const SIZE_MAP: Record<string, { w: number; h: number }> = {
  cmp: { w: NODE_W, h: NODE_H },
  gateway: { w: GATEWAY_W, h: GATEWAY_H },
  junction: { w: JUNCTION_W, h: JUNCTION_H },
  placeholder: { w: NODE_W, h: NODE_H }
};

const LAYOUT_DURATION = 300;
const LAYOUTING_CLASS = 'is-flow-layouting';

export interface AutoLayoutOptions {
  /** 排列完成后是否自适应视口（首次载入/批量结构变更时 true，单节点编辑可 false） */
  fitView?: boolean;
}

export function useAutoLayout(treeModel: ElTreeModel) {
  const { getNodes, getEdges, fitView, vueFlowRef } = useVueFlow();

  function autoLayout(options: AutoLayoutOptions = {}): void {
    const { fitView: shouldFit = true } = options;
    const flowNodes = getNodes.value;
    if (flowNodes.length === 0) return;

    const g = new dagre.graphlib.Graph();
    // dagre 排平级节点：TB 方向。
    // nodesep 40 / ranksep 80（增大层级间距让分支边不挤在一起交叉）
    // marginx/marginy 留白避免节点贴边
    g.setGraph({
      rankdir: 'TB',
      nodesep: 40,
      ranksep: 80,
      marginx: 20,
      marginy: 20
    });
    g.setDefaultEdgeLabel(() => ({}));

    flowNodes.forEach((n) => {
      // virtual cmp 节点（start/end）是 56×56 圆形，不走 150×56 业务卡尺寸
      const isVirtualCmp = n.type === 'cmp' && (n.data as CmpNodeData | undefined)?.virtual;
      const fallback = isVirtualCmp
        ? { w: GATEWAY_W, h: GATEWAY_H }
        : (SIZE_MAP[n.type ?? 'cmp'] ?? SIZE_MAP.cmp);
      g.setNode(n.id, {
        width: n.dimensions?.width || fallback.w,
        height: n.dimensions?.height || fallback.h
      });
    });

    // dagre crossing minimization：给边加 weight 引导排序，减少交叉
    // weight 越大越倾向排在前面；merge 边 constraint=false 让它不参与层级约束
    // branch 边按 sourceHandle 解析权重：true/case1/try 排前面，false/case2+/catch 排后面
    getEdges.value.forEach((e) => {
      const data = e.data as { kind?: string } | undefined;
      const kind = data?.kind ?? 'seq';
      const label: Record<string, unknown> = {};
      if (kind === 'branch') {
        // 分支边：true/case1/try 权重高（排前面），false/case2+/catch 权重低
        const h = e.sourceHandle ?? '';
        let weight = 1;
        if (h === 'true' || h === 'case_1' || h === 'try' || h === 'b1' || h === 'branch_0') weight = 5;
        else if (h.includes('1')) weight = 3;
        label.weight = weight;
      } else if (kind === 'merge') {
        // merge 边不参与层级约束（让 dagre 只关心分支起点顺序）
        label.constraint = false;
      }
      g.setEdge(e.source, e.target, label);
    });

    dagre.layout(g);

    // dagre 输出中心点 → VueFlow position 是左上角；同时写回 treeModel 坐标缓存
    for (const n of flowNodes) {
      const laid = g.node(n.id);
      if (laid) {
        const x = laid.x - laid.width / 2;
        const y = laid.y - laid.height / 2;
        n.position = { x, y };
        treeModel.cachePosition(n.id, x, y);
      }
    }

    const host = vueFlowRef.value;
    host?.classList.add(LAYOUTING_CLASS);
    if (shouldFit) {
      // 双层 rAF 确保：① setNodes 后 Vue 渲染出 DOM 节点 ② VueFlow ResizeObserver 完成首次尺寸测量
      // 直接 fitView 会用零尺寸算 bounds，等于没缩放。
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
