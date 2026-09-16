import type { CmpProperty, ELInfo } from '@/api/databus/el/types';
import type { AxiosPromise } from '@/utils/api-types';
import request from '@/utils/request';

/**
 * 画布 JSON 转 LiteFlow EL 表达式
 * @param data 画布组件树
 */
export const generateEl = (data: CmpProperty): AxiosPromise<ELInfo> => {
  return request({
    url: '/databus/el/generate',
    method: 'post',
    data
  });
};
