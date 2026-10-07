/**
 * 最近访问组件（localStorage，最多 10 个，按访问时间倒序、同码去重）。
 * 数据只来自台账合流行，不做任何后端请求；组件被删除后由消费侧按 rows 自行剔除。
 */
import { computed } from 'vue';
import { usePersisted } from '../../../workbench/composables/usePersisted';
import type { ComponentRegistryRow } from '../../model/registry';
import type { RecentComponent } from '../workbench.types';

const STORAGE_KEY = 'databus.cmpwb.recent';
const MAX_RECENT = 10;

export function useRecentComponents() {
  const recent = usePersisted<RecentComponent[]>(STORAGE_KEY, []);

  /** 最近访问按时间倒序（防御乱序数据） */
  const recentOrdered = computed(() => recent.value.toSorted((a, b) => b.time - a.time));

  function touch(row: Pick<ComponentRegistryRow, 'code' | 'name' | 'source'>) {
    const next = recent.value.filter((item) => item.code !== row.code);
    next.unshift({ code: row.code, name: row.name, source: row.source, time: Date.now() });
    recent.value = next.slice(0, MAX_RECENT);
  }

  function remove(code: string) {
    if (!recent.value.some((item) => item.code === code)) {
      return;
    }
    recent.value = recent.value.filter((item) => item.code !== code);
  }

  return { recentOrdered, touch, remove };
}
