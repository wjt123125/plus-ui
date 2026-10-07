/**
 * databus 域工作台外壳共享类型（2026-10-07 四栏重构）。
 * 组件台账是首个消费者；链路台账等后续页面复用同一套壳，各自扩展业务字段。
 */

/** 右栏工作区 tab 最小契约；消费者可 extends 增加 code/id/版本等业务字段 */
export interface WorkbenchTab {
  /** tab 唯一身份（组件+模式、链路+模式等） */
  key: string;
  /** 业务 tab 类型，由消费者定义（如 detail/form/changes） */
  kind: string;
  /** tab 标题 */
  title: string;
  /** 未保存改动标记（脏圆点 + 关闭确认） */
  dirty: boolean;
}
