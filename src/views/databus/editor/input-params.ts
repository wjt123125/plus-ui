import type { ChainInputParam, ChainInputType } from '@/api/databus/chain/types';

/**
 * 链路入参登记表的路径与转换工具（2026-09-27，见 databus-context-design.md §3.4）。
 * 供入参登记弹窗与编辑器试运行预填共用，避免两处各写一份路径规则。
 */

/**
 * 路径 token 解析：支持 .name、[0]、['name']、["name"]；非法片段抛错。
 */
const TOKEN_PATTERN = /\.([A-Za-z_$][\w$]*)|\[(\d+)\]|\[\s*['"]([^'"]+)['"]\s*\]/g;

export function pathTokens(full: string): string[] {
  // 去掉开头的 $，保留其后的 . 或 [（名字片段要求前导 .，故不能删）。
  const body = full.trim().replace(/^\$/, '');
  const tokens: string[] = [];
  TOKEN_PATTERN.lastIndex = 0;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_PATTERN.exec(body))) {
    if (match.index !== last) {
      throw new Error('路径含无法识别的片段');
    }
    tokens.push(match[1] ?? match[3] ?? match[2]);
    last = TOKEN_PATTERN.lastIndex;
  }
  if (last !== body.length) {
    throw new Error('路径含无法识别的片段');
  }
  return tokens;
}

/**
 * 按完整路径从对象取值；路径非法或中途缺失返回 undefined。
 */
export function getPathValue(root: unknown, full: string): unknown {
  let current: unknown = root;
  let tokens: string[];
  try {
    tokens = pathTokens(full);
  } catch {
    return undefined;
  }
  for (const token of tokens) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[token];
  }
  return current;
}

/**
 * 按完整路径把值写入 root（父级缺失自动创建：数字索引建数组，其余建对象）。
 */
export function setPathValue(root: Record<string, unknown>, full: string, value: unknown): void {
  const tokens = pathTokens(full);
  let current: Record<string, unknown> = root;
  tokens.forEach((token, i) => {
    if (i === tokens.length - 1) {
      current[token] = value;
      return;
    }
    let child = current[token];
    if (child === null || child === undefined || typeof child !== 'object') {
      child = /^\d+$/.test(token) ? [] : {};
      current[token] = child;
    }
    current = child as Record<string, unknown>;
  });
}

/**
 * 按登记表默认值生成 JSON 对象：跳过无默认值（null/undefined）的条目。
 */
export function buildDefaultsJson(params: ChainInputParam[]): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const param of params) {
    if (!param.path || param.defaultValue === null || param.defaultValue === undefined) {
      continue;
    }
    setPathValue(root, param.path, param.defaultValue);
  }
  return root;
}

/**
 * 按 JS 值推断类型标记。
 */
export function inferType(value: unknown): ChainInputType | null {
  if (typeof value === 'string') {
    return 'text';
  }
  if (typeof value === 'number') {
    return 'number';
  }
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value !== null && typeof value === 'object') {
    return 'object';
  }
  return null;
}

/**
 * JSON 对象按叶子展开为登记条目（路径自动带、类型按值推断）；
 * 空对象/空数组无叶子，自然跳过。
 */
export function flattenToParams(obj: unknown): ChainInputParam[] {
  const result: ChainInputParam[] = [];
  const walk = (node: unknown, path: string) => {
    if (node !== null && typeof node === 'object') {
      if (Array.isArray(node)) {
        node.forEach((item, i) => walk(item, `${path}[${i}]`));
      } else {
        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
          const keyExpr = /^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `['${key}']`;
          walk(value, path + keyExpr);
        }
      }
    } else {
      const type = inferType(node);
      if (type && path !== '$') {
        result.push({ path, type, defaultValue: node, required: false });
      }
    }
  };
  walk(obj, '$');
  return result;
}

/**
 * 校验登记条目：路径非空、以 $. 开头、token 合法、不可重复；返回错误信息（无错返回 null）。
 */
export function validateParams(params: ChainInputParam[]): string | null {
  const seen = new Set<string>();
  for (const param of params) {
    const path = param.path?.trim();
    if (!path) {
      return '存在未填写路径的条目';
    }
    if (!path.startsWith('$.')) {
      return `路径必须以 $. 开头：${path}`;
    }
    try {
      pathTokens(path);
    } catch {
      return `路径写法非法：${path}`;
    }
    if (seen.has(path)) {
      return `路径重复：${path}`;
    }
    seen.add(path);
  }
  return null;
}
