import type { AxiosPromise } from '@/utils/api-types';
import request from '@/utils/request';
import type { ConnectorDefVo, ConnectorPackageInspect, ConnectorRuntimeInfo } from './types';

/**
 * 连接器运行层 API（万物皆包，§15.7 四端点）。
 * 上传入口内嵌市场 tab（不另设独立包管理页，§15.3），启停/卸载走 defs 端点。
 */

/**
 * 已装载连接器的 def 清单（含 status）。连接器零内置，这就是「平台有哪些连接器」的唯一来源。
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
 * 同 type 升版本＝热更新；新 type 默认 INACTIVE，enable 是治理者显式动作。
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
 * 审核启用（§1.3）：提交人 ≠ 审批人，勾 verified；启用即装载实例。
 * POST /databus/connector/defs/{type}/enable（权限 databus:connector:edit）
 */
export function enableConnector(type: string, verified: boolean) {
  return request({
    url: `/databus/connector/defs/${encodeURIComponent(type)}/enable`,
    method: 'post',
    params: { verified }
  });
}

/**
 * 禁用（DISABLED：挡新建连接，存量 Connection 与数据保留；市场侧＝停用）。
 * POST /databus/connector/defs/{type}/disable（权限 databus:connector:edit）
 */
export function disableConnector(type: string) {
  return request({
    url: `/databus/connector/defs/${encodeURIComponent(type)}/disable`,
    method: 'post'
  });
}

/**
 * 废弃（DEPRECATED，终态不可逆）：从可执行态停机退役，def 行与包保留，之后只能卸载。
 * POST /databus/connector/defs/{type}/deprecate（权限 databus:connector:edit）
 */
export function deprecateConnector(type: string) {
  return request({
    url: `/databus/connector/defs/${encodeURIComponent(type)}/deprecate`,
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

/**
 * dev 目录装载的连接器：重新加载（卸载旧实例 → 重读编译输出目录 → 装载新实例）。
 * 改一行连接器代码 → IDE 编译 → 点这个按钮，几秒钟生效，不用打包上传审核。
 * 后端 @Profile("dev")：非 dev 环境接口地址不存在，故只有 source=DEV 的 def 行才露出该按钮。
 * POST /databus/connector/dev/reload（权限 databus:connector:edit）
 * @param type 连接器类型；留空重载配置里的全部 dev 目录
 */
export function reloadDevConnector(type?: string): AxiosPromise<string[]> {
  return request({
    url: '/databus/connector/dev/reload',
    method: 'post',
    params: { type }
  });
}

/**
 * 包内清单 + 关键实现类反编译预览（审核「看得见」§2.3）。
 * GET /databus/connector/{type}/{version}/package-files（权限 databus:connector:list）
 */
export function inspectConnectorPackage(type: string, version: string): AxiosPromise<ConnectorPackageInspect> {
  return request({
    url: `/databus/connector/${encodeURIComponent(type)}/${encodeURIComponent(version)}/package-files`,
    method: 'get'
  });
}

/**
 * 下载原包（审核「看得见」§2.3）：返回 zip blob，走 blob 下载不走 JSON 拦截器。
 * GET /databus/connector/{type}/{version}/package（权限 databus:connector:list）
 */
export function downloadConnectorPackageUrl(type: string, version: string): string {
  return `/databus/connector/${encodeURIComponent(type)}/${encodeURIComponent(version)}/package`;
}

/**
 * 运行时信息（§4.2.1 child-first 的配套）：当前生效加载器 + 驱动清单（含 loadedFrom）。
 * loadedFrom=PLATFORM 说明包内那份没生效，前端须黄色告警。
 * 连接器未装载时后端照常 200，只是 classLoader 为 null、drivers 为空。
 * GET /databus/connector/{type}/runtime-info（权限 databus:connector:list）
 */
export function getConnectorRuntimeInfo(type: string): AxiosPromise<ConnectorRuntimeInfo> {
  return request({
    url: `/databus/connector/${encodeURIComponent(type)}/runtime-info`,
    method: 'get'
  });
}
