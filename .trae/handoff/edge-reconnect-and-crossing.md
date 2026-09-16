# 删边/线头重连 与 连线交叉 — 讨论交接

> 交接时间：2026-09-16（discuss 讨论模式产出，代码尚未改动）
> 关联：扁平化改造走查（走查清单 8 项仅余本文两个问题，其余通过）
> 工作目录：`e:/01.code/plus-ui`，编辑器根：`src/views/databus/editor/`

---

## 0. 一句话现状

- **议题一（已定稿，待动手）**：边不可删；换分支归属靠「选中边 → 拖线头」，分支线支持两拖交换（pending 事务态），主链 seq 线拖放直接重排。
- **议题二（待拍板）**：SWITCH/IF 自动排列后分支线交叉。修复分「补丁档 / 根治档 / 不修」三档，新会话第一件事是让用户拍板档位（用户表示没听懂补丁档与根治档的区别，见 §4）。

---

## 1. 议题一：删边与线头重连（定稿规格）

### 1.1 已确认的事实（源码证据）

1. [FlowCanvas.vue:21](../../../src/views/databus/editor/components/FlowCanvas.vue) `:delete-key-code="null"`，VueFlow 内置删除关闭。
2. [index.vue:379-383](../../../src/views/databus/editor/index.vue) Delete/Backspace 只调 `ctrl.requestDeleteNode()`，读的是节点 `selectedId`；边选中（`edge.selected`）从未同步给控制器 → 按 Delete 对边无效。
3. [useCanvasController.ts:556-560](../../../src/views/databus/editor/composables/useCanvasController.ts) `requestDeleteEdge` 只调 `removeEdges()`，注释自认"边是投影产物，删边只影响视图"——不改树、不入栈、不刷 EL，下次重投影复活，撤销按钮始终 disabled。
4. **重连路径裸奔**：VueFlow 内部拖线头时本来会校验（`node_modules/@vue-flow/core/dist/vue-flow-core.mjs` L5241-5307，松手 `isValid` 才回调 `onEdgeUpdate`），但我们的 `isValidConnection` 只写在 `onConnect` 回调里手动调，**没有绑到 VueFlow 的 `:is-valid-connection` prop** → 内置校验恒真 → 同一 handle 可挂多条边（用户实测双线成立）。[FlowCanvas.vue:122-131](../../../src/views/databus/editor/components/FlowCanvas.vue) 的 `onEdgeUpdate` 只手改 `gEdge.source/target`，不回写树、不入栈 → 视图与 ElNode 树静默分叉（保存白拖、任意重投影回弹、大纲/EL 预览不一致）。
5. **多线共端点不中**：每条边各自渲染一个 source/target 重连圆点（vue-flow-core.mjs L8983-9018），共端时完全重叠，DOM 后渲染者盖住前者 → 每次抓到的都是同一条线。VueFlow 无内建消歧。
6. 参考实现 liteflow-editor-client（X6 纯图引擎）官方仍**禁止删边**：`common/shortcuts.ts` L78-80 Delete 显式 `.filter(cell => cell.isNode())`。自由度由目标语言决定：BPMN XML 里 sequenceFlow 是独立实体，EL 是嵌套树，悬空/双线无法序列化成 EL。

### 1.2 定稿的交互规格

**A. 边不可删除**
- 移除右键菜单 edge 场景的「删除连线」项：[CmpContextMenu.vue:29-37](../../../src/views/databus/editor/components/CmpContextMenu.vue)（`onDeleteEdge` 一并清理）。
- Delete/Backspace 维持只删节点。
- 理由：边是 ElNode 树槽位关系的投影，无独立语义；对齐官方编辑器。

**B. 选中消歧（bpmn-js / draw.io 同款，用户认可）**
- 边的重连手柄（`g.vue-flow__edgeupdater`）默认不显示/不可点，**仅该边 selected 时显示**。
- 实现：全局/画布级 CSS 类似 `.vue-flow__edge:not(.selected) .vue-flow__edgeupdater { opacity:0; pointer-events:none; }`（类名以实际 DOM 为准，实施时核实）。
- 交互链：点线段本体选中（自定义边已有 20px 透明热区 `cmp-edge-hot`）→ 线头出现拖拽图标 → 拖它，绝不抓错。

**C. 拖线头重连 = 树操作（不再手改 gEdge 了事）**

`onEdgeUpdate` 改为交控制器按 `edge.data.treeAnchor` 分流，完成后统一 `commit()`（重投影 + 入栈 + 刷 EL）：

- **分支线 branch / merge（IF/SWITCH/WHEN/CATCH/FOR/布尔）**：
  - branch 边活动端是 target（网关 handle 端固定）；merge 边活动端是 source（junction handle 端固定）。两者映射同一槽位操作，槽位 = `treeAnchor.parentId` 的 `children[treeAnchor.branchIndex]`。
  - 对端节点所属槽位用现成的 `treeModel.findNodeParent(id)`（findParentInSubtree 包装）反查。
  - **目标是空槽（placeholder）→ 移动**：子树移到空槽，原槽位删除（投影自然变占位），直接 commit。
  - **目标槽位已被占 → 进入 pending「交换待完成」态（用户拍板的人工两拖方案）**：
    - 记录 `pending = { edgeId, fromSlot:{parentId,index}, toSlot:{parentId,index} }`；
    - 视图允许临时双线（VueFlow 回调里照常改 gEdge 显示），pending 线**高亮虚线**，画布轻提示：「把另一根线拖到空出的节点，Esc 取消」；
    - 第二次拖拽互补成功（toSlot 的原子树接回 fromSlot 节点）→ `swap(父A.children[i], 父B.children[j])`（跨父时同步 parentOperatorId）→ commit；
    - Esc / 点空白 → 取消 pending，重投影回正；
    - 保存（`saveAsEl`）、undo 前若存在 pending → 自动取消并 ElMessage 提示，杜绝带脏保存/入栈；
    - pending 期间 EL 预览不刷新（或预览面板显示"连线交换未完成"）。
  - 子树整体随槽位走（槽位内容是完整子树，不是光头节点）。
- **主链 seq 线**：拖 a→b 线头到 c = 数组移动「c 排到 a 后面」（`children.splice` 重排），松手即合法直接 commit；防环校验：c 不得是 a 的祖先；非法弹回。
- **jump 边（→空槽占位）**：语义同分支槽移动。
- **非法拖法一律不改视图、线头弹回**：拖到 gateway/junction/节点自身、错误类型句柄等。
- 注意：因 pending 需要允许临时双线，`:is-valid-connection` prop **不能**简单绑成"同 handle 一出一入"；prop 校验只做自连/同节点等硬排除，占用冲突交给 onEdgeUpdate 的 pending 状态机。实施时留意 merge 边 source 端拖拽的对称处理。

### 1.3 受影响文件（预估）

| 文件 | 改动 |
|---|---|
| `components/FlowCanvas.vue` | onEdgeUpdate 改调控制器；CSS 选中消歧；is-valid-connection 绑定（只做硬排除） |
| `composables/useCanvasController.ts` | 新增 reconnect 状态机（移动/swap/pending/取消）；删 requestDeleteEdge |
| `components/CmpContextMenu.vue` | 移除「删除连线」菜单项 |
| `index.vue` | saveAsEl 前 pending 检查；Esc 取消接快捷键 |
| 可能：`components/edges/CmpBezierEdge.vue` 或全局样式 | pending 线高亮虚线样式 |
| `composables/useElTreeModel.ts` | 可能新增 `swapSlots(a:{parentId,index}, b:{...})`、`moveSlot` 树操作 |

---

## 2. 议题二：连线交叉（根因已定，档位待拍板）

### 2.1 根因（截图：SWITCH 三分支，载入示例后）

1. [GatewayNode.vue:56-62](../../../src/views/databus/editor/components/GatewayNode.vue) 网关底边 handle 物理位置钉死：case1 左、case2 中、case3 右。
2. dagre 同层节点顺序靠 barycenter 启发式，**无公开 API 固定层内顺序**（已核实 @dagrejs/dagre 3.1.1 dist 类型与打包源码）。SWITCH「网关扇出 + 对称汇合」菱形的三个分支重心值相同，tie-break 取决于喂入顺序，可排出 case3/case2/case1 反序。
3. handle 顺序（1/2/3）与节点列顺序（3/2/1）相反 → 贝塞尔线左端点甩最右列、右端点甩最左列 → X 交叉（与截图吻合）。
4. [useAutoLayout.ts:73-83](../../../src/views/databus/editor/composables/useAutoLayout.ts) 给 branch 边加 weight 5/3/1 是**误用**：dagre edge.weight 只管层级松紧（rank），不管层内左右顺序，该 hack 原理上无效，修复时顺手删除；merge 边 `constraint:false` 也应重新评估（可能影响 junction 分层）。
5. dagre 自动触发点（交叉会反复复现的原因）：载入示例 [index.vue:311](../../../src/views/databus/editor/index.vue)、边上插入节点 [useCanvasController.ts:424](../../../src/views/databus/editor/composables/useCanvasController.ts)、undo/redo [useFlowHistory.ts:69](../../../src/views/databus/editor/composables/useFlowHistory.ts)。

### 2.2 官方事实

- VueFlow 官方无内置布局（"Vue Flow does not have a built-in layouting system"），官方示例用 dagre，不回答"端口固定顺序防交叉"——这是布局器职责。
- 生态主流：dagre（任意 DAG 通用启发式，不保证顺序）；**elkjs**（Eclipse ELK layered，支持 `elk.portConstraints: FIXED_ORDER`，端口顺序敏感图事实标准，React Flow 社区主流，约 900KB 需动态 import）。
- 参考实现 liteflow-editor-client 也用 dagre（LR 方向，ELK 方案注释保留未用），未处理此问题。

---

## 3. 议题二三档方案

### 补丁档（推荐）——只改 `useAutoLayout.ts`，几十行

dagre 照常负责分层（y 坐标）和整体尺寸；布局输出后，**只对每个网关直接扇出的分支层**做修正：读 branch 边的 `treeAnchor.branchIndex`，把同层分支节点（含其子树整体水平平移）按 1/2/3 重新分配 x 坐标；删掉无效 weight hack。

- 效果：截图这种一层 SWITCH/IF/WHEN 数学上必然不交叉；
- 边界：多层嵌套（分支里再套网关）时非直接扇出层 dagre 仍可能乱，需后续再升级。

### 根治档——自研树递归布局替换 dagre 内核，约 150–250 行

不依赖通用布局器，直接按 ElNode 树递归算坐标：叶子定宽；THEN 纵向堆叠；网关的 children 严格按 branchIndex 横向排列，网关与 junction 取分支包络居中。坐标缓存/fitView/写回 positionCache 的现有外壳不变。

- 效果：任意嵌套数学保证零交叉、零新依赖、同步执行；
- 代价：自维护一份布局器。

### 不修

dagre 保持现状，交叉由用户手动拖节点解开（坐标缓存会记住，之后不再自动 dagre，但载入示例/插边/undo 三个时机仍会复现交叉）。

### 为什么不是 elkjs

异步 API、900KB 体积、要把网关/junction/placeholder 虚拟节点和 ports 全部映射重做；相比补丁档收益不匹配，相比根治档又多一个重依赖。

---

## 4. 给新会话的说明：补丁档 vs 根治档到底差在哪（用户原话：没懂 1 和 2 的区别）

打个比方：

- **补丁档** = dagre 继续当排版员把整篇文章排完，我们加一个校对员，**只检查"网关目录的章节顺序"这一项**：发现 case1 排到右边了，就把分支们的水平位置对调过来。校对员不知道全文其他地方还有没有顺序问题，所以深层嵌套（章节里还有章节）可能漏。改动 = 一个文件加几十行后处理。
- **根治档** = **开除排版员，自己按大纲（ElNode 树）从头排版**：因为我们的图形状极其规则（串行就竖着叠、分支就横着排、汇合点居中），算法不复杂，而且任何层级的章节顺序都由 branchIndex 决定，永远不会排反。代价 = 自己养这份排版代码（150–250 行），以后布局规则自己负责。
- **不修** = 排版员排错就错，每次自己手动拖。

---

## 5. 新会话第一步

1. 先让用户在「补丁档 / 根治档 / 不修」中拍板议题二（§3、§4）。
2. 然后实施议题一（§1.2 已定稿，无需再讨论），建议顺序：
   - ① 移除右键删边 + Delete 链路保持节点专用；
   - ② 选中边才显示 updater 的消歧 CSS；
   - ③ 控制器 reconnect 状态机（先做 seq 重排与空槽移动，再做 pending 两拖交换）；
   - ④ 保存/undo 的 pending 拦截 + Esc 取消；
   - ⑤ 静态校验 oxlint + vue-tsc（既有 CmpContextMenu clientX/clientY 报错与本次无关），浏览器验证交用户。
3. 验证要点：议题一——两拖交换后 EL 预览/撤销正确、Esc 回弹、保存拦截；议题二——重新载入 SWITCH 示例，case1/2/3 线不交叉、undo/redo 后仍不交叉。
