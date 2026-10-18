import request from '@/utils/request';
import type { AxiosPromise } from '@/utils/api-types';
import type { FavoriteForm, FavoriteVo } from './types';

/**
 * 用户收藏 API（工作区统一资源树「我的收藏」section）。
 * userId 由后端从当前登录态取，前端只传 resourceType + resourceId。
 */
// 查询当前用户收藏列表
export function listFavorite(): AxiosPromise<FavoriteVo[]> {
  return request({
    url: '/databus/favorite/list',
    method: 'get'
  });
}

// 新增收藏（幂等）
export function addFavorite(data: FavoriteForm) {
  return request({
    url: '/databus/favorite',
    method: 'post',
    data: data
  });
}

// 取消收藏（幂等）
export function removeFavorite(data: FavoriteForm) {
  return request({
    url: '/databus/favorite',
    method: 'delete',
    data: data
  });
}
