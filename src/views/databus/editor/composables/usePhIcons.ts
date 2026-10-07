import { computed, ref } from 'vue';
import { addCollection, type IconifyJSON } from '@iconify/vue';

/**
 * ph（Phosphor）图标全集的离线注入与白名单校验——全项目唯一出口。
 *
 * 背景：`databus_component.icon` 的契约收紧为「仅 ph: 前缀」（refactor §4.2），而 SvgIcon
 * 见 `:` 即走 @iconify/vue；未离线注入 collection 时会运行时联网 api.iconify.design，
 * 内网环境表现为图标空白 + 控制台请求失败。
 *
 * 策略：首次需要时 `await import('@iconify-json/ph/icons.json')` → `addCollection()`。
 * Vite 会把这份 4.5MB JSON 切成独立 chunk，主 bundle 体积不变；组件树/卡片渲染、
 * 图标选择器弹窗、表单白名单校验三处共用同一份 chunk 与同一次注入。
 *
 * 缓存范式与 useComponentOptions / useComponentTaxonomy 一致：模块级 Promise 单飞
 * （多组件同时挂载只加载一次），失败释放 pending 允许下次重试，error 态显性露出。
 */

/** icon 契约前缀 */
export const PH_PREFIX = 'ph:';

let pending: Promise<string[]> | null = null;

/** 全集图标名（不含 ph: 前缀，已按名称排序）；加载成功后有值 */
const phNames = ref<string[]>([]);
const loading = ref(false);
const error = ref(false);

function fetchPhIcons(): Promise<string[]> {
  if (!pending) {
    loading.value = true;
    pending = import('@iconify-json/ph/icons.json')
      .then((mod) => {
        const collection = (mod.default ?? mod) as unknown as IconifyJSON;
        addCollection(collection);
        phNames.value = Object.keys(collection.icons ?? {}).toSorted();
        error.value = false;
        return phNames.value;
      })
      .catch((err) => {
        // 失败释放缓存，下次可重试
        pending = null;
        error.value = true;
        throw err;
      })
      .finally(() => {
        loading.value = false;
      });
  }
  return pending;
}

/**
 * ph 图标全集。用法：const { phNames, loading, error, loadPhIcons, hasPhIcon } = usePhIcons();
 * 打开选择器/渲染 ph 图标前调一次 loadPhIcons()。
 */
export function usePhIcons() {
  /** 加载并注入全集；失败不抛异常，返回已有名单（可能为空），error 态供 UI 露出重试入口 */
  function loadPhIcons(): Promise<string[]> {
    return fetchPhIcons().catch(() => phNames.value);
  }

  /** 手动重试：清错误态重新加载（pending 已在失败时释放） */
  function retryPhIcons(): Promise<string[]> {
    error.value = false;
    return loadPhIcons();
  }

  /** 图标名集合（不含前缀），O(1) 命中判定 */
  const nameSet = computed(() => new Set(phNames.value));

  /** 补前缀，供模板拼 `ph:xxx` */
  const withPrefix = (name: string) => `${PH_PREFIX}${name}`;

  /**
   * icon 白名单校验：值必须 `ph:` 前缀且存在于已加载全集（复用同一份 chunk，不另存名单文件）。
   * 全集加载失败（本地 chunk 资源故障）时退化为前缀校验，不因取不到名单而阻塞保存。
   */
  async function hasPhIcon(value?: string | null): Promise<boolean> {
    const name = (value ?? '').trim();
    if (!name.startsWith(PH_PREFIX)) {
      return false;
    }
    await loadPhIcons();
    if (phNames.value.length === 0) {
      return true;
    }
    return nameSet.value.has(name.slice(PH_PREFIX.length));
  }

  return { phNames, loading, error, nameSet, loadPhIcons, retryPhIcons, withPrefix, hasPhIcon };
}
