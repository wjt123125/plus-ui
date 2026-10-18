/**
 * 最近访问资源（跨链路/组件，localStorage，零后端，最多 10 个）。
 * 平移自 useRecentComponents 并修「串号」：key 由固定串改为带用户维度
 * `databus.ws.recent:{userId}`，切账号自动隔离（useUserStore 取 id）。
 * 链路存 id、组件存 code（对齐 detail 正本身份）；资源删除后由消费侧按台账剔除。
 */
import { computed } from 'vue';
import { useUserStore } from '@/store/modules/user';
import { usePersisted } from '@/views/databus/workbench/composables/usePersisted';
import type { RecentResource } from '../workbench.types';

const MAX_RECENT = 10;

export function useRecentResources() {
  // 宿主在登录后挂载，此处取到的 userId 已稳定；切账号经重登整页刷新，key 自然切换
  const { userId } = useUserStore();
  const recent = usePersisted<RecentResource[]>(`databus.ws.recent:${userId || 'anon'}`, []);

  /** 最近访问按时间倒序（防御乱序数据） */
  const recentOrdered = computed(() => recent.value.toSorted((a, b) => b.time - a.time));

  /** 记录一次访问（同资源去重后置顶） */
  function touch(item: Omit<RecentResource, 'time'>): void {
    const next = recent.value.filter(
      (r) => !(r.type === item.type && String(r.refId) === String(item.refId))
    );
    next.unshift({ ...item, time: Date.now() });
    recent.value = next.slice(0, MAX_RECENT);
  }

  /** 剔除某资源（资源删除后调用） */
  function remove(type: RecentResource['type'], refId: string | number): void {
    const next = recent.value.filter((r) => !(r.type === type && String(r.refId) === String(refId)));
    if (next.length !== recent.value.length) {
      recent.value = next;
    }
  }

  /** 批量剔除（台账刷新后剔除已不存在的存量项） */
  function prune(alive: (item: RecentResource) => boolean): void {
    const next = recent.value.filter(alive);
    if (next.length !== recent.value.length) {
      recent.value = next;
    }
  }

  return { recentOrdered, touch, remove, prune };
}
