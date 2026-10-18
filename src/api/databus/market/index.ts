import request from '@/utils/request';
import { AxiosPromise } from '@/utils/api-types';
import {
  DatabusMarketCategoryVo,
  MarketInstallForm,
  DatabusMarketInstallVo,
  DatabusMarketItemVo,
  MarketPublishForm,
  MarketQuery,
  MarketReviewForm
} from './types';

/**
 * 物料市场 API（组件 / 链路市场）。
 * 分三组：浏览（只读）/ 消费（安装侧）/ 供给（上架侧），见设计正本 §十一。
 * `/databus/market/*` 为新建层，databus_market_item / databus_market_category / databus_install 三表承载。
 */

/* ---------------- 浏览（只读） ---------------- */

/** 市场物料列表（类型 / 分类 / 搜索 / 分页；回填当前用户是否已装） */
export function listMarketItems(params: MarketQuery): AxiosPromise<{ rows: DatabusMarketItemVo[]; total: number }> {
  return request({
    url: '/databus/market/items',
    method: 'get',
    params
  });
}

/** 分类树（多级平表，前端组树） */
export function listMarketCategories(): AxiosPromise<DatabusMarketCategoryVo[]> {
  return request({
    url: '/databus/market/categories',
    method: 'get'
  });
}

/** 物料详情 */
export function getMarketItem(id: string | number): AxiosPromise<DatabusMarketItemVo> {
  return request({
    url: '/databus/market/items/' + id,
    method: 'get'
  });
}

/* ---------------- 消费（安装侧） ---------------- */

/** 安装＝fork（落快照 + 进我目录 + 记 installedFrom） */
export function installMarketItem(id: string | number, data: MarketInstallForm): AxiosPromise<DatabusMarketInstallVo> {
  return request({
    url: `/databus/market/items/${id}/install`,
    method: 'post',
    data
  });
}

/** 卸载（删我的副本，返回被引用软提示） */
export function uninstallMarketItem(resourceId: string | number): AxiosPromise<void> {
  return request({
    url: '/databus/market/install/' + resourceId,
    method: 'delete'
  });
}

/** 我的已装列表（管理页数据源） */
export function listInstalled(): AxiosPromise<DatabusMarketInstallVo[]> {
  return request({
    url: '/databus/market/installed',
    method: 'get'
  });
}

/** 我的上架列表（作者视角治理视图，含各状态） */
export function listMyMarketItems(): AxiosPromise<DatabusMarketItemVo[]> {
  return request({
    url: '/databus/market/mine',
    method: 'get'
  });
}

/** 待审核列表（治理者视角，仅 PENDING；权限 databus:market:review） */
export function listPendingMarketItems(): AxiosPromise<DatabusMarketItemVo[]> {
  return request({
    url: '/databus/market/pending',
    method: 'get'
  });
}

/* ---------------- 供给（上架侧） ---------------- */

/** 提交上架（进待审） */
export function publishMarket(data: MarketPublishForm): AxiosPromise<void> {
  return request({
    url: '/databus/market/publish',
    method: 'post',
    data
  });
}

/** 下架 */
export function unpublishMarketItem(id: string | number): AxiosPromise<void> {
  return request({
    url: `/databus/market/items/${id}/unpublish`,
    method: 'post'
  });
}

/** 审核（通过 / 驳回；后期 AI 介入） */
export function reviewMarketItem(id: string | number, data: MarketReviewForm): AxiosPromise<void> {
  return request({
    url: `/databus/market/items/${id}/review`,
    method: 'post',
    data
  });
}

/** 删市场原件（作者主权；与卸载是两个不同操作） */
export function delMarketItem(id: string | number): AxiosPromise<void> {
  return request({
    url: '/databus/market/items/' + id,
    method: 'delete'
  });
}
