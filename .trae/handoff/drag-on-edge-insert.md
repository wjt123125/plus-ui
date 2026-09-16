# 拖业务节点到 edge 上自动插入（A 范式）— 任务交接

> 交接时间：2026-09-16
> 关联会话：上一个上下文已满，本文件用于新会话接续
> 工作目录：`e:/01.code/plus-ui`

---

## 1. 任务目标

拖左侧物料面板的业务/算子节点到画布的 edge（连线）上时，应**自动插入到该边所在链路位置**（语义同 picker 弹层的 `insertOnEdge`），效果类似 n8n/Zapier。

视觉上不做分类反馈——所有 edge 命中颜色统一，但底层 `insertOnEdge` 按 `edge.data.treeAnchor.kind` 自动走 seq / jump / branch 三种分支。

---

## 2. 当前状态

### 已完成且稳定
- **placeholder 拖拽替换**：`findPlaceholderAt` 已改用官方 `getIntersectingNodes(rect, true).filter(n => n.data.placeholderOf)`，稳定命中。
- 6 个算子 project 函数（projectIf/Catch/Boolean/When/Switch/Loop）+ serializeNode/findInSubtree/findParentInSubtree/projectThen 全部跳过 undefined 空洞。
- `useAutoLayout.ts` dagre 重排后改用 `setNodes(laidNodes)` 替换数组，保证 store/DOM 同步。
- `insertOnEdge(edgeId, defType)` 已实现并接入 picker 弹层路径（`openPicker({mode:'insertEdge', edgeId})` → `pickDef` → `insertOnEdge`），四种 kind 都有处理。
- oxlint + vue-tsc 通过。

### 未实现（本次要做）
- **拖拽路径未接 edge 命中**：`insertNodeAt(type, x, y)` 当前只有两条分支：
  1. `findPlaceholderAt(x, y)` 命中 → `replacePlaceholder`
  2. 否则 fallback → 计算最大 bottom + GAP_Y 坐标 → `appendChildToRoot` 追加到根末尾
- **没有 `findEdgeAt` 命中检测**，拖到 edge 上和拖到空白走的是同一条 fallback 路径。

### 现象与根因
- 用户测试：拖业务节点到 edge 上时，**新节点出现在主链末端附近，且 END 节点被串到新节点前面**（END→新节点方向的边）。
- 根因：走 fallback → `appendChildToRoot` 把新节点 push 到 `root.children` 末尾 → 新节点变成主链末端 → 投影时主链末端连向 END（virtual 终点），所以视觉上 END 像被串到了新节点前面。
- `appendChildToRoot` 在 `useElTreeModel.ts` L1174：root 是 THEN 时直接 `children.push(child)`；root 是其他算子时包一层 `THEN(旧root, child)`。

---

## 3. 已选方案（B2：点到线段距离 < 30px）

VueFlow 官方**没有**"点是否在 edge 上"的 API，需自写。

### 几何检测
- 在 `useCanvasController.ts` 加 `findEdgeAt(rect: Rect): string | null`
- 遍历 `getEdges.value`，对每条 edge：
  - 取 source/target 节点的 `computedPosition` + `dimensions` 算中心点
  - 连成线段 (p1, p2)
  - 算落点 rect 中心到该线段的距离
  - `< 30px` 视为命中
- 多条命中取距离最近的一条

### 接入 insertNodeAt
- 在 `findPlaceholderAt` 检测后、fallback 前，插入 `findEdgeAt(rect)` 命中分支
- 命中时调 `insertOnEdge(edgeId, type)` 并 return（不再走 fallback）

---

## 4. 关键文件路径

| 文件 | 关键符号 | 行号 |
| --- | --- | --- |
| `e:/01.code/plus-ui/src/views/databus/editor/composables/useCanvasController.ts` | `insertNodeAt` | L173 |
| 同上 | `findPlaceholderAt` | L240 |
| 同上 | `insertOnEdge` | L350 |
| 同上 | `cacheMidpoint` | L425 |
| 同上 | `replacePlaceholder` | L258 |
| 同上 | 顶部解构 `useVueFlow()` | L110（已解构 `getIntersectingNodes`，需补 `getEdges`） |
| `e:/01.code/plus-ui/src/views/databus/editor/components/FlowCanvas.vue` | `onDrop` | L143 |
| 同上 | `onDragOver` | L137 |
| `e:/01.code/plus-ui/src/views/databus/editor/composables/useElTreeModel.ts` | `appendChildToRoot` | L1174 |
| 同上 | `EdgeTreeAnchor` 类型、`buildEdge` | 见文件 |

---

## 5. 边数据结构（关键）

每条 edge 的 `data` 形态：

```ts
edge.data = {
  kind: 'seq' | 'jump' | 'branch' | 'merge',
  treeAnchor: {
    parentId: string,        // 该边所属的算子节点 id（ElNode 层）
    seqToIndex?: number,     // kind='seq' 时：THEN.children 的 splice 位置
    branchIndex?: number,    // kind='jump'|'branch'|'merge' 时：children 的槽位索引
  },
  // 其他投影元数据...
}
```

四种 kind 的 `insertOnEdge` 处理（已实现，L350-L422）：
- `seq` → THEN seq 边：splice 到 `parent.children[seqToIndex]` 前
- `jump` → gateway→placeholder 空槽：直接 `children[branchIndex] = newNode`
- `branch` / `merge` → 分支边：把 `children[branchIndex]` 包装成 `THEN(old, new)`

---

## 6. 实施步骤

### Step 1：加 `findEdgeAt`
位置：`useCanvasController.ts`，紧挨 `findPlaceholderAt` 后面。

```ts
/**
 * 落点命中检测：返回与落点 rect 中心距离 <30px 的最近 edge id（无则 null）。
 * VueFlow 无"点是否在 edge 上"的官方 API，需自写点到线段距离。
 * 节点中心用 computedPosition + dimensions 计算（已应用 extent 钳制等派生计算）。
 */
function findEdgeAt(x: number, y: number): string | null {
  const cx = x + NODE_W / 2;
  const cy = y + NODE_H / 2;
  let bestId: string | null = null;
  let bestDist = 30; // 命中阈值 30px
  for (const edge of getEdges.value) {
    const s = getNodes.value.find(n => n.id === edge.source);
    const t = getNodes.value.find(n => n.id === edge.target);
    if (!s || !t) continue;
    const w1 = s.dimensions?.width ?? NODE_W;
    const h1 = s.dimensions?.height ?? NODE_H;
    const w2 = t.dimensions?.width ?? NODE_W;
    const h2 = t.dimensions?.height ?? NODE_H;
    const p1 = { x: s.computedPosition.x + w1 / 2, y: s.computedPosition.y + h1 / 2 };
    const p2 = { x: t.computedPosition.x + w2 / 2, y: t.computedPosition.y + h2 / 2 };
    const d = pointToSegmentDistance(cx, cy, p1.x, p1.y, p2.x, p2.y);
    if (d < bestDist) {
      bestDist = d;
      bestId = edge.id;
    }
  }
  return bestId;
}

function pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
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
```

### Step 2：接入 insertNodeAt
在 `insertNodeAt` 中，`findPlaceholderAt` 命中分支后、fallback 前插入：

```ts
// 落点命中已有 edge：调 insertOnEdge（语义同 picker 的"线上插入"）
const edgeId = findEdgeAt(x, y);
if (edgeId) {
  insertOnEdge(edgeId, type);
  return;
}
```

注意：`insertOnEdge` 内部已 `commit()` + `runAutoLayout({ fitView: false })`，不要再重复调。

### Step 3：补充解构
`useCanvasController.ts` L110 的 `useVueFlow()` 解构里**已经包含 `getEdges`**（确认一下），无需补；如果没解构，补 `getEdges`。

### Step 4：反馈层（可选，先不做）
原计划在 `FlowCanvas.vue` 的 `onDragOver` 给命中的 edge 加临时高亮 class。可暂缓，先保证功能正确，再做视觉反馈。

### Step 5：验证
1. `oxlint` + `vue-tsc` 零成本本地校验
2. 用户自测拖到不同类型 edge（seq/jump/branch/merge）是否触发对应 `insertOnEdge` 分支
3. 拖到空白处仍走 fallback 追加到根末尾（保留原行为）
4. 拖到 placeholder 上仍走 `replacePlaceholder`（保留原行为）

---

## 7. 注意事项

### 撤销栈
- `insertOnEdge` 内部已调 `commit()`（入栈一次）
- `runAutoLayout({ fitView: false })` 不入栈（保持现状）
- 拖拽路径接入后，**不要再额外调 `commit()`**，避免重复入栈

### autoLayout 行为
- `insertOnEdge` 结尾会跑 `runAutoLayout({ fitView: false })` 重排整图
- 这是必要的——seq splice / 分支包装会改变整条链路拓扑，新节点坐标和子树位置都不准确

### 不破坏现有路径
- 拖到 placeholder：仍走 `replacePlaceholder`（保留）
- 拖到 edge：走 `insertOnEdge`（新增）
- 拖到空白：走 fallback `appendChildToRoot`（保留）

### placeholder 命中优先级
- 当前 `findPlaceholderAt` 用 `getIntersectingNodes`，**先于** `findEdgeAt` 执行
- placeholder 节点和 edge 视觉上不会重叠（placeholder 是空槽位，edge 是连线），所以两者检测顺序不会冲突

---

## 8. 历史决策与红线（来自上一个上下文）

- **不做分类反馈**：视觉上所有 edge 命中颜色统一，底层 `insertOnEdge` 自动按 `treeAnchor.kind` 走三种分支。原因：分类反馈增加复杂度但收益不大，用户拖到任何 edge 上的意图都是"插入"，kind 由数据决定。
- **自研、不用第三方库**：VueFlow 无官方"点在 edge 上"API，自写点到线段距离最简单可靠。
- **B2 方案**：选 30px 阈值是因为 VueFlow 默认 `connection-radius=24`、`edge-updater-radius=14`，30px 比这两个略大，覆盖贝塞尔曲线的视觉宽度。
- **END 是 virtual 终点**：投影时画在主链末端位置，主链末端节点连一条边到 END。`appendChildToRoot` 把新节点 push 到 `root.children` 末尾后，新节点变成主链末端，因此"END 被串到新节点前面"——这是 fallback 路径的副作用，A 范式接入后不会再触发。

---

## 9. 下个会话工作清单

1. 读本文件全文
2. 读 `useCanvasController.ts` 的 `insertNodeAt`(L173) / `findPlaceholderAt`(L240) / `insertOnEdge`(L350) 三段
3. 实施 Step 1（加 `findEdgeAt` + `pointToSegmentDistance`）
4. 实施 Step 2（接入 `insertNodeAt`）
5. 跑 oxlint + vue-tsc
6. 报告验证要点，交用户自测
