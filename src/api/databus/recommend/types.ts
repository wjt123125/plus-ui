/**
 * 组件插入推荐接口类型。
 * 后端模块：ruoyi-databus，DatabusEditorController（/databus/editor/recommend）。
 */

/** GET /recommend 返回项：后端融合「种子经验 + 真账计数」后的分数 */
export interface CmpRecommendVo {
  /** 组件 def.type */
  type: string;
  /** 融合分 0-100，降序 */
  score: number;
}

/** GET /recommend 入参 */
export interface CmpRecommendQuery {
  /** 插入场景（prepend/append/replace/insertEdge） */
  mode: string;
  /** 前置组件 def.type；无锚点不传 */
  anchorType?: string | null;
  /** 需排除类型（已存在 singleton、replace 自身） */
  excludedTypes?: string[];
}

/** POST /recommend/pick 入参：一次真实选择 */
export interface CmpPickBo {
  mode: string;
  anchorType?: string | null;
  pickedType: string;
}
