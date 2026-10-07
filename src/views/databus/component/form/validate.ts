import { ElMessage } from 'element-plus';

/** 校验 JSON 文本列：空串放行；非空必须是 JSON 值（对象/数组均可，schema 一般为对象） */
export function validateJsonColumn(label: string, raw: string | null | undefined, mustObject = true): boolean {
  const text = (raw ?? '').trim();
  if (!text) {
    return true;
  }
  try {
    const parsed = JSON.parse(text);
    if (mustObject && (typeof parsed !== 'object' || parsed === null)) {
      ElMessage.error(`${label}必须是 JSON 对象`);
      return false;
    }
    return true;
  } catch (e) {
    ElMessage.error(`${label}不是合法 JSON：${(e as Error).message}`);
    return false;
  }
}
