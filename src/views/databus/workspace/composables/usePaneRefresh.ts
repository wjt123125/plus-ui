/**
 * 工作区 pane 统一刷新入口（2026-11-17）。
 * tab 面板是 v-show 常驻挂载，只挂载取一次数据的话，外部变更后内容会一直停在旧值。
 * 本 composable 把三件事收成一套：挂载首取、令牌变化重取（wb.refresh 驱动的 `refreshToken` prop）、
 * 可选轮询（Monitor / Alert 这类看实时数据的面板）。
 * 约定：令牌 0 表示从未刷新，首屏由挂载触发，避免首帧重复取数。
 */
import { onBeforeUnmount, onMounted, watch } from 'vue';

/** 令牌来源：pane 从宿主收下的 `refreshToken` prop */
export interface PaneRefreshTokenProps {
  refreshToken?: number;
}

export interface PaneRefreshOptions {
  /** 轮询间隔（毫秒）；不传则不轮询 */
  pollMs?: number;
  /** 轮询开关（如 tab 是否激活），每跳都判一次；默认常开 */
  enabled?: () => boolean;
  /** 挂载即取，默认 true；已有 immediate watch 的 pane 传 false 避免重复取数 */
  immediate?: boolean;
}

export function usePaneRefresh(
  props: PaneRefreshTokenProps,
  reload: () => unknown,
  options: PaneRefreshOptions = {}
) {
  const { pollMs, enabled = () => true, immediate = true } = options;
  let timer: ReturnType<typeof setInterval> | null = null;
  let busy = false;

  /** 重取入口：轮询与令牌共用，请求未结束时丢弃这一跳，避免慢接口堆叠 */
  async function run(): Promise<void> {
    if (busy) {
      return;
    }
    busy = true;
    try {
      await reload();
    } finally {
      busy = false;
    }
  }

  if (immediate) {
    onMounted(run);
  }

  watch(
    () => props.refreshToken,
    (token, prev) => {
      // 0 是初始值（挂载已取过），只有真正自增才重取
      if (token && token !== prev) {
        void run();
      }
    }
  );

  if (pollMs && pollMs > 0) {
    onMounted(() => {
      timer = setInterval(() => {
        if (enabled()) {
          void run();
        }
      }, pollMs);
    });
    onBeforeUnmount(() => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    });
  }
}