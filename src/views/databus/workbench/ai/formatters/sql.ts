/**
 * SQL 格式化：sql-formatter 是业界通用实现，不自写解析器。
 *
 * 链路里的 SQL 会混 {{ $.x }} / #{id} / ${name} 这类模板占位符，
 * 格式化器不认，先替换成普通标识符，格式化完再原样还原。
 */
import { format } from 'sql-formatter';

/**
 * 方言兜底顺序：PostgreSQL 对函数括号/类型转换最宽容，先试；
 * 反引号这类 MySQL 写法会抛错，再退到 MySQL；最后标准 SQL 兜底。
 */
const SQL_DIALECTS = ['postgresql', 'mysql', 'sql'] as const;

const PLACEHOLDER = /\{\{[\s\S]*?\}\}|#\{[^}]*\}|\$\{[^}]*\}/g;

export function formatSql(source: string): string {
  const holes: string[] = [];
  const masked = source.replace(PLACEHOLDER, (match) => {
    holes.push(match);
    return `__db_ph_${holes.length - 1}__`;
  });

  let lastError: unknown;
  for (const language of SQL_DIALECTS) {
    try {
      const formatted = format(masked, { language, tabWidth: 2, keywordCase: 'preserve' });
      return formatted.replace(/__db_ph_(\d+)__/g, (_, index: string) => holes[Number(index)] ?? '');
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
