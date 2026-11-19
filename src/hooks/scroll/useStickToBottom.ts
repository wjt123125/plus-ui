import { onBeforeUnmount, ref, watch, type Ref } from 'vue';

/** 2px 容差：抵消亚像素滚动位置与整型高度取整 */
const BOTTOM_EPSILON = 2;

/**
 * 贴底跟随：把「内容在长」和「用户想不想跟」拆成两件事。
 *
 * - 只有 following 为真时才写 scrollTop；用户上滑立刻暂停（wheel / touch 早于 scroll，
 *   在惯性开始前就交还控制权，浏览器不会再有被抢回去的感觉）；
 * - 内容变化用 ResizeObserver（视口自身尺寸）加 MutationObserver（DOM 变更）感知，
 *   写滚动统一推迟到 rAF：既避免 ResizeObserver loop 警告，也避免滚动条出现/消失
 *   引起的高度抖动被当成新内容；
 * - 不用「距底距离」判断用户意图：流式时高度一直在涨，那个判断必然误判。
 *
 * @param viewport 滚动容器，需有确定高度且 overflow-y: auto
 */
export function useStickToBottom(viewport: Ref<HTMLElement | null | undefined>) {
  /** 下一次内容变化，是否要把视口带到最新一行 */
  const following = ref(true);
  /** 暂停跟随后内容又有变化：宿主据此提示「有新内容」 */
  const hasNew = ref(false);

  let lastTop = 0;
  let lastHeight = 0;
  let frame = 0;
  let resizeObserver: ResizeObserver | null = null;
  let mutationObserver: MutationObserver | null = null;
  let bound: HTMLElement | null = null;

  const gap = (el: HTMLElement) => el.scrollHeight - el.clientHeight - el.scrollTop;

  /** 有滚动余量才算“能离开底部”；内容不满一屏时本来就在底部，不存在上滑 */
  const isScrollable = (el: HTMLElement) => el.scrollHeight - el.clientHeight > BOTTOM_EPSILON;

  /** 唯一写滚动位置的地方；写完立刻记账，别让这次写入触发的 scroll 事件被当成用户上滑 */
  function write(top: number) {
    const el = viewport.value;
    if (!el) return;
    el.scrollTop = top;
    lastTop = el.scrollTop;
    lastHeight = el.scrollHeight;
  }

  function sync() {
    const el = viewport.value;
    // 收起 / 隐藏时 clientHeight 为 0，此时写 scrollTop 会把阅读位置清零
    if (!el || el.clientHeight === 0) return;
    if (!isScrollable(el)) {
      // 内容不满一屏（或刚被清空）：本来就在底部，顺手纠正掉误判的暂停态
      following.value = true;
      hasNew.value = false;
      lastHeight = el.scrollHeight;
      return;
    }
    if (following.value) {
      write(el.scrollHeight);
      lastHeight = el.scrollHeight;
      return;
    }
    // 只有「内容变高」才算有新内容：折叠块收起是变矮，不该提示有新内容
    if (el.scrollHeight > lastHeight) {
      hasNew.value = true;
    }
    lastHeight = el.scrollHeight;
  }

  /** 一帧最多写一次：逐条日志、逐个 token 都写 scrollTop 会打断布局节奏 */
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      sync();
    });
  }

  function onScroll() {
    const el = viewport.value;
    if (!el) return;
    if (!isScrollable(el)) {
      // 无可滚余量：本来就在底部，滚动位置的任何变化都不是“用户上滑”
      following.value = true;
      hasNew.value = false;
    } else if (el.scrollTop < lastTop - 1) {
      // 往上滚：交还控制权，后续内容再长也不动视口
      following.value = false;
    } else if (!following.value && gap(el) <= BOTTOM_EPSILON) {
      // 自己滚回底部：恢复跟随
      following.value = true;
      hasNew.value = false;
    }
    lastTop = el.scrollTop;
  }

  function onWheel(event: WheelEvent) {
    const el = viewport.value;
    // 内容不满一屏时往上滚什么也不会动，不能据此判定用户要离开底部
    if (event.deltaY < 0 && el && isScrollable(el)) {
      following.value = false;
    }
  }

  let touchY = 0;

  function onTouchStart(event: TouchEvent) {
    touchY = event.touches[0]?.clientY ?? 0;
  }

  function onTouchMove(event: TouchEvent) {
    const y = event.touches[0]?.clientY;
    const el = viewport.value;
    // 手指下移 = 视线往上；同样只在真的能滚时才交还控制权
    if (y !== undefined && y > touchY && el && isScrollable(el)) {
      following.value = false;
    }
    touchY = y ?? touchY;
  }

  /** 暂停跟随：用户主动改变布局（展开折叠块等）时由宿主调用 */
  function pause() {
    following.value = false;
  }

  /**
   * 回到最新。
   * 流式中请用瞬时跳转：平滑动画会被下一批内容反复重定向，反而更抖。
   */
  function toLatest(smooth = false) {
    const el = viewport.value;
    if (!el) return;
    following.value = true;
    hasNew.value = false;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (smooth && !reduceMotion) {
      lastHeight = el.scrollHeight;
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      return;
    }
    write(el.scrollHeight);
  }

  function detach() {
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    resizeObserver?.disconnect();
    resizeObserver = null;
    mutationObserver?.disconnect();
    mutationObserver = null;
    if (!bound) return;
    bound.removeEventListener('scroll', onScroll);
    bound.removeEventListener('wheel', onWheel);
    bound.removeEventListener('touchstart', onTouchStart);
    bound.removeEventListener('touchmove', onTouchMove);
    bound = null;
  }

  function attach(el: HTMLElement) {
    bound = el;
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });

    // 视口自身变高（栏宽变化 → 换行）走 ResizeObserver，内容长高走 MutationObserver
    resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(el);

    mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(el, { childList: true, characterData: true, subtree: true });

    lastTop = el.scrollTop;
    write(el.scrollHeight);
  }

  watch(
    viewport,
    (el) => {
      // 视口换了（挂载 / 卸载）就重建绑定：模板 ref 的赋值时序不受调用方控制
      detach();
      if (el) {
        attach(el);
      }
    },
    { flush: 'post' }
  );

  onBeforeUnmount(detach);

  return { following, hasNew, toLatest, pause };
}
