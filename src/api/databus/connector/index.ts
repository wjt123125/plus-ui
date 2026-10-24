import type { AxiosPromise } from '@/utils/api-types';
import request from '@/utils/request';
import type { ConnectorDefVo } from './types';

/**
 * 连接器运行层 API（万物皆包，§15.7 四端点）。
 * 上传入口内嵌市场 tab（不另设独立包管理页，§15.3），启停/卸载走 defs 端点。
 */

/**
 * def 合并视图（内置 ∪ def 行，含 status）。
 * GET /databus/connector/defs（权限 databus:connector:list）
 * 驱动：连接管理页类型下拉动态化、市场连接器卡片启停动作。
 */
export function listConnectorDefs(): AxiosPromise<ConnectorDefVo[]> {
  return request({
    url: '/databus/connector/defs',
    method: 'get'
  });
}

/**
 * 上传连接器包（zip＝manifest.json + lib/）：校验 + 落盘 + 入库。
 * 同 type 升版本＝热更新；新 type 默认 SUSPENDED，enable 是治理者显式动作。
 * POST /databus/connector/packages（权限 databus:connector:upload）
 */
export function uploadConnectorPackage(file: File): AxiosPromise<ConnectorDefVo> {
  const data = new FormData();
  data.append('file', file);
  // multipart headers 由 axios/浏览器自动生成（手写不带 boundary 是坑，全项目惯例）
  return request({
    url: '/databus/connector/packages',
    method: 'post',
    data
  });
}

/**
 * 启用（ENABLED：进可选列表；市场侧＝安装语义）。
 * POST /databus/connector/defs/{type}/enable（权限 databus:connector:edit）
 */
export function enableConnector(type: string) {
  return request({
    url: `/databus/connector/defs/${encodeURIComponent(type)}/enable`,
    method: 'post'
  });
}

/**
 * 暂停（SUSPENDED：挡新建连接，存量 Connection 与数据保留；市场侧＝停用）。
 * POST /databus/connector/defs/{type}/disable（权限 databus:connector:edit）
 */
export function disableConnector(type: string) {
  return request({
    url: `/databus/connector/defs/${encodeURIComponent(type)}/disable`,
    method: 'post'
  });
}

/**
 * 卸载（默认拒绝在用连接；force=true 管理员强制，存量连接悬空自然衰减）。
 * DELETE /databus/connector/defs/{type}（权限 databus:connector:remove）
 */
export function uninstallConnector(type: string, force = false) {
  return request({
    url: `/databus/connector/defs/${encodeURIComponent(type)}`,
    method: 'delete',
    params: { force }
  });
}
