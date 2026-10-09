import request from '@/utils/request';
import { AxiosPromise } from '@/utils/api-types';
import { ChainDirectoryVo, ChainDirectoryForm, ChainMoveForm } from './types';

/**
 * 链路目录 API（链路工作台资源树配套）。
 */
// 查询全部目录（平表，前端组树）
export function listChainDirectory(): AxiosPromise<ChainDirectoryVo[]> {
  return request({
    url: '/databus/chain/directory/list',
    method: 'get'
  });
}

// 查询目录详情
export function getChainDirectory(id: string | number): AxiosPromise<ChainDirectoryVo> {
  return request({
    url: '/databus/chain/directory/' + id,
    method: 'get'
  });
}

// 新增目录
export function addChainDirectory(data: ChainDirectoryForm) {
  return request({
    url: '/databus/chain/directory',
    method: 'post',
    data: data
  });
}

// 修改目录（重命名/排序/换父，换父后端做环校验）
export function updateChainDirectory(data: ChainDirectoryForm) {
  return request({
    url: '/databus/chain/directory',
    method: 'put',
    data: data
  });
}

// 删除目录（子目录/挂链非空均后端拦截）
export function delChainDirectory(ids: (string | number) | Array<string | number>) {
  return request({
    url: '/databus/chain/directory/' + ids,
    method: 'delete'
  });
}

// 移动链路归属（directoryId 空=移出到未归组）
export function moveChainToDirectory(data: ChainMoveForm) {
  return request({
    url: '/databus/chain/directory/move-chain',
    method: 'put',
    data: data
  });
}
