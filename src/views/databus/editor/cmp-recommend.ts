/**
 * 组件选择弹窗的上下文推荐引擎。
 *
 * 纯函数：输入 PickerMode + 锚点 defType + 已排除类型 → 输出按推荐优先级降序排列的 CmpDef[]。
 * 无外部状态依赖，方便未来扩展更多规则或加单测。
 *
 * ── 规则总览 ─────────────────────────────────────────────
 *
 * 【replace 模式】同类优先：
 *   算子 → 同 group 互转（THEN↔WHEN、IF↔SWITCH、FOR↔WHILE↔ITERATOR），业务 → 业务
 *   跨类型只给低优先级
 *
 * 【append / prepend 模式】锚点上下文加权：
 *   - 锚点是 start → 业务组件优先（链路第一段通常是业务）
 *   - 锚点是业务组件 → 业务 + THEN/WHEN（链式追加）
 *   - 锚点是分支算子(IF/SWITCH) → THEN/WHEN 收束 + 业务
 *   - 锚点是循环算子 → THEN/WHEN + 业务，循环自身降权（循环后接循环罕见）
 *   - 锚点是顺序算子(THEN/WHEN) → 业务组件最高（串行执行的典型模式）
 *   - 锚点是子流程(CHAIN) → 业务 + 算子同权
 *
 * 【insertEdge 模式】最通用：
 *   业务组件 + THEN 最高，分支算子次之
 *
 * ── 如何扩展 ──────────────────────────────────────────────
 *
 * 新增 CmpDef 时：在 score() 里按 group/conditionKind 匹配已有分支即可；
 * 若新组件是全新 group，在 getGroupKind() 里加映射，再在 score() 各分支里补权重。
 */
import { CMP_DEFS, PALETTE_GROUPS, getDef, type CmpDef } from './cmp-defs';
import type { PickerMode } from './composables/useCanvasController';

/** 把 cmp-defs 的 group 归约成推荐逻辑关心的几个大类 */
type GroupKind =
  | 'seq'       // THEN / WHEN —— 顺序类
  | 'branch'    // IF / SWITCH —— 分支类
  | 'loop'      // FOR / WHILE / ITERATOR —— 循环类
  | 'logic'     // CATCH / AND / OR / NOT —— 异常与逻辑
  | 'subflow'   // CHAIN
  | 'flow'      // start / end —— 虚拟
  | 'business'  // 业务组件
  | 'junction'  // 画布投影节点（不应出现在推荐里）
  | 'unknown';

function getGroupKind(def: CmpDef | undefined): GroupKind {
  if (!def) return 'unknown';
  if (def.type === 'junction') return 'junction';
  if (def.virtual) return 'flow';
  if (def.operator) {
    switch (def.group) {
      case 'sequence': return 'seq';
      case 'branch':   return 'branch';
      case 'loop':     return 'loop';
      case 'other':    return 'logic';
      case 'subflow':  return 'subflow';
      default:         return 'unknown';
    }
  }
  return 'business';
}

/**
 * 给单个候选组件打分（0-100）。分数越高越靠前。
 * excludedTypes 里的组件直接返回 -1（被调用方过滤）。
 */
function score(
  def: CmpDef,
  mode: PickerMode,
  anchorKind: GroupKind,
  excluded: Set<string>
): number {
  if (excluded.has(def.type)) return -1;
  // virtual（start/end）在非 replace 场景直接排除
  if (def.virtual && mode !== 'replace') return -1;
  const kind = getGroupKind(def);

  if (mode === 'replace') {
    return scoreReplace(kind, anchorKind);
  }
  if (mode === 'insertEdge') {
    return scoreInsertEdge(kind);
  }
  // append / prepend 共用一套逻辑
  return scoreAppendPrepend(kind, anchorKind);
}

/** replace：同类优先，跨类仅低优先级 */
function scoreReplace(kind: GroupKind, anchorKind: GroupKind): number {
  // 虚拟节点不能作为 replace 目标（excludedTypes 已过滤 start/end 自身）
  if (kind === 'flow' || kind === 'junction') return -1;
  if (kind === anchorKind) return 95;              // 同类互转（THEN↔WHEN、IF↔SWITCH 等）
  // 业务 ↔ 算子之间给低分但不禁止（用户可能确实想换类型）
  if (kind === 'business' || anchorKind === 'business') return 25;
  return 40;                                       // 不同算子大类之间
}

/** append / prepend：按锚点上下文加权 */
function scoreAppendPrepend(kind: GroupKind, anchorKind: GroupKind): number {
  if (kind === 'flow' || kind === 'junction') return -1;
  if (anchorKind === 'flow') {
    // 锚点是 start：链路第一段，业务组件优先
    if (kind === 'business') return 80;
    return 50;
  }
  if (anchorKind === 'business') {
    // 业务后追加：链式追加业务最常见，THEN/WHEN 也常用
    if (kind === 'business') return 75;
    if (kind === 'seq') return 65;
    return 35;
  }
  if (anchorKind === 'seq') {
    // 顺序算子后：接业务最典型
    if (kind === 'business') return 80;
    if (kind === 'seq') return 55;
    return 40;
  }
  if (anchorKind === 'branch') {
    // 分支算子后：THEN/WHEN 收束 + 业务
    if (kind === 'seq') return 80;
    if (kind === 'business') return 70;
    return 40;
  }
  if (anchorKind === 'loop') {
    // 循环算子后：THEN/WHEN + 业务，循环自身降权
    if (kind === 'seq') return 75;
    if (kind === 'business') return 65;
    if (kind === 'loop') return 25;
    return 35;
  }
  if (anchorKind === 'logic') {
    // CATCH/AND/OR/NOT 后：业务 + THEN/WHEN
    if (kind === 'business') return 75;
    if (kind === 'seq') return 60;
    return 35;
  }
  if (anchorKind === 'subflow') {
    // CHAIN 后：业务 + 算子同权
    if (kind === 'business') return 65;
    return 55;
  }
  return 50;
}

/** insertEdge：线上插入最通用 */
function scoreInsertEdge(kind: GroupKind): number {
  if (kind === 'flow' || kind === 'junction') return -1;
  if (kind === 'business') return 75;
  if (kind === 'seq') return 70;
  if (kind === 'branch') return 55;
  return 40;
}

/**
 * 按推荐优先级排序返回（携带 score 供 UI 做推荐分区）。
 *
 * @param mode          弹层场景
 * @param anchorDefType 锚点组件的 def.type（无锚点时传 null）
 * @param excludedTypes 需排除的类型（已存在的 singleton、replace 时的自身）
 * @returns 已排序的 { def, score } 列表（score 降序，0 分也会被过滤掉）
 */
export function getRecommendations(
  mode: PickerMode,
  anchorDefType: string | null,
  excludedTypes: string[] = []
): { def: CmpDef; score: number }[] {
  const excluded = new Set(excludedTypes);
  const anchorKind = getGroupKind(anchorDefType ? getDef(anchorDefType) : undefined);

  const scored = CMP_DEFS
    .map((def) => ({ def, score: score(def, mode, anchorKind, excluded) }))
    .filter((s) => s.score >= 0)
    .toSorted((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // 同分：按 PALETTE_GROUPS 的自然顺序（物料面板分组顺序）
      const aGroupIdx = PALETTE_GROUPS.findIndex((g) => g.key === a.def.group);
      const bGroupIdx = PALETTE_GROUPS.findIndex((g) => g.key === b.def.group);
      return aGroupIdx - bGroupIdx;
    });

  return scored;
}
