import type { AxiosPromise } from '@/utils/api-types';
import request from '@/utils/request';
import type { ComponentOptionsResp } from './types';

/**
 * 查询编辑器物料合流选项（内置注解件 + 启用自定义件）。
 * GET /databus/component/options（权限 databus:editor:list）。
 * 模块级会话缓存见 useComponentOptions，组件内不要直接重复调用。
 */
export function listComponentOptions(): AxiosPromise<ComponentOptionsResp> {
  return request({
    url: '/databus/component/options',
    method: 'get'
  });
}
