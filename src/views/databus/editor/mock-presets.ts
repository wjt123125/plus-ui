/**
 * 画布示例数据。
 *
 * 每个示例返回 CmpProperty 树，由 useElTreeModel.loadFromCmpProperty 解析为
 * ElNode 模型树，再投影为画布平级节点图；坐标交给 dagre 自动排列。
 *
 * 标识规则（2026-09-16 修订）：
 * - leaf.id 是组件注册名（httpRequest/condition/setValue/fieldMap/response，可重复）
 * - leaf.properties.tag 是数据空间名（httpRequest1、condition1，画布唯一）
 * - 布尔条件件 type 为 NodeBooleanComponent，其余业务件为 NodeComponent
 *
 * 可试运行性：有入参依赖的示例在 inputJson 提供入参 JSON，打开试运行弹窗时自动预填，
 * 无需手敲；标注「结构展示」的示例含本档不可执行的算子
 * （SWITCH/FOR/ITERATOR/AND/OR/NOT/CHAIN），仅用于验证画布投影。
 */
import type { CmpProperty } from '@/api/databus/el/types';

export interface MockPreset {
  key: string;
  name: string;
  desc: string;
  /** 示例入参 JSON 字符串，试运行弹窗打开时预填 requestJson；无入参依赖的示例不填 */
  inputJson?: string;
  build: () => CmpProperty;
}

/**
 * 构造业务叶子。
 * @param code      组件注册名（CmpProperty.id）
 * @param dataSpace 数据空间名（properties.tag），如 httpRequest1
 * @param cfg       组件配置（对象自动 JSON.stringify；字符串原样放入 data）
 * @param asBoolean 是否为布尔条件件（NodeBooleanComponent）
 */
function leaf(code: string, dataSpace: string, cfg?: unknown, asBoolean = false): CmpProperty {
  const node: CmpProperty = {
    id: code,
    type: asBoolean ? 'NodeBooleanComponent' : 'NodeComponent',
    properties: { tag: dataSpace }
  };
  if (cfg !== undefined) {
    node.properties!.data = typeof cfg === 'string' ? cfg : JSON.stringify(cfg);
  }
  return node;
}

/** IF 双分支包一层：真分支多节点时用 THEN 包裹 */
function thenWrap(...children: CmpProperty[]): CmpProperty {
  return { type: 'THEN', children };
}

export const MOCK_PRESETS: MockPreset[] = [
  // ── 1C 试运行主示例 ──
  {
    key: 'preview-http-if',
    name: '本地服务探测（试运行主示例）',
    desc: '调本机 /auth/code，code=200 则映射验证码开关并返回成功，否则返回未就绪',
    build: () => ({
      type: 'THEN',
      children: [
        leaf('httpRequest', 'httpRequest1', { method: 'GET', url: 'http://localhost:8080/auth/code' }),
        {
          type: 'IF',
          condition: leaf(
            'condition',
            'condition1',
            { path: '$.httpRequest1.response.code', op: 'eq', value: 200 },
            true
          ),
          children: [
            thenWrap(
              leaf('fieldMap', 'fieldMap1', {
                mappings: [
                  {
                    from: '$.httpRequest1.response.data.captchaEnabled',
                    to: '$.fieldMap1.captchaEnabled'
                  }
                ]
              }),
              leaf('response', 'response1', {
                result: true,
                msg: '$.httpRequest1.response.msg',
                dataPath: '$.fieldMap1'
              })
            ),
            leaf('response', 'response2', { result: false, msg: '服务未就绪' })
          ]
        }
      ]
    })
  },

  // ── BPM 业务主线（需 BPM 环境可试运行） ──
  // 顺序锁定：会话 → 启流程 → 建 BO → 完任务
  // 依据旧系统 ProcessCreateProcessor.save("result.processInstanceId") 在前、
  //       BoCreateProcessor 的 method=create 必须 bindId 指向流程实例 ID 在后
  // （BO 需绑定到已存在的流程实例，bindId 必须是 $.processStart1.processInstanceId 动态引用）
  {
    key: 'bpm-flow',
    name: 'BPM 全链路（需 BPM 环境）',
    desc: '调 BPM 端总线 app 四件套：会话→启流程→建BO(绑定流程实例)→完任务',
    inputJson: '{"request":{"password":"mlhg2004.3401","code":"D001","boList":[{"BO_FIELD_TEXT":"测试","BO_FIELD_USER":"张三","BO_FIELD_NUM":123456}]}}',
    build: () => ({
      type: 'THEN',
      children: [
        leaf('sessionCreate', 'sessionCreate1', {
          connectionId: 'bpm-default',
          userName: 'admin',
          password: '$.request.password'
        }),
        leaf('processStart', 'processStart1', {
          connectionId: 'bpm-default',
          processDefId: 'obj_61a4e68a43e043fa87f89530a503f9ae',
          uid: 'admin',
          title: '申请-${$.request.code}'
        }),
        leaf('boCreate', 'boCreate1', {
          connectionId: 'bpm-default',
          method: 'create',
          // bindId 引用上一步 processStart 产出的流程实例 ID
          // （旧系统 BoCreateProcessor method=create 时 bindId 必填，指向流程实例 ID）
          bindId: '$.processStart1.processInstanceId',
          uid: 'admin',
          boList: [
            {
              boName: 'BO_EU_API_TEST_MAIN',
              sourcePath: '$.request.boList',
              rewrite: { strategy: 'all', path: '$.response.boList' }
            }
          ]
        }),
        leaf('taskComplete', 'taskComplete1', {
          connectionId: 'bpm-default',
          processInstanceId: '$.processStart1.processInstanceId',
          uid: 'admin',
          failOnError: false
        })
      ]
    })
  },
  {
    key: 'local-flag',
    name: '入参开关（纯本地，无外部依赖）',
    desc: '按入参 flag 真假写不同赋值',
    inputJson: '{"flag":true}',
    build: () => ({
      type: 'IF',
      condition: leaf('condition', 'condition1', { path: '$.flag', op: 'isTrue' }, true),
      children: [
        leaf('setValue', 'setValue1', { path: '$.setValue1.out', value: 'flag 为真' }),
        leaf('setValue', 'setValue2', { path: '$.setValue2.out', value: 'flag 为假' })
      ]
    })
  },

  // ── 串行 ──
  {
    key: 'serial-all',
    name: '串行 THEN',
    desc: '请求→赋值→映射→响应四类真组件串联',
    build: () => ({
      type: 'THEN',
      children: [
        leaf('httpRequest', 'httpRequest1', { method: 'GET', url: 'http://localhost:8080/auth/code' }),
        leaf('setValue', 'setValue1', { path: '$.setValue1.note', value: '串行演示' }),
        leaf('fieldMap', 'fieldMap1', {
          mappings: [
            { from: '$.httpRequest1.response.code', to: '$.fieldMap1.code' }
          ]
        }),
        leaf('response', 'response1', {
          result: true,
          msg: '$.httpRequest1.response.msg',
          dataPath: '$.fieldMap1'
        })
      ]
    })
  },
  {
    key: 'then-empty',
    name: '空 THEN 占位',
    desc: 'THEN 无 children，验证 placeholder 占位 + start 连边（结构展示）',
    build: () => ({ type: 'THEN', children: [] })
  },

  // ── 并行 ──
  {
    key: 'when-parallel',
    name: '并行 WHEN',
    desc: '三路赋值并行扇出扇入，验证圆形网关 + junction 多入边',
    build: () => ({
      type: 'WHEN',
      children: [
        leaf('setValue', 'setValue1', { path: '$.setValue1.out', value: '并行 A' }),
        leaf('setValue', 'setValue2', { path: '$.setValue2.out', value: '并行 B' }),
        leaf('setValue', 'setValue3', { path: '$.setValue3.out', value: '并行 C' })
      ]
    })
  },

  // ── 条件 ──
  {
    key: 'if-branch',
    name: '条件 IF 双分支',
    desc: '按入参 code 是否等于 200 走不同赋值',
    inputJson: '{"code":200}',
    build: () => ({
      type: 'IF',
      condition: leaf(
        'condition',
        'condition1',
        { path: '$.code', op: 'eq', value: 200 },
        true
      ),
      children: [
        leaf('setValue', 'setValue1', { path: '$.setValue1.result', value: 'code 命中' }),
        leaf('setValue', 'setValue2', { path: '$.setValue2.result', value: 'code 未命中' })
      ]
    })
  },
  {
    key: 'if-empty-false',
    name: 'IF 空假分支',
    desc: '只有真分支，假分支用 placeholder 占位',
    inputJson: '{"flag":true}',
    build: () => ({
      type: 'IF',
      condition: leaf('condition', 'condition1', { path: '$.flag', op: 'isTrue' }, true),
      children: [
        leaf('setValue', 'setValue1', { path: '$.setValue1.out', value: '真分支执行' })
      ]
    })
  },

  // ── 选择（本档不可试运行，结构展示） ──
  {
    key: 'switch-multi',
    name: '选择 SWITCH 三 case',
    desc: 'SWITCH 条件件本档暂不支持，仅验证多 outlet 菱形 + junction（结构展示）',
    build: () => ({
      type: 'SWITCH',
      condition: leaf('setValue', 'setValue0', { path: '$.setValue0.switchOn', value: '占位' }),
      children: [
        leaf('setValue', 'setValue1', { path: '$.setValue1.out', value: 'case1' }),
        leaf('setValue', 'setValue2', { path: '$.setValue2.out', value: 'case2' }),
        leaf('setValue', 'setValue3', { path: '$.setValue3.out', value: 'case3' })
      ]
    })
  },

  // ── 循环 ──
  {
    key: 'for-loop',
    name: 'FOR 循环',
    desc: 'FOR 条件件本档暂不支持，仅验证循环网关 + DO 出口（结构展示）',
    build: () => ({
      type: 'FOR',
      condition: leaf('setValue', 'setValue0', { path: '$.setValue0.for', value: '占位' }),
      children: [
        leaf('setValue', 'setValue1', { path: '$.setValue1.out', value: '循环体' })
      ]
    })
  },
  {
    key: 'while-loop',
    name: 'WHILE 循环（零次执行安全示例）',
    desc: '条件为假时循环体一次不执行；flag=true 会死循环请勿试运行',
    inputJson: '{"flag":false}',
    build: () => ({
      type: 'WHILE',
      condition: leaf('condition', 'condition1', { path: '$.flag', op: 'isTrue' }, true),
      children: [
        leaf('setValue', 'setValue1', { path: '$.setValue1.out', value: '循环体执行' })
      ]
    })
  },
  {
    key: 'iterator-loop',
    name: 'ITERATOR 迭代',
    desc: 'ITERATOR 条件件本档暂不支持，仅验证迭代网关（结构展示）',
    build: () => ({
      type: 'ITERATOR',
      condition: leaf('setValue', 'setValue0', { path: '$.setValue0.iter', value: '占位' }),
      children: [
        leaf('setValue', 'setValue1', { path: '$.setValue1.out', value: '迭代体' })
      ]
    })
  },

  // ── 异常 ──
  {
    key: 'catch-flow',
    name: 'CATCH 异常捕获（真触发异常分支）',
    desc: '请求一个不存在的本地端口触发连接异常，由响应组件兜底',
    build: () => ({
      type: 'CATCH',
      children: [
        leaf('httpRequest', 'httpRequest1', {
          method: 'GET',
          url: 'http://127.0.0.1:9999/no-such-service'
        }),
        leaf('response', 'response1', { result: false, msg: '下游不可用，已兜底' })
      ]
    })
  },
  {
    key: 'catch-empty',
    name: 'CATCH 空异常槽',
    desc: '只有主体（正常赋值，不抛异常），异常槽 placeholder 占位',
    build: () => ({
      type: 'CATCH',
      children: [
        leaf('setValue', 'setValue1', { path: '$.setValue1.out', value: '正常执行' })
      ]
    })
  },

  // ── 逻辑（布尔编排需配合 IF 使用，本档仅结构展示） ──
  {
    key: 'and-logic',
    name: 'AND 与逻辑',
    desc: 'AND 两个布尔条件件，建议入参 {"a":true,"b":true}；通常嵌在 IF 条件位使用（结构展示）',
    build: () => ({
      type: 'AND',
      children: [
        leaf('condition', 'condition1', { path: '$.a', op: 'isTrue' }, true),
        leaf('condition', 'condition2', { path: '$.b', op: 'isTrue' }, true)
      ]
    })
  },
  {
    key: 'or-logic',
    name: 'OR 或逻辑',
    desc: 'OR 两个布尔条件件，建议入参 {"a":false,"b":true}（结构展示）',
    build: () => ({
      type: 'OR',
      children: [
        leaf('condition', 'condition1', { path: '$.a', op: 'isTrue' }, true),
        leaf('condition', 'condition2', { path: '$.b', op: 'isTrue' }, true)
      ]
    })
  },
  {
    key: 'not-logic',
    name: 'NOT 非逻辑',
    desc: 'NOT 对布尔条件件取反，建议入参 {"flag":false}（结构展示）',
    build: () => ({
      type: 'NOT',
      children: [
        leaf('condition', 'condition1', { path: '$.flag', op: 'isTrue' }, true)
      ]
    })
  },

  // ── 子流程 ──
  {
    key: 'chain-ref',
    name: 'CHAIN 子流程引用',
    desc: '引用子链 subChain_demo（子链需在 chainMap 中存在），本档不可试运行（结构展示）',
    build: () => ({
      type: 'THEN',
      children: [
        { id: 'subChain_demo', type: 'NodeComponent', properties: { tag: 'subChain_demo' } }
      ]
    })
  },

  // ── 嵌套综合 ──
  {
    key: 'nested-complex',
    name: '嵌套综合',
    desc: 'THEN(赋值, IF(flag 双分支), WHEN(并行两路))',
    inputJson: '{"flag":true}',
    build: () => ({
      type: 'THEN',
      children: [
        leaf('setValue', 'setValue0', { path: '$.setValue0.out', value: '串行头' }),
        {
          type: 'IF',
          condition: leaf('condition', 'condition1', { path: '$.flag', op: 'isTrue' }, true),
          children: [
            leaf('setValue', 'setValue1', { path: '$.setValue1.out', value: 'IF 真' }),
            leaf('setValue', 'setValue2', { path: '$.setValue2.out', value: 'IF 假' })
          ]
        },
        {
          type: 'WHEN',
          children: [
            leaf('setValue', 'setValue3', { path: '$.setValue3.out', value: '并行 A' }),
            leaf('setValue', 'setValue4', { path: '$.setValue4.out', value: '并行 B' })
          ]
        }
      ]
    })
  },
  {
    key: 'nested-catch-in-then',
    name: 'THEN 内嵌 CATCH（正常路径）',
    desc: 'THEN(赋值, CATCH(正常赋值, 兜底响应), 响应)，异常槽不触发',
    build: () => ({
      type: 'THEN',
      children: [
        leaf('setValue', 'setValue1', { path: '$.setValue1.out', value: '串行头' }),
        {
          type: 'CATCH',
          children: [
            leaf('setValue', 'setValue2', { path: '$.setValue2.out', value: 'try 主体' }),
            leaf('response', 'response1', { result: false, msg: '进入异常处理' })
          ]
        },
        leaf('response', 'response2', { result: true, msg: '主流程完成' })
      ]
    })
  }
];

export function getMockPreset(key: string): MockPreset | undefined {
  return MOCK_PRESETS.find((preset) => preset.key === key);
}
