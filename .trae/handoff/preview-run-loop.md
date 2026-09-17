# 1C 最小闭环：试运行真执行 — 实施清单（v2，discuss 修订版）

> 产出时间：2026-09-16；v2 修订：2026-09-22（discuss 模式讨论拍板，**代码未动**，等用户说「动手」开工）
> 涉及仓库：RuoYi-Vue-Plus（后端）、plus-ui（前端）
> 编辑器根：plus-ui `src/views/databus/editor/`；后端模块：`ruoyi-modules/ruoyi-databus/`

---

## 0. 一句话目标

点亮编辑器「试运行」：前端把画布树 + 入参 JSON 发后端 → 后端生成 EL 并**直接执行 EL 字符串**（不落库）→ 前端展示每步成败耗时与上下文快照。

**本档不做**：落库 / DB 规则源（含 CHAIN 解析阻塞）、公式引擎、BPM 组件（boCreate/processStart）、FOR/SWITCH/ITERATOR 条件件、运行历史持久化、JSON Schema 动态参数表单、引用选择器、URL 编码。

## 0.1 v2 对 v1 的修订（v1 已废）

1. **取消 stub 假组件，写真组件 5 个**（不要求功能完美，但要真干活）；formula、boCreate 撤出本期物料。
2. **实例标识规则明确**：EL 里 nodeId = 组件注册名（可重复）；画布唯一编号序列化为 **tag**。
3. 新增**数据空间（dataSpace）**概念及改名联动。
4. 参数取值规则：**只用裸路径**（`$.a.b`），不教不写 `${}`。
5. 示例换成**本地 RuoYi 真接口 GET /auth/code**，导入即带全套 data，一键可跑。

## 1. 已核实的关键事实（证据）

### LiteFlow 2.16.0（javap 核验）

- 动态执行 API：`flowExecutor.execute2RespWithEL(String elStr, Object param, String requestId, Object... contextBeanArray)`——**无三参 Class 重载**；requestId 传 null；DatabusContext 只有 private 构造，必须传实例：先 `DatabusContext.fromObject(requestData)`。
- 叶子组件内：`this.getTag()` 有值；`this.getCmpData(XxxCfg.class)` 反序列化节点 data（EL 里 `THEN(x.data("JSON"))` 的 data 值）。
- `LiteflowResponse.getExecuteSteps()` → `CmpStep`：`getNodeId()`、`getNodeName()`、`getTag()`、`isSuccess()`、`getTimeSpent()`、`getException()`。
- 官方文档原文示例：`THEN(a.tag("1"), a.tag("2"), a.tag("3"))`——同组件多实例靠 tag 区分，tag 与 nodeId 是 Node 上两个独立字段，框架层**无唯一性校验**，唯一由画布业务层保证。
- NodeBooleanComponent 是布尔组件基类（processBoolean 返回 boolean），EL 里可直接作为 IF/WHILE 条件。

### 项目现状

- 后端 [DatabusEditorController.java](file:///e:/01.code/RuoYi-Vue-Plus/ruoyi-modules/ruoyi-databus/src/main/java/org/dromara/databus/controller/DatabusEditorController.java) 的 `/databus/editor/preview-run` 现仅 generateEL + verify；权限码 `databus:editor:run` 已存在；ExpressGenerator 已对 data 做 escapeJava 转义。
- DatabusExecutor 已有 `execute(chainId, requestData)`、buildResult（CmpStep→NodeStep）、contextJson 快照、DatabusExecutionResult 字段齐全——本档复用，新增按 EL 执行的入口。
- [PathResolver.java](file:///e:/01.code/RuoYi-Vue-Plus/ruoyi-modules/ruoyi-databus/src/main/java/org/dromara/databus/context/PathResolver.java) 已实现三态解析：纯路径整取（正则 `^\$\.[\w.$\[\]]+$`）、混合模板替换（正则同时兼容 `${$.x}` 花括号与裸 `$.x` 两支）、字面量；DatabusContext.resolve 为统一入口。
- application.yml：`liteflow.enable: ${warm-flow.enabled:true}`；服务端口 8080。
- **本地最简真接口**：`GET http://localhost:8080/auth/code`（AuthController/CaptchaController，`@SaIgnore` 免登录、GET 无参、无 `@ApiEncrypt`），返回 `{code:200,msg:"操作成功",data:{captchaEnabled:false,uuid:null,img:null}}`。注意：`POST /auth/login` 带 `@ApiEncrypt` 且全局接口加密默认开启（application.yml `api-decrypt.enabled: true`），明文调不通，**不作为示例**。
- 前端 [useElTreeModel.ts](file:///e:/01.code/plus-ui/src/views/databus/editor/composables/useElTreeModel.ts)：serializeNode 叶子当前输出 `id: node.cmpId`（错，须改为注册名）；parseNode 读 cmp.id/tag/data。mock-presets 的 leaf() 用 `formula_ifCond` 普通 NodeComponent 顶 IF 条件（跑不起来）。index.vue 试运行按钮 disabled；api/databus/el/index.ts 仅 generateEl。

## 2. 设计决策（discuss 已拍板）

### 2.1 实例标识与数据空间（dataSpace）

- EL 形态固定为：`THEN(httpRequest.tag("httpRequest1").data("..."), IF(condition.tag("condition1"), ...))`。
  - **nodeId = 组件注册名**（httpRequest / condition / setValue / fieldMap / response），允许重复；
  - **tag = 数据空间名**，画布层强制唯一（沿用现有 cmpId 重复校验）。
- 面板字段中文叫「**数据空间**」；前端内部字段名暂沿用 `cmpId`（减少改动面），序列化语义即 tag/dataSpace；后端配置文档统一英文字段 **dataSpace / DATA_SPACE**。
- 默认名规则：**同类型序号递增**（httpRequest1、httpRequest2、condition1…），拖入时扫当前树取同类型最大序号 +1（替换现有随机 6 位 defaultCmpId 逻辑）。用户可改成语义短名（如 login、orderQuery）。
- **组件产出默认写入 `$.<dataSpace>.xxx`**（如 `$.httpRequest1.response`），对齐旧系统 NAME_SPACE 分层思想。
- **改名联动**：在属性面板改 dataSpace 时，先扫描全树所有叶子的 data JSON，把 JSONPath / 裸片段中作为**独立路径段**出现的旧名精确替换为新名（`$.httpRequest1.response` → `$.login.response`，只替换第二段精确匹配，避免前缀误伤），替换处数弹窗提示「已联动更新 N 处引用」。函数放 useElTreeModel（树数据归它管），CmpProps 触发。
- 边界（入 backlog）：「引用选择器」（配置里选上游字段而非手敲路径，彻底消除改名问题）、tag 里非法字符校验（只允许字母数字下划线、字母开头）。

### 2.2 参数约定

- 本档属性面板继续**裸 JSON 文本框**（未来走 JSON Schema 动态表单）。
- 取值三态（PathResolver 已支持，组件参数使用前统一走 `context.resolve(value)`）：
  1. 整值是一条完整路径（`"$.token"`）→ **原类型整取**（布尔/数字/对象不字符串化）；
  2. 字符串中含**裸路径片段**（`"编号$.orderId号"`、`"http://x/$.userId/detail"`）→ 字符串拼接替换；
  3. 不含 `$` → 普通字面量。
- **新系统只用裸路径**，文档/示例/物料不出现 `${}`；PathResolver 花括号兼容分支保留不删（1D 迁移旧系统配置时用）。
- 试运行入参 JSON 解析后即为上下文文档**根**（`$`）。

### 2.3 五个真组件（正式包结构，不要 stub 味）

| 注册名 | 类（org.dromara.databus 下） | 基类 | 物料类型 |
|---|---|---|---|
| httpRequest | component/protocol/HttpRequestComponent | NodeComponent | http |
| condition | component/logical/ConditionComponent | **NodeBooleanComponent** | boolean |
| setValue | component/data/SetValueComponent | NodeComponent | data |
| fieldMap | component/data/FieldMapComponent | NodeComponent | data |
| response | component/data/ResponseComponent | NodeComponent | data |

注解用 `@LiteflowComponent("注册名")`；配置类各带一个，由 `getCmpData(XxxCfg.class)` 注入；组件内统一 `var ctx = this.getContextBean(DatabusContext.class)`。

**data 规格：**

1. **httpRequest** `{method, url, headers?, query?, body?, mappings?}`
   - 用 Spring **RestClient**（Boot 3 自带，零新依赖，@Bean 配置或组件内静态构建）；method 仅 GET/POST；
   - url、headers 的 value、query 的 value、body 内字符串值发送前走 `ctx.resolve`；body 为对象则按 JSON 发送；
   - 响应体解析为 JSON（Jackson），**整体默认存 `$.<dataSpace>.response`**；
   - mappings：`{ "目标字段名": "响应内JSONPath" }`，抽取后平铺到 `$.<dataSpace>.目标字段名`；
   - 边界：非 JSON 响应、超时/证书/代理、URL 编码、文件上传均不做（异常抛出即节点失败，由执行结果展示）。
2. **condition** `{path, op, value?}`，op ∈ `isTrue / isNull / notBlank / eq / ne / gt / ge / lt / le / contains`；读取 path 后按 op 比较；gt/ge/lt/le 按数值比较；其余用 Objects.equals；value 缺省时 isNull/isTrue/notBlank 可用；processBoolean 返回结果。
3. **setValue** `{path, value}`：`ctx.save(path, ctx.resolve(value))`。
4. **fieldMap** `{mappings: [{from, to}]}`：逐条纯路径 read → write 批量搬运（本档平铺字段，不做嵌套递归/动态变量）。
5. **response** `{result, msg, dataPath?}`：写**标准出口** `$.response.result`（resolve 后的布尔）、`$.response.msg`（resolve 后字符串）、`$.response.data`（dataPath 纯路径取值）。这是该组件的特殊职责，不写自己 dataSpace 命名空间。

### 2.4 前端改动

- **cmp-defs**：撤下 formula、boCreate；新增 condition（lfNodeType=boolean）、setValue、fieldMap、response 定义；httpRequest 定义沿用/改造现有 HTTP 物料；图标须经 api.iconify.design 核实存在。
- **useElTreeModel**：
  - 叶子序列化：`id = def.type`（注册名）、`properties.tag = cmpId(dataSpace)`、`properties.data = leaf.data`；NodeIfComponent 槽位的叶子 condition 同样走此规则，type=NodeBooleanComponent；
  - 反解析：`cmpId = properties.tag`，无 tag 时按树内同类型序号补默认名；
  - 新增 `renameDataSpace(oldName, newName)`：扫全树 data 做路径段精确替换，返回影响处数；
  - 默认名生成改为同类型序号（drop 创建叶子处）。
- **CmpProps**：原「组件 ID」输入框改造为「**数据空间**」（值即 tag），叶子不再隐藏；改动提交时若新旧名都非空且不同，调 renameDataSpace 并弹窗提示影响处数。
- **useCanvasController**：条件槽放置护栏（IF/WHILE 槽只接受 lfNodeType=boolean 物料）建议本档做，纯模型层校验 + 提示。
- **mock-presets**：示例全部换血为新组件且 data 配齐（**导入即一键可跑**）：
  - **主示例「本地服务探测」**：httpRequest1（GET `http://localhost:8080/auth/code`，无 headers/body）→ IF(condition1：`{path:"$.httpRequest1.response.code",op:"eq",value:200}`)；真分支 fieldMap1（mappings `[{from:"$.httpRequest1.response.data.captchaEnabled",to:"$.fieldMap1.captchaEnabled"}]`）→ response1（`{result:true,msg:"$.httpRequest1.response.msg",dataPath:"$.fieldMap1"}`）；假分支 response2（`{result:false,msg:"服务未就绪"}`）。
  - **纯本地分支示例**：入参 `{"flag":true}` → condition1 `{path:"$.flag",op:"isTrue"}` → 两分支各 setValue，不依赖任何外部服务。
  - WHEN / CATCH 示例：换新组件叶子，data 配齐。
  - SWITCH / FOR / ITERATOR：换叶子但结构保留，物料标注本档不可执行（条件类型缺失），试运行报出友好错误即可。
- **API**：`previewRun({jsonEl, requestJson})`；PreviewRunVo 扩展为含 executed、steps、contextJson、errorMessage（对齐后端 DatabusExecutionResult）。
- **index.vue**：启用试运行按钮；点击弹「试运行」弹窗（入参 JSON 编辑框，默认 `{}`）；结果弹窗：步骤表（dataSpace/tag、nodeId、成败图标、耗时、错误信息）+ 上下文 JSON 快照（`$.response` 高亮/置顶）；执行失败 200 + success=false 走错误展示；更新过期文案。

### 2.5 后端接口

- DatabusExecutor 新增 `executeByEl(String el, Object requestData)`：`DatabusContext.fromObject(requestData)` → `execute2RespWithEL(el, null, null, ctx)` → 复用现有 buildResult 组装 DatabusExecutionResult。
- PreviewRunBo：`{jsonEl, requestJson}`；PreviewRunVo 在现有字段上加 `executed(Boolean)、success、steps、contextJson、errorMessage`（执行失败也返回，不抛 500）。
- Controller `/databus/editor/preview-run`：generateEL → verify → 解析 requestJson（空则空对象/空文档）→ executeByEl → 回填结果字段。

## 3. 逐文件清单

**后端（ruoyi-databus）**
- [ ] `component/protocol/HttpRequestComponent.java`（+ 配置类 HttpRequestCfg，RestClient 支持）
- [ ] `component/logical/ConditionComponent.java`（+ ConditionCfg，NodeBooleanComponent）
- [ ] `component/data/SetValueComponent.java`（+ SetValueCfg）
- [ ] `component/data/FieldMapComponent.java`（+ FieldMapCfg）
- [ ] `component/data/ResponseComponent.java`（+ ResponseCfg）
- [ ] `service/engine/DatabusExecutor.java`：新增 executeByEl
- [ ] `domain/bo/PreviewRunBo.java`：加 requestJson
- [ ] `domain/vo/PreviewRunVo.java`：加 executed/success/steps/contextJson/errorMessage
- [ ] `controller/DatabusEditorController.java`：preview-run 串真执行

**前端（plus-ui src/views/databus/editor/）**
- [ ] `composables/useElTreeModel.ts`：id 改注册名、tag=dataSpace、renameDataSpace、序号默认名
- [ ] `components/CmpProps.vue`：「数据空间」字段 + 改名联动
- [ ] `composables/useCanvasController.ts`：条件槽 boolean 护栏
- [ ] `config/cmp-defs.ts`：撤 formula/boCreate，加 4 个新物料（httpRequest 已有则改造），图标核实
- [ ] `mock/mock-presets.ts`：示例换血（主示例 /auth/code、纯本地示例、WHEN/CATCH、延后件标注）
- [ ] `api/databus/el/index.ts`（或 editor api 文件）：previewRun
- [ ] `index.vue`：试运行弹窗 + 结果弹窗 + 按钮启用 + 文案

## 4. 实施顺序

1. 后端 5 组件 + cfg（先 condition/setValue/fieldMap/response 纯内存件，再 httpRequest）
2. executeByEl + BO/VO/controller
3. 前端标识规则（序列化/tag/默认名/数据空间面板/改名联动）+ 物料
4. mock-presets 换血
5. API + 试运行弹窗/结果弹窗
6. 静态检查：后端 `mvnw.cmd -pl ruoyi-modules/ruoyi-databus -am compile`；前端 oxlint + vue-tsc
7. 交用户亲自浏览器验证（AI 不跑测试、不开浏览器）

## 5. 用户验证要点（示例预期）

- 导入主示例，入参留空 `{}`，点试运行：httpRequest1 成功（本地后端起着）→ condition1 true → 真分支 → 结果中 `$.response.result = true`，steps 全绿、各步有耗时与 tag。
- 停掉后端再跑：httpRequest1 失败、steps 标红显示异常信息，页面不崩。
- 纯本地示例：入参 `{"flag":true}` / `false` 分别走两分支。
- 改名联动：把 httpRequest1 改成 login，condition1/fieldMap1 的 data 中路径自动变为 `$.login.response...`，弹窗提示处数。

## 6. 下一档（1D 及以后）

forCmp/switchCmp/iteratorCmp 条件件；JSON Schema 动态参数表单；引用选择器；公式引擎选型（Aviator 等）；BPM connector + boCreate/processStart；旧组件迁移（含 ${} 配置兼容路径）；落库/DB 规则源；议题一遗留：删边重连可并行。
