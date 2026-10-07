import { computed, ref } from 'vue';
import { listComponentDomains, listComponentGroups } from '@/api/databus/component';
import type { ComponentDomainOption } from '@/api/databus/component/types';
import { FALLBACK_GROUPS, paletteGroups } from '../cmp-defs';

/**
 * 分组/业务域字典会话级缓存：编辑器与组件台账共用，整个会话只拉一次。
 * 范式与 useComponentOptions 一致——模块级 Promise（非组件级 ref）保证多个面板同时挂载
 * 只发一个请求；失败不缓存结果，允许下次调用重试。
 *
 * 与 useComponentOptions 无依赖关系，调用侧可 Promise.all 并行拉取。
 *
 * 失败时不做本地兜底数据填充：分组退回 FALLBACK_GROUPS（编译期七组，面板不白屏），
 * 业务域为空（选择器/台账树退化为单层），error=true 由消费侧显性露出重试入口。
 */
let pending: Promise<void> | null = null;
const domains = ref<ComponentDomainOption[]>([]);
const loaded = ref(false);
const error = ref(false);

/**
 * 分组字典。直接复用 cmp-defs 的 paletteGroups（同一个 shallowRef）：
 * 推荐引擎的同步 tie-break 与台账树读的是同一份当前值，不存在两处失同步。
 */
const groups = paletteGroups;

/** 兜底域 key（domain 为空的件归此域）；字典未加载时回退 'common' */
const defaultDomainKey = computed(() => domains.value.find((d) => d.isDefault)?.key ?? 'common');

/** 分组 key → 中文标题（groupLabel 的第一级回退源） */
const groupLabelMap = computed<Map<string, string>>(
  () => new Map(groups.value.map((g) => [g.key, g.label]))
);

async function fetchTaxonomy(): Promise<void> {
  if (!pending) {
    pending = Promise.all([listComponentGroups(), listComponentDomains()])
      .then(([groupRes, domainRes]) => {
        const groupList = groupRes.data ?? [];
        // 空数组视为字典不可用（而非「后端真的删空了七组」），保留编译期兜底
        groups.value = groupList.length > 0 ? groupList : [...FALLBACK_GROUPS];
        domains.value = domainRes.data ?? [];
        loaded.value = true;
        error.value = false;
      })
      .catch((err) => {
        // 失败释放缓存，下次可重试；不塞本地数据
        pending = null;
        error.value = true;
        throw err;
      });
  }
  return pending;
}

/**
 * 分组与业务域字典。用法：const { groups, domains, defaultDomainKey, ensureTaxonomy } = useComponentTaxonomy();
 * 挂载时调一次 ensureTaxonomy()，模板直接读 groups/domains（字典未到位时为兜底值）。
 */
export function useComponentTaxonomy() {
  function ensureTaxonomy() {
    return fetchTaxonomy().catch(() => {
      // 分组保持兜底、域为空，error 态供 UI 展示重试入口
    });
  }

  /** 手动重试：清错误态重新拉取（pending 已在失败时释放） */
  function retryTaxonomy() {
    error.value = false;
    return ensureTaxonomy();
  }

  return { groups, domains, loaded, error, defaultDomainKey, groupLabelMap, ensureTaxonomy, retryTaxonomy };
}
