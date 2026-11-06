import { addCollection, type IconifyJSON } from '@iconify/vue';

/**
 * 品牌图标集（logos）的离线注入——全项目唯一出口。
 *
 * 背景：连接器 manifest 的 `icon` 是 Iconify 字符串，MySQL / PostgreSQL 这类有官方图形
 * 的连接器写 `logos:mysql` / `logos:postgresql`。@iconify/vue 见 `:` 即按需拉取，
 * 未离线注入 collection 时会运行时联网 api.iconify.design，内网环境表现为图标空白
 * （与 usePhIcons 同一套背景，那边的注释里也写了）。
 *
 * 策略：`import('@iconify-json/logos/icons.json')` → `addCollection()`。Vite 把这份
 * JSON 切独立 chunk，主 bundle 体积不变。模块级 Promise 单飞，多页面同时渲染只加载一次；
 * 失败释放 pending，下次可重试。
 */
let pending: Promise<void> | null = null;

export function loadBrandIcons(): Promise<void> {
  if (!pending) {
    pending = import('@iconify-json/logos/icons.json')
      .then((mod) => {
        addCollection((mod.default ?? mod) as unknown as IconifyJSON);
      })
      .catch((err) => {
        // 失败释放缓存，下次渲染还能重试
        pending = null;
        throw err;
      });
  }
  return pending;
}

/** 值是否品牌彩色图标：`logos:` 自带配色，渲染处不要叠底色/着色，
 *  直接挂基元的 .db-brand-icon 统一按 40px 裸图展示（见 _primitives.scss） */
export function isBrandIconName(value?: string | null): boolean {
  return (value ?? '').startsWith('logos:');
}
