/**
 * 链路选项数据源（listChain）——全 databus 共享的单一数据通道。
 *
 * 之前 CHAIN 引用选择器、手动执行弹窗、执行记录筛选、编辑器链路切换器四处各自
 * listChain({pageNum:1,pageSize:...})，参数/缓存/失败态各写一套。本 composable：
 *  - 按查询条件做模块级缓存（同条件会话内只拉一次）与请求单飞；
 *  - 同条件的多个组件共享同一份响应式 rows/loading/failed；
 *  - ensure(force) 支持切换器这种「每次展开要最新」的场景强制重拉并回写缓存。
 *
 * 注意 isTemplate 语义：'0' 普通链 / '1' 精选模板 / 不传=不过滤（全量）。
 */
import { computed, reactive, type ComputedRef } from 'vue';
import { listChain } from '@/api/databus/chain';
import type { DatabusChainQuery, DatabusChainVo } from '@/api/databus/chain/types';

interface ChainCacheEntry {
  rows: DatabusChainVo[];
  loading: boolean;
  failed: boolean;
  pending: Promise<DatabusChainVo[]> | null;
}

/** 缓存键=归一化查询条件（pageNum/pageSize 也在内，足够区分） */
const cache = new Map<string, ChainCacheEntry>();

function entryOf(query: DatabusChainQuery): ChainCacheEntry {
  const key = JSON.stringify(query);
  let entry = cache.get(key);
  if (!entry) {
    entry = reactive<ChainCacheEntry>({ rows: [], loading: false, failed: false, pending: null });
    cache.set(key, entry);
  }
  return entry;
}

async function fetchEntry(query: DatabusChainQuery, force: boolean, entry: ChainCacheEntry) {
  if (entry.pending && !force) return entry.pending;
  if (force) entry.pending = null;
  if (!entry.pending) {
    entry.loading = true;
    entry.failed = false;
    entry.pending = listChain(query)
      .then((res) => {
        entry.rows = res.data?.rows ?? [];
        return entry.rows;
      })
      .catch((err) => {
        // 失败放行单飞：下次 ensure 可重新发起
        entry.pending = null;
        entry.failed = true;
        throw err;
      })
      .finally(() => {
        entry.loading = false;
      });
  }
  return entry.pending;
}

export interface UseChainOptionsReturn {
  chains: ComputedRef<DatabusChainVo[]>;
  loading: ComputedRef<boolean>;
  failed: ComputedRef<boolean>;
  /** 拉取选项；force=true 跳过缓存强制刷新并回写缓存 */
  ensure: (force?: boolean) => Promise<DatabusChainVo[]>;
}

/**
 * @param getQuery 返回查询条件的函数（响应式：条件变化时自动指向对应缓存条目）
 */
export function useChainOptions(getQuery: () => DatabusChainQuery): UseChainOptionsReturn {
  const entry = computed(() => entryOf(getQuery()));
  return {
    chains: computed(() => entry.value.rows),
    loading: computed(() => entry.value.loading),
    failed: computed(() => entry.value.failed),
    ensure: (force = false) => fetchEntry(getQuery(), force, entry.value)
  };
}
