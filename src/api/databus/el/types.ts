/**
 * LiteFlow 画布组件树，与后端 org.dromara.databus.el.bean.CmpProperty 对齐。
 *
 * 叶子节点（普通组件）：{ id, type: 'NodeComponent', properties: { tag, data } }
 * 编排节点：{ type: 'THEN' | 'WHEN' | 'IF' ..., properties: { id, tag }, children: [] }
 */
export interface CmpProperty {
  id?: string;
  type: string;
  properties?: CmpProperties | null;
  condition?: CmpProperty | null;
  children?: CmpProperty[];
}

export interface CmpProperties {
  id?: string;
  tag?: string;
  data?: string;
}

/**
 * EL 表达式信息，与后端 org.dromara.databus.el.bean.ELInfo 对齐。
 */
export interface ELInfo {
  chainId?: string;
  elStr?: string;
}
