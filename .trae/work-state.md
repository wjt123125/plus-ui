# 当前工作状态

- 阶段：databus 编辑器｜扁平化走查 + 议题一删边重连 + 议题二交叉根治
- 状态：进行中
- 最后更新：2026-09-16

## 当前 Todo
- [ ] 议题二·根治档阶段 1：自研树递归布局覆盖 THEN + IF + SWITCH + WHEN（约 90% 用例），删 dagre weight 5/3/1 hack 与 merge constraint:false
- [ ] 议题二·根治档阶段 2：补 CATCH + FOR/WHILE/ITERATOR + AND/OR/NOT + CHAIN 的树递归分支
- [ ] 议题一①：移除右键删边菜单项（CmpContextMenu.vue onDeleteEdge 一并清理），Delete 维持节点专用
- [ ] 议题一②：选中边才显示 updater 的消歧 CSS（点线段→线头出现→拖拽）
- [ ] 议题一③：控制器 reconnect 状态机（seq 重排 + 空槽移动 + pending 两拖交换 swap）
- [ ] 议题一④：saveAsEl/undo 前 pending 拦截 + Esc 取消 + pending 期 EL 预览不刷新

## 已完成
- 扁平化走查 + drag-on-edge-insert A 范式落地（已提交）
  - useAutoLayout.ts: setNodes 替换数组解决 Pinia reactive 同步
  - useElTreeModel.ts: 投影函数跳过稀疏数组 undefined 子项
  - useCanvasController.ts: 拖拽落点命中 edge 路径 + replacePlaceholder 跑 dagre 重排
  - FlowCanvas.vue: dragover/dragleave 转发到 ctrl + 坐标换算一致
  - CmpBezierEdge.vue: dragOverMe 视觉反馈（+ 圆圈主色填充）
- 议题一/二规格讨论定稿，handoff 写入 .trae/handoff/edge-reconnect-and-crossing.md
- 议题二档位拍板：根治档（自研树递归布局替换 dagre 内核，分两阶段实施）

## 阻塞
- 无

## 验证
- 暂未跑 oxlint / vue-tsc（用户表示先提交、有问题再回滚）
- 浏览器验证待用户自测

## 下次第一步
- 实施议题二·根治档阶段 1：在 useAutoLayout.ts 内或新建 useTreeLayout.ts 中实现树递归布局，覆盖 THEN + IF + SWITCH + WHEN；删除 useAutoLayout.ts:66-85 的 weight 5/3/1 hack 与 merge constraint:false；阶段 2 未覆盖的算子先禁用拖入避免半成品
