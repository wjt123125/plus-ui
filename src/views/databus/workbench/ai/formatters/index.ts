/**
 * 代码块格式化的统一门面。
 *
 * 统一的是入口，不是实现：语言 → 加载器的注册表，
 * 本地实现 / WASM / 远端接口都按同一签名登记，调用方只认 formatCode。
 * 新语言 = 表里加一行 + 一个动态 import，UI 与调用方都不用改。
 */
export type Formatter = (code: string) => string | Promise<string>;

/** 只登记浏览器端有可靠方案的语言；没登记的语言不显示格式化按钮 */
const REGISTRY: Record<string, () => Promise<Formatter>> = {
  json: () => import('./json').then((m) => m.formatJson),
  sql: () => import('./sql').then((m) => m.formatSql)
  // 以后：
  // typescript: () => import('./prettier-ts').then((m) => m.formatTs),
  // java:       () => remoteFormatter('java')
};

/** 当前语言是否支持就地格式化（同步查表，用于按钮显隐） */
export function isFormattable(lang: string): boolean {
  return Object.prototype.hasOwnProperty.call(REGISTRY, lang);
}

/**
 * 按语言懒加载并格式化；失败（语法不合法 / 语言不支持）返回 null，
 * 调用方保持原文不动。加载器按需 import，未用到的格式化库不进首屏包。
 */
export async function formatCode(source: string, lang: string): Promise<string | null> {
  if (!source.trim()) {
    return null;
  }
  const load = REGISTRY[lang];
  if (!load) {
    return null;
  }
  try {
    const formatter = await load();
    return await formatter(source);
  } catch {
    return null;
  }
}
