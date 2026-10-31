import type { PageResult } from '@/api/types';
import type { AxiosPromise } from '@/utils/api-types';
import request from '@/utils/request';
import type {
  ConnectionOption,
  SysDatabusConnectionBo,
  SysDatabusConnectionQuery,
  SysDatabusConnectionVo,
  TestConnectionResult
} from './types';

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
 * 测试连接（无需落库，直传当前表单值）
 * POST /databus/connection/test（权限 databus:connection:test）
 *
 * 返回体形态由连接器自己决定（方案 §10.1：testConnection 签名 String → Object）：
 * JDBC 回结构化 Map（message/product/driverVersion…），BPM 仍回纯字符串。
 * 失败时后端返回非 200 code（如"测试连接失败: xxx"），request 拦截器统一弹错并 reject，
 * 调用方 catch 中无需再次弹窗，避免重复提示。
 */
export function testConnection(
  data: SysDatabusConnectionBo
): AxiosPromise<TestConnectionResult | string> {
  return request({
    url: '/databus/connection/test',
    method: 'post',
    data
  });
}

/**
 * 从测试连接返回体里取可展示文案。
 * 必须兼容两种形态：字符串（老连接器）与对象（结构化返回）。
 * 直接 ElMessage.success(data) 在对象形态下会弹 [object Object]——方案 §10.1 第 7/8 条点名的坑。
 */
export function testResultMessage(data?: TestConnectionResult | string | null): string {
  if (typeof data === 'string') {
    return data;
  }
  return data?.message || '测试成功';
}
