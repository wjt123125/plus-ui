import type { CmpProperty } from '@/api/databus/el/types';

/**
 * 数据总线链路视图对象，与后端 org.dromara.databus.domain.vo.DatabusChainVo 对齐。
 *
 * 三层物料模型第三层（链路实例）：发布后 EL 推 Rule-DB（lf_chain）作为执行期权威源，
 * 本表只承担业务元数据（状态/版本计数器/记录档位/画布数据）。
 */
export interface DatabusChainVo {
  /** 主键 id（编辑/发布/删除用；后端 Long 超出 JS 安全整数时序列化为字符串） */
  id?: number | string;
  /** 链路编码（全局唯一；Rule-DB lf_chain.chain_id 用此值） */
  chainCode: string;
  /** 链路名称（用户可读） */
  chainName: string;
  /** 版本号（每次发布递增，草稿阶段恒为 1，不存历史快照） */
  version?: number;
  /** 状态（0草稿 1已发布 2已下线） */
  status?: string;
  /** LiteFlow EL 表达式（后端从 cmpProperty 权威生成，不接受前端传入） */
  elExpression?: string;
  /** 画布 JSON（VueFlow nodes/edges 序列化，编辑器还原用） */
  canvasData?: string;
  /** 画布逻辑组件树（后端 TypeHandler 直接返回对象；编辑器据此还原 CmpProperty 树） */
  cmpProperty?: CmpProperty | null;
  /** 执行记录档位（OFF/BASIC/FULL，默认 BASIC；挂字典 databus_log_level） */
  logLevel?: string;
  /** 备注 */
  remark?: string;
  /** 创建时间 */
  createTime?: string;
  /** 更新时间 */
  updateTime?: string;
}

/**
 * 新增/修改链路入参，与后端 org.dromara.databus.domain.bo.DatabusChainBo 对齐。
 * 提交画布组件树对象，EL 由后端 ExpressGenerator 生成。
 */
export interface DatabusChainBo {
  /** 主键 id（新增为空，编辑必填；与 Vo.id 同规约） */
  id?: number | string;
  /** 链路编码 */
  chainCode: string;
  /** 链路名称 */
  chainName: string;
  /** 画布 JSON（VueFlow nodes/edges 序列化串） */
  canvasData?: string;
  /** 画布逻辑组件树（后端据此生成 EL；编辑器保存时提交） */
  cmpProperty?: CmpProperty | null;
  /** 执行记录档位（OFF/BASIC/FULL） */
  logLevel?: string;
  /** 备注 */
  remark?: string;
}

/**
 * 链路列表分页查询参数，与后端 list 端点支持的过滤字段对齐。
 */
export interface DatabusChainQuery extends PageQuery {
  /** 链路编码（后端模糊匹配） */
  chainCode?: string;
  /** 链路名称（后端模糊匹配） */
  chainName?: string;
  /** 状态（0草稿 1已发布 2已下线，精确匹配） */
  status?: string;
}
