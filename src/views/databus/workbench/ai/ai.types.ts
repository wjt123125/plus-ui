/**
 * AI 助手会话摘要 —— 会话历史列表的一行。
 *
 * 数据由 useAgentChat 的 sessionList 聚合（后端按 run 分组），
 * 宿主（工作台）负责喂数据与格式化时间，会话历史组件只做渲染与事件上抛。
 */
export interface AiSession {
  /** 会话 id（前端生成的 UUID，满足后端 ^[A-Za-z0-9_-]{8,64}$） */
  id: string;
  /** 会话标题：自定义标题优先，否则是首问摘要 */
  title: string;
  /** 展示用的时间文案（相对时间，如「刚刚」「昨天」），由宿主格式化后喂入 */
  time?: string;
  /** 最近活跃时间原值（分组排序用，不直接展示） */
  lastActiveAt?: string;
  /** 该会话是否有进行中的 run（列表中显示运行中圆点） */
  running?: boolean;
  /** 会话状态：running 进行中，finished 已结束（卡片第二行的文字） */
  status?: 'running' | 'finished';
  /** 是否置顶 */
  pinned?: boolean;
  /** 归属工作区 id；空表示默认工作区 */
  workspaceId?: number | string | null;
}

/** 会话分组（历史栏「分组视图」的一段） */
export interface AiSessionGroup {
  /** 分组键：工作区 id，空工作区统一为 default */
  key: string;
  /** 分组标题 */
  name: string;
  /** 组内会话（置顶优先，其次最近活跃倒序） */
  sessions: AiSession[];
  /** 组内最新活跃时间，组间排序用 */
  latest?: string;
}