/**
 * AI 助手会话摘要 —— 会话历史列表的一行。
 *
 * 数据由 useAgentChat 的 sessionList 聚合（后端按 run 分组），
 * 宿主（工作台）负责喂数据与格式化时间，会话历史组件只做渲染与事件上抛。
 */
export interface AiSession {
  /** 会话 id（前端生成的 UUID，满足后端 ^[A-Za-z0-9_-]{8,64}$） */
  id: string;
  /** 会话标题：首问摘要 */
  title: string;
  /** 展示用的时间文案，由宿主格式化后喂入（组件不做日期运算） */
  time?: string;
  /** 该会话是否有进行中的 run（列表中显示运行中圆点） */
  running?: boolean;
}
