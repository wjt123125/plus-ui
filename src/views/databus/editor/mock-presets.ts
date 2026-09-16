/**
 * 画布示例数据。
 *
 * 每个示例返回 CmpProperty 树，由 useElTreeModel.loadFromCmpProperty 解析为
 * ElNode 模型树，再投影为画布平级节点图；坐标交给 dagre 自动排列。
 *
 * 命名约定：key 用「算子-特征」小写中划线；name 用短语；desc 写清测试点。
 *
 * ⚠️ 所有 leaf 的 id 必须以已注册的业务组件 type 开头（httpRequest_ / formula_ / boCreate_），
 * 否则 resolveDefByCmpId 无法解析，会 fallback 成灰色 #909399。
 */
import type { CmpProperty } from '@/api/databus/el/types';

export interface MockPreset {
  key: string;
  name: string;
  desc: string;
  build: () => CmpProperty;
}

/** 构造业务叶子节点（cmpId 即 LiteFlow nodeId，type 统一 NodeComponent）
 *  prefix 必须是已注册的 CmpDef.type（httpRequest / formula / boCreate），
 *  否则 resolveDefByCmpId 会 fallback 成灰色无样式。 */
function leaf(prefix: string, name: string): CmpProperty {
  return { id: `${prefix}_${name}`, type: 'NodeComponent' };
}

export const MOCK_PRESETS: MockPreset[] = [
  // ── 串行 ──
  {
    key: 'serial-all',
    name: '串行 THEN',
    desc: 'Http→公式→BO，验证顺序边首尾串联',
    build: () => ({
      type: 'THEN',
      children: [
        leaf('httpRequest', 'demo'),
        leaf('formula', 'demo'),
        leaf('boCreate', 'demo')
      ]
    })
  },
  {
    key: 'then-empty',
    name: '空 THEN 占位',
    desc: 'THEN 无 children，验证 placeholder 占位 + start 连边',
    build: () => ({ type: 'THEN', children: [] })
  },

  // ── 并行 ──
  {
    key: 'when-parallel',
    name: '并行 WHEN',
    desc: '三路扇出扇入，验证圆形网关 + junction 多入边',
    build: () => ({
      type: 'WHEN',
      children: [
        leaf('httpRequest', 'parallelA'),
        leaf('formula', 'parallelB'),
        leaf('boCreate', 'parallelC')
      ]
    })
  },

  // ── 条件 ──
  {
    key: 'if-branch',
    name: '条件 IF 双分支',
    desc: 'IF(cond) 真分支公式 / 假分支 BO，验证菱形网关 + 两 outlet handle',
    build: () => ({
      type: 'IF',
      condition: leaf('formula', 'ifCond'),
      children: [leaf('formula', 'ifTrue'), leaf('boCreate', 'ifFalse')]
    })
  },
  {
    key: 'if-empty-false',
    name: 'IF 空假分支',
    desc: '只有真分支，假分支用 placeholder 占位，验证空槽渲染',
    build: () => ({
      type: 'IF',
      condition: leaf('formula', 'ifCond'),
      children: [leaf('formula', 'ifTrue')]
    })
  },

  // ── 选择 ──
  {
    key: 'switch-multi',
    name: '选择 SWITCH 三 case',
    desc: 'SWITCH(cond) 三个 case 扇出，验证多 outlet handle + 多入 junction',
    build: () => ({
      type: 'SWITCH',
      condition: leaf('formula', 'switchCond'),
      children: [
        leaf('httpRequest', 'case1'),
        leaf('formula', 'case2'),
        leaf('boCreate', 'case3')
      ]
    })
  },

  // ── 循环 ──
  {
    key: 'for-loop',
    name: 'FOR 循环',
    desc: 'FOR(cond) 循环体，验证循环网关 + DO 出口（不画回边）',
    build: () => ({
      type: 'FOR',
      condition: leaf('formula', 'forCond'),
      children: [leaf('boCreate', 'forBody')]
    })
  },
  {
    key: 'while-loop',
    name: 'WHILE 循环',
    desc: 'WHILE(cond) 条件循环，验证循环网关',
    build: () => ({
      type: 'WHILE',
      condition: leaf('formula', 'whileCond'),
      children: [leaf('boCreate', 'whileBody')]
    })
  },
  {
    key: 'iterator-loop',
    name: 'ITERATOR 迭代',
    desc: 'ITERATOR(cond) 迭代循环，验证迭代网关',
    build: () => ({
      type: 'ITERATOR',
      condition: leaf('formula', 'iterCond'),
      children: [leaf('boCreate', 'iterBody')]
    })
  },

  // ── 异常 ──
  {
    key: 'catch-flow',
    name: 'CATCH 异常捕获',
    desc: 'CATCH 主体 + 异常处理两路，验证异常网关 + 两 outlet',
    build: () => ({
      type: 'CATCH',
      children: [leaf('httpRequest', 'tryBody'), leaf('boCreate', 'catchBody')]
    })
  },
  {
    key: 'catch-empty',
    name: 'CATCH 空异常槽',
    desc: '只有主体，异常槽 placeholder 占位',
    build: () => ({
      type: 'CATCH',
      children: [leaf('httpRequest', 'tryBody')]
    })
  },

  // ── 逻辑 ──
  {
    key: 'and-logic',
    name: 'AND 与逻辑',
    desc: 'AND 两路 + 符号，验证圆形网关 + 标签',
    build: () => ({
      type: 'AND',
      children: [leaf('formula', 'andLeft'), leaf('formula', 'andRight')]
    })
  },
  {
    key: 'or-logic',
    name: 'OR 或逻辑',
    desc: 'OR 两路 × 符号，验证圆形网关',
    build: () => ({
      type: 'OR',
      children: [leaf('formula', 'orLeft'), leaf('formula', 'orRight')]
    })
  },
  {
    key: 'not-logic',
    name: 'NOT 非逻辑',
    desc: 'NOT 单路 ¬ 符号，验证单 outlet 网关',
    build: () => ({
      type: 'NOT',
      children: [leaf('formula', 'notCond')]
    })
  },

  // ── 子流程 ──
  {
    key: 'chain-ref',
    name: 'CHAIN 子流程引用',
    desc: 'THEN 内嵌子链引用 subChain_demo，验证 NodeComponent 作为子项被 LiteFlow 自动解析为 chain',
    build: () => ({
      type: 'THEN',
      children: [
        { id: 'boCreate_subChain_demo', type: 'NodeComponent', properties: { tag: 'subChain_demo' } }
      ]
    })
  },

  // ── 嵌套综合 ──
  {
    key: 'nested-complex',
    name: '嵌套综合',
    desc: 'THEN(Http, IF(cond, [真分支, 假分支]), WHEN(并行两路))，验证多层嵌套投影',
    build: () => ({
      type: 'THEN',
      children: [
        leaf('httpRequest', 'main'),
        {
          type: 'IF',
          condition: leaf('formula', 'ifCond'),
          children: [leaf('formula', 'ifTrue'), leaf('boCreate', 'ifFalse')]
        },
        {
          type: 'WHEN',
          children: [leaf('httpRequest', 'parallelA'), leaf('formula', 'parallelB')]
        }
      ]
    })
  },
  {
    key: 'nested-catch-in-then',
    name: 'THEN 内嵌 CATCH',
    desc: 'THEN(Http, CATCH(try, catch), BO)，验证异常网关在串行链中的连接',
    build: () => ({
      type: 'THEN',
      children: [
        leaf('httpRequest', 'main'),
        {
          type: 'CATCH',
          children: [leaf('httpRequest', 'tryBody'), leaf('boCreate', 'catchBody')]
        },
        leaf('boCreate', 'tail')
      ]
    })
  }
];

export function getMockPreset(key: string): MockPreset | undefined {
  return MOCK_PRESETS.find((preset) => preset.key === key);
}
