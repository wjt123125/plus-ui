/**
 * 统一目录（databus_directory）类型定义。
 * 目录树为全量平表（无分页），前端组树；链路归属走 databus_chain.directory_id，
 * 组件归属走 databus_component.directory_id（同一张树混装两类叶子）。
 * 取代原链路目录（chainDirectory）类型。
 */
export interface DirectoryVo {
  /** 主键 */
  id: string | number;
  /** 父目录 id（0=根级） */
  parentId: string | number;
  /** 目录名 */
  directoryName: string;
  /** 属主（null=团队共享树；PaaS 化后=用户id，每人一棵） */
  ownerId?: string | number | null;
  /** 排序号（同级内升序） */
  sort: number;
  /** 备注 */
  remark?: string;
  /** 创建时间 */
  createTime?: string;
  /** 更新时间 */
  updateTime?: string;
}

/** 目录表单（新增/编辑通用，编辑时 id 必传） */
export interface DirectoryForm {
  id?: string | number;
  /** 父目录 id（0=根级；编辑换父后端做环校验） */
  parentId?: string | number;
  /** 目录名（≤100） */
  directoryName?: string;
  /** 排序号 */
  sort?: number;
  /** 备注 */
  remark?: string;
}

/** 链路移动表单（move-chain 端点；directoryId 空=移出到未归组） */
export interface ChainMoveForm {
  /** 链路主键 */
  chainId: string | number;
  /** 目标目录主键（null=移出为未归组） */
  directoryId?: string | number | null;
}

/** 组件移动表单（move-component 端点；directoryId 空=移出到未归组） */
export interface ComponentMoveForm {
  /** 组件主键 */
  componentId: string | number;
  /** 目标目录主键（null=移出为未归组） */
  directoryId?: string | number | null;
}
