import type { PageResult } from '@/api/types';
import type { AxiosPromise } from '@/utils/api-types';
import request from '@/utils/request';
import type {
  ChainCopyBo,
  ChainStatsVo,
  CopySuggestionVo,
  DatabusChainBo,
  DatabusChainQuery,
  DatabusChainVo,
  TemplateMarkBo
} from './types';

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
 * 按 status 分组计数（链路管理页顶部统计块用）
 * GET /databus/chain/stats（权限 databus:editor:list）
 */
export function chainStats(): AxiosPromise<ChainStatsVo> {
  return request({
    url: '/databus/chain/stats',
    method: 'get'
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
 * @returns 新链路主键（雪花 id 序列化为字符串）；工作台树新建成功后据此打开画布 tab
 */
export function addChain(data: DatabusChainBo): AxiosPromise<number | string> {
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

/**
 * 复制建议值：名称「源名称+副本」、编码源编码 _2/_3 递增查重，供复制弹窗预填。
 * GET /databus/chain/copy-suggestion/{id}（权限 databus:editor:add）
 */
export function getCopySuggestion(id: number | string): AxiosPromise<CopySuggestionVo> {
  return request({
    url: '/databus/chain/copy-suggestion/' + id,
    method: 'get'
  });
}

/**
 * 复制链路：弹窗确认副本名称/编码后生成全新草稿（不推 Rule-DB、不影响源链路）；
 * 源链路为模板时副本剥离模板身份。返回新链路主键，供「使用模板」复制后直跳编辑器。
 * POST /databus/chain/copy/{id}（权限 databus:editor:add）
 */
export function copyChain(id: number | string, data: ChainCopyBo): AxiosPromise<number | string> {
  return request({
    url: '/databus/chain/copy/' + id,
    method: 'post',
    data
  });
}

/**
 * 设为精选模板（运营动作）：写模板标记 + 说明 + 排序；已发布链路须先下线。
 * POST /databus/chain/template/{id}（权限 databus:editor:template）
 */
export function markTemplate(id: number | string, data: TemplateMarkBo) {
  return request({
    url: '/databus/chain/template/' + id,
    method: 'post',
    data
  });
}

/**
 * 取消精选模板：清除标记/说明/排序，链路回到普通草稿，历史副本不受影响。
 * DELETE /databus/chain/template/{id}（权限 databus:editor:template）
 */
export function unmarkTemplate(id: number | string) {
  return request({
    url: '/databus/chain/template/' + id,
    method: 'delete'
  });
}
