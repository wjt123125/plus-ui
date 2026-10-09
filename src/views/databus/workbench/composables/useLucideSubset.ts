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
    // 底部编译控制台开关（箭头语义与左右家族同约定：面板展开指底部、收起背离）
    'panel-bottom-close': {
      body: `<g ${S}><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 15h18m-6-7l-3 3l-3-3"/></g>`
    },
    'panel-bottom-open': {
      body: `<g ${S}><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 15h18M9 10l3-3l3 3"/></g>`
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
    // 链树头部/目录右键「新建链路」（与目录新建的裸 plus 区分，与 file-pen 编辑同族）
    'file-plus': {
      body: `<g ${S}><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5M9 15h6m-3 3v-6"/></g>`
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
    plus: { body: `<path ${S} d="M5 12h14m-7-7v14"/>` },
    // 链路工作台（链树/链 tab）：目录归属移动、链路（样条曲线）、树工具栏
    // path 数据取自 @iconify-json/lucide icons.json（api.iconify.design/lucide.json 同源）
    'folder-input': {
      body: `<g ${S}><path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1m0-4h10"/><path d="m9 16l3-3l-3-3"/></g>`
    },
    spline: {
      body: `<g ${S}><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><path d="M5 17A12 12 0 0 1 17 5"/></g>`
    },
    'refresh-cw': {
      body: `<g ${S}><path d="M3 12a9 9 0 0 1 9-9a9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5m5 4a9 9 0 0 1-9 9a9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></g>`
    },
    search: {
      body: `<g ${S}><path d="m21 21l-4.34-4.34"/><circle cx="11" cy="11" r="8"/></g>`
    },
    // 链树右键菜单：发布/执行；精选模板虚拟根与模板叶子
    send: {
      body: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11zm7.318-19.539l-10.94 10.939"/>'
    },
    play: {
      body: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>'
    },
    star: {
      body: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16z"/>'
    },
    sparkles: {
      body: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594zM20 2v4m2-2h-4"/><circle cx="4" cy="20" r="2"/></g>'
    }
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
