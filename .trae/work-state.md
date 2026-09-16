# 当前工作状态

- 阶段：databus 编辑器｜议题二交叉修复完成（补丁档，已验证），议题一删边重连规格定稿待启动
- 状态：进行中
- 最后更新：2026-09-16

## 当前 Todo
- [ ] 议题一①：移除右键删边菜单项（CmpContextMenu.vue onDeleteEdge 一并清理），Delete 维持节点专用
- [ ] 议题一②：选中边才显示 updater 的消歧 CSS（点线段→线头出现→拖拽）
- [ ] 议题一③：控制器 reconnect 状态机（seq 重排 + 空槽移动 + pending 两拖交换 swap）
- [ ] 议题一④：saveAsEl/undo 前 pending 拦截 + Esc 取消 + pending 期 EL 预览不刷新

> 议题一完整规格见 `.trae/handoff/edge-reconnect-and-crossing.md`

## 已完成
- **议题二补丁档（用户浏览器验证通过）**：dagre 分层 + gateway 直接扇出层按 outlet 顺序（branchIndex）重排 x，嵌套子树 BFS 整体平移（~80 行后处理）；删除 weight 5/3/1 hack 与 merge constraint:false。根治档自研树布局三轮失败（第二轮改崩线断连）被否决；elkjs 评估不换，升级触发条件见 databus-meta 存档
- **拖拽三路径严格分离**：placeholder 12px 容差填槽；任意 edge（含连空槽的边）走 insertOnEdge、空槽保留；空白追加根末尾
- **code-sweep 死代码清扫**：删 cmp-tree.ts（117 行），11 文件直引 useElTreeModel，注释术语统一
- **drag-on-edge-insert A 范式**（已提交 3472c50 / ebb47d1）：findEdgeAt 点到线段 <30px 命中 → insertOnEdge；setNodes 同步；稀疏数组 undefined 跳过；CmpBezierEdge 拖拽视觉反馈
- 议题一/二规格讨论定稿，handoff 写入 `.trae/handoff/edge-reconnect-and-crossing.md`
- 扁平化走查 8 项场景通过；feature/databus 分支首次推送 origin

## 阻塞
- 无（跨仓库：后端 ChainParser 未实现，CHAIN EL 预览仅前端变通，见 databus-meta 存档）

## 验证
- 议题二补丁档：用户浏览器验证通过
- 本次收档按用户要求未跑 oxlint / vue-tsc

## 下次第一步
- 暂无，等待确定下一阶段（议题一四件套规格现成，启动时从 ① 开始）
