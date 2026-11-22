/**
 * 上下文操作气泡的锚点工具：选中文字浮层与资源 hover 浮层共用同一套定位算法。
 *
 * 锚点只保留数值矩形，不把 DOMRect / Range 放进响应式代理；
 * 定位规则固定为「贴锚点上方，放不下翻到下方，左右夹在视口内」。
 */

/** 视口坐标系下的锚点矩形 */
export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

/** 气泡与锚点之间的间距 */
const BUBBLE_GAP = 8;

/** 元素当前视口矩形；元素脱离文档时返回 null */
export function anchorRectOf(el: Element | null | undefined): AnchorRect | null {
  if (!el || !el.isConnected) {
    return null;
  }
  const rect = el.getBoundingClientRect();
  if (!rect.width && !rect.height) {
    return null;
  }
  return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height };
}

/**
 * 计算气泡的 fixed 定位。
 *
 * @param el   气泡根元素（用来读真实宽高；尚未渲染时按两图标气泡估算）
 * @param rect 锚点矩形
 */
export function bubblePosition(el: HTMLElement | null | undefined, rect: AnchorRect): Record<string, string> {
  const width = el?.offsetWidth || 68;
  const height = el?.offsetHeight || 36;
  let top = rect.top - height - BUBBLE_GAP;
  if (top < BUBBLE_GAP) {
    top = Math.min(rect.bottom + BUBBLE_GAP, window.innerHeight - height - BUBBLE_GAP);
  }
  const left = Math.max(BUBBLE_GAP, Math.min(rect.left, window.innerWidth - width - BUBBLE_GAP));
  return { top: `${top}px`, left: `${left}px` };
}
