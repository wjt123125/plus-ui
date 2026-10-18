import request from '@/utils/request';
import { AxiosPromise } from '@/utils/api-types';
import { ChainMoveForm, ComponentMoveForm, DirectoryForm, DirectoryVo } from './types';

/**
 * 统一目录 API（工作区统一资源树配套：链路 + 自建组件混装叶子的组织树）。
 * 取代原链路目录 API（chainDirectory）。
 */
// 查询全部目录（平表，前端组树）
export function listDirectory(): AxiosPromise<DirectoryVo[]> {
  return request({
    url: '/databus/directory/list',
    method: 'get'
  });
}

// 查询目录详情
export function getDirectory(id: string | number): AxiosPromise<DirectoryVo> {
  return request({
    url: '/databus/directory/' + id,
    method: 'get'
  });
}

// 新增目录
export function addDirectory(data: DirectoryForm) {
  return request({
    url: '/databus/directory',
    method: 'post',
    data: data
  });
}

// 修改目录（重命名/排序/换父，换父后端做环校验）
export function updateDirectory(data: DirectoryForm) {
  return request({
    url: '/databus/directory',
    method: 'put',
    data: data
  });
}

// 删除目录（子目录/挂链路/挂组件均后端拦截）
export function delDirectory(ids: (string | number) | Array<string | number>) {
  return request({
    url: '/databus/directory/' + ids,
    method: 'delete'
  });
}

// 移动链路归属（directoryId 空=移出到未归组）
export function moveChainToDirectory(data: ChainMoveForm) {
  return request({
    url: '/databus/directory/move-chain',
    method: 'put',
    data: data
  });
}

// 移动组件归属（directoryId 空=移出到未归组）
export function moveComponentToDirectory(data: ComponentMoveForm) {
  return request({
    url: '/databus/directory/move-component',
    method: 'put',
    data: data
  });
}
