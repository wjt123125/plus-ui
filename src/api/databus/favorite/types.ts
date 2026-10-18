/**
 * 用户收藏（databus_user_favorite）类型定义。
 * 收藏是个人化组织维度（目录是团队共享归属单真相）；userId 由后端从登录态取。
 */
export type FavoriteResourceType = 'chain' | 'component';

/** 收藏条目（list 响应：后端回查资源名/编码/图标） */
export interface FavoriteVo {
  /** 资源类型 */
  resourceType: FavoriteResourceType;
  /** 资源主键（chain=链路 id，component=组件 id） */
  resourceId: string | number;
  /** 资源名（链路名/组件名；资源已删时空） */
  resourceName?: string | null;
  /** 资源编码（链路编码/组件编码；资源已删时空） */
  resourceCode?: string | null;
  /** 资源图标（组件图标名；链路为空，前端按类型兜底） */
  icon?: string | null;
}

/** 收藏/取消收藏入参 */
export interface FavoriteForm {
  resourceType: FavoriteResourceType;
  resourceId: string | number;
}
