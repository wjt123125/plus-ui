/**
 * CmpProps 属性面板共享常量：条件槽口径、布尔算子基数、数据空间名校验。
 * 从 CmpProps.vue 原样搬迁，行为零变化。
 */
import { CMP_DEFS } from '../../../cmp-defs';

/**
 * 各算子条件槽可挂的条件物料（与 useCanvasController 的 CONDITION_SLOT_RULES 同源口径）。
 * IF/WHILE 挂布尔条件件（实时从 /options 物料查 NodeBooleanComponent）；
 * FOR/ITERATOR/SWITCH 各挂专属控制组件（注册名是画布语法契约，固定）。
 * 物料未加载时 IF/WHILE 候选为空，不做静态兜底；调用方需在响应式上下文里调用
 * （消费侧 computed 已依赖 materialTick，物料到达后自动重算）。
 */
export function getConditionSlotTypes(opType: string): string[] {
  switch (opType) {
    case 'IF':
    case 'WHILE':
      return CMP_DEFS.filter((d) => d.lfNodeType === 'NodeBooleanComponent').map((d) => d.type);
    case 'FOR':
      return ['forLoop'];
    case 'ITERATOR':
      return ['iteratorLoop'];
    case 'SWITCH':
      return ['switchRoute'];
    default:
      return [];
  }
}

/** 条件件选择框下方的说明文案 */
export const CONDITION_SLOT_HINTS: Record<string, string> = {
  IF: '条件组件为布尔组件，运行时返回真/假决定走哪个分支',
  WHILE: '条件组件为布尔组件，运行时返回真/假决定是否继续循环',
  FOR: '计数组件返回循环次数；循环体内用 $i 引用当前轮下标（0 基）',
  ITERATOR: '迭代组件返回数组/集合的迭代器；体内用 $i 取当前轮下标（0 基）',
  SWITCH: '路由组件读取判断值，按 cases 配置匹配 case 名跳转；分支名在上方维护'
};

/** 数据空间名：字母开头，字母数字下划线 */
export const SPACE_NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

/** 布尔算子操作数槽位基数：NOT 唯一操作数，AND/OR 至少两个 */
export const BOOLEAN_OP_ARITY: Record<string, number> = { AND: 2, OR: 2, NOT: 1 };
