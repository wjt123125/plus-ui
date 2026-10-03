/**
 * CmpProps 属性面板共享常量：条件槽口径、布尔算子基数、数据空间名校验。
 * 从 CmpProps.vue 原样搬迁，行为零变化。
 */
import { CMP_DEFS } from '../../../cmp-defs';

/**
 * 各算子条件槽可挂的条件物料（与 useCanvasController 的 CONDITION_SLOT_RULES 同源口径）。
 * IF/WHILE 挂布尔条件件；FOR/ITERATOR/SWITCH 各挂专属控制组件。
 */
export const CONDITION_SLOT_TYPES: Record<string, string[]> = {
  IF: CMP_DEFS.filter((d) => d.lfNodeType === 'NodeBooleanComponent').map((d) => d.type),
  WHILE: CMP_DEFS.filter((d) => d.lfNodeType === 'NodeBooleanComponent').map((d) => d.type),
  FOR: ['forLoop'],
  ITERATOR: ['iteratorLoop'],
  SWITCH: ['switchRoute']
};

/** 条件件选择框下方的说明文案 */
export const CONDITION_SLOT_HINTS: Record<string, string> = {
  IF: '条件组件为布尔组件，运行时返回真/假决定走哪个分支',
  WHILE: '条件组件为布尔组件，运行时返回真/假决定是否继续循环',
  FOR: '计数组件返回循环次数；循环体内用 $i 引用当前轮下标（0 基）',
  ITERATOR: '迭代组件返回数组/集合的迭代器；体内用 $i 引用当前轮下标（0 基）',
  SWITCH: '路由组件读取判断值，按 cases 配置匹配 case 名跳转；分支名在上方维护'
};

/** 数据空间名：字母开头，字母数字下划线 */
export const SPACE_NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

/** 布尔算子操作数槽位基数：NOT 唯一操作数，AND/OR 至少两个 */
export const BOOLEAN_OP_ARITY: Record<string, number> = { AND: 2, OR: 2, NOT: 1 };
