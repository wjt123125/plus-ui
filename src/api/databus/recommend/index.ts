import type { AxiosPromise } from '@/utils/api-types';
import request from '@/utils/request';
import type { CmpPickBo, CmpRecommendQuery, CmpRecommendVo } from './types';

/**
 * 拉取组件插入推荐（有序，分数降序）。
 * GET /databus/editor/recommend，登录即可访问。
 * 后端只返回有种子/真账信号的类型，未列出的组件前端按本地规则兜底。
 */
export function fetchCmpRecommend(query: CmpRecommendQuery): AxiosPromise<CmpRecommendVo[]> {
  return request({
    url: '/databus/editor/recommend',
    method: 'get',
    params: {
      mode: query.mode,
      anchorType: query.anchorType ?? undefined,
      excludedTypes: query.excludedTypes?.length ? query.excludedTypes.join(',') : undefined
    }
  });
}

/**
 * 上报一次真实选择（真账计数 +1）。fire-and-forget：调用方自行吞掉异常，
 * 推荐质量统计永远不能影响画布插入本身。
 */
export function reportCmpPick(data: CmpPickBo): AxiosPromise<void> {
  return request({
    url: '/databus/editor/recommend/pick',
    method: 'post',
    data
  });
}
