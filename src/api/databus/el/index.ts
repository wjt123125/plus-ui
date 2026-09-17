import type { CmpProperty, ELInfo, PreviewRunBo, PreviewRunVo } from '@/api/databus/el/types';
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

/**
 * 试运行：画布 JSON → 生成 EL → 校验 → 按 EL 真执行（不落库）。
 * 后端无论成败都返回 200，结果以 PreviewRunVo.executed/success/errorMessage 区分。
 */
export const previewRun = (data: PreviewRunBo): AxiosPromise<PreviewRunVo> => {
  return request({
    url: '/databus/editor/preview-run',
    method: 'post',
    data
  });
};
