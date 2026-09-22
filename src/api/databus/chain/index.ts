import type { PageResult } from '@/api/types';
import type { AxiosPromise } from '@/utils/api-types';
import request from '@/utils/request';
import type { DatabusChainBo, DatabusChainQuery, DatabusChainVo } from './types';

/**
 * 查询链路分页列表
 * GET /databus/chain/list（权限 databus:editor:list）
 */
export function listChain(query?: DatabusChainQuery): AxiosPromise<PageResult<DatabusChainVo>> {
  return request({
    url: '/databus/chain/list',
    method: 'get',
    params: query
  });
}

/**
 * 查询链路详情（编辑器加载/详情回显用）
 * GET /databus/chain/{id}（权限 databus:editor:query）
 */
export function getChain(id: number | string): AxiosPromise<DatabusChainVo> {
  return request({
    url: '/databus/chain/' + id,
    method: 'get'
  });
}

/**
 * 新增链路草稿
 * POST /databus/chain（权限 databus:editor:add）
 */
export function addChain(data: DatabusChainBo) {
  return request({
    url: '/databus/chain',
    method: 'post',
    data
  });
}

/**
 * 修改链路草稿（版本/状态不接受此接口修改，走发布/下线端点）
 * PUT /databus/chain（权限 databus:editor:edit）
 */
export function updateChain(data: DatabusChainBo) {
  return request({
    url: '/databus/chain',
    method: 'put',
    data
  });
}

/**
 * 删除链路（支持主键批量；后端同时清理 Rule-DB lf_chain 残留）
 * DELETE /databus/chain/{ids}（权限 databus:editor:remove）
 */
export function delChain(ids: number | string | Array<number | string>) {
  return request({
    url: '/databus/chain/' + ids,
    method: 'delete'
  });
}

/**
 * 发布链路：status 0草稿/2已下线 → 1已发布 + version+1；
 * 后端先推 EL（含脚本）到 Rule-DB lf_chain/lf_script，再改状态。
 * POST /databus/chain/publish/{id}（权限 databus:editor:publish）
 */
export function publishChain(id: number | string) {
  return request({
    url: '/databus/chain/publish/' + id,
    method: 'post'
  });
}

/**
 * 下线链路：status 1已发布 → 2已下线；后端先改状态再移除 Rule-DB lf_chain。
 * POST /databus/chain/offline/{id}（权限 databus:editor:offline）
 */
export function offlineChain(id: number | string) {
  return request({
    url: '/databus/chain/offline/' + id,
    method: 'post'
  });
}
