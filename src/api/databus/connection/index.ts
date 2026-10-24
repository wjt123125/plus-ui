import type { PageResult } from '@/api/types';
import type { AxiosPromise } from '@/utils/api-types';
import request from '@/utils/request';
import type {
  ConnectionOption,
  SysDatabusConnectionBo,
  SysDatabusConnectionQuery,
  SysDatabusConnectionVo
} from './types';

/**
 * 内置连接器类型静态基线（万物皆包 §15.7：连接管理页消费侧动态化后仅作降级兜底——
 * 无 databus:connector:list 权限 / defs 请求失败时显示内置 bpmHttp，见 useConnectorOptions）。
 */
export const CONNECTOR_OPTIONS = [{ value: 'bpmHttp', label: 'BPM HTTP 连接器' }] as const;

/**
 * 查询连接分页列表
 * GET /databus/connection/list（权限 databus:connection:list）
 */
export function listConnection(
  query?: SysDatabusConnectionQuery
): AxiosPromise<PageResult<SysDatabusConnectionVo>> {
  return request({
    url: '/databus/connection/list',
    method: 'get',
    params: query
  });
}

/**
 * 查询启用连接的轻量选项（编辑器 ConnectionSelect 控件用，不分页、不回密钥）
 * GET /databus/connection/options（权限 databus:editor:list）
 */
export function listConnectionOptions(): AxiosPromise<ConnectionOption[]> {
  return request({
    url: '/databus/connection/options',
    method: 'get'
  });
}

/**
 * 查询连接详情
 * GET /databus/connection/{id}（权限 databus:connection:query）
 */
export function getConnection(id: number | string): AxiosPromise<SysDatabusConnectionVo> {
  return request({
    url: '/databus/connection/' + id,
    method: 'get'
  });
}

/**
 * 新增连接
 * POST /databus/connection（权限 databus:connection:add）
 */
export function addConnection(data: SysDatabusConnectionBo) {
  return request({
    url: '/databus/connection',
    method: 'post',
    data
  });
}

/**
 * 修改连接
 * PUT /databus/connection（权限 databus:connection:edit）
 */
export function updateConnection(data: SysDatabusConnectionBo) {
  return request({
    url: '/databus/connection',
    method: 'put',
    data
  });
}

/**
 * 删除连接（支持主键批量）
 * DELETE /databus/connection/{ids}（权限 databus:connection:remove）
 */
export function delConnection(ids: number | string | Array<number | string>) {
  return request({
    url: '/databus/connection/' + ids,
    method: 'delete'
  });
}

/**
 * 测试连接（无需落库，直传当前表单值；后端返回 R<string>，成功 data 为测试结果说明）
 * POST /databus/connection/test（权限 databus:connection:test）
 *
 * 失败时后端返回非 200 code（如"测试连接失败: xxx"），request 拦截器会统一弹错误提示并 reject，
 * 调用方 catch 中无需再次弹窗，避免重复提示。
 */
export function testConnection(data: SysDatabusConnectionBo): AxiosPromise<string> {
  return request({
    url: '/databus/connection/test',
    method: 'post',
    data
  });
}
