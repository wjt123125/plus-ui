/**
 * lucide 图标子集离线注入（详见 docs/refactor-component-workbench.md §4.1）。
 *
 * `@iconify/vue` 在本地没有对应 collection 时会**运行时联网** api.iconify.design，
 * 内网/离线环境表现为图标空白 + 控制台请求失败。工作台 UI 图标用量固定可枚举，
 * 因此手写 mini-collection 只注入用到的子集——`@iconify-json/lucide` 的 icons.json
 * 是纯 JSON、不可 tree-shake（约 1.5MB 原始 / gzip 200KB+），全量进主包代价与收益严重不匹配。
 *
 * body 数据取自 `@iconify-json/lucide@1.2.140` 的 icons.json（24×24 描边风格），非手写臆造。
 * 台账 `icon` 字段值走的是 `ph` 集，属另一条策略（动态 import 全集独立 chunk）。
 */
import { addCollection } from '@iconify/vue';
import type { IconifyJSON } from '@iconify/vue';

/** lucide 全集统一的描边属性，抽出来只为让下面的 body 字符串可读 */
const S = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"';

const LUCIDE_SUBSET: IconifyJSON = {
  prefix: 'lucide',
  width: 24,
  height: 24,
  icons: {
    // 顶部 header 的两个侧栏开关
    'panel-left-close': {
      body: `<g ${S}><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18m7-6l-3-3l3-3"/></g>`
    },
    'panel-left-open': {
      body: `<g ${S}><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18m5-12l3 3l-3 3"/></g>`
    },
    'panel-right-close': {
      body: `<g ${S}><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18M8 9l3 3l-3 3"/></g>`
    },
    'panel-right-open': {
      body: `<g ${S}><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18m-5-6l-3-3l3-3"/></g>`
    },
    // 工作面板 tab 图标
    'layout-grid': {
      body: `<g ${S}><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></g>`
    },
    'file-text': {
      body: `<g ${S}><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5M10 9H8m8 4H8m8 4H8"/></g>`
    },
    'file-pen': {
      body: `<g ${S}><path d="M12.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v9.34"/><path d="M14 2v5a1 1 0 0 0 1 1h5m-9.622 4.622a1 1 0 0 1 3 3.003L8.36 20.637a2 2 0 0 1-.854.506l-2.867.837a.5.5 0 0 1-.62-.62l.836-2.869a2 2 0 0 1 .506-.853z"/></g>`
    },
    'file-diff': {
      body: `<path ${S} d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zm3-12h6m-3 3V7M9 17h6"/>`
    },
    x: { body: `<path ${S} d="M18 6L6 18M6 6l12 12"/>` },
    // 资源树虚拟节点与目录
    boxes: {
      body: `<g ${S}><path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3zM7 16.5l-4.74-2.85M7 16.5l5-3m-5 3v5.17m5-8.17V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5zm5 3l-5-3m5 3l4.74-2.85M17 16.5v5.17"/><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3l5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0zM12 8L7.26 5.15M12 8l4.74-2.85M12 13.5V8"/></g>`
    },
    'circle-alert': { body: `<g ${S}><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></g>` },
    clock: { body: `<g ${S}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></g>` },
    folder: {
      body: `<path ${S} d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>`
    },
    // 叶子图标缺省兜底（台账 icon 字段为空时）
    box: {
      body: `<g ${S}><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7l8.7 5l8.7-5M12 22V12"/></g>`
    },
    // 右键菜单
    power: { body: `<path ${S} d="M12 2v10m6.4-5.4a9 9 0 1 1-12.77.04"/>` },
    trash: {
      body: `<path ${S} d="M10 11v6m4-6v6m5-11v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>`
    },
    copy: {
      body: `<g ${S}><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></g>`
    },
    plus: { body: `<path ${S} d="M5 12h14m-7-7v14"/>` }
  }
};

let injected = false;

/**
 * 幂等注入 lucide 子集。工作台内所有渲染 `lucide:*` 的组件在 setup 里调一次即可，
 * 模块级标记保证整个会话只注入一次。
 */
export function useLucideSubset(): void {
  if (injected) {
    return;
  }
  injected = true;
  addCollection(LUCIDE_SUBSET);
}
