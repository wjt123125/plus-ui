/** JSON 规范化：原生 API 足够，不引库 */
export function formatJson(source: string): string {
  return JSON.stringify(JSON.parse(source), null, 2);
}
