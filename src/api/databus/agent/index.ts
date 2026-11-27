import type { AxiosPromise } from '@/utils/api-types';
import { getToken } from '@/utils/auth';
import request from '@/utils/request';
import type {
  AgentApprovalMode,
  AgentApprovalModeVo,
  AgentChatBo,
  AgentChatStartVo,
  AgentConversationVo,
  AgentMessageVo,
  AgentRevertPreviewVo,
  AgentRollbackVo,
  AgentRunVo
} from './types';

/**
 * 发起一次 AI 对话：后端建 run 落库，返回 run 句柄与会话 id。
 * POST /databus/agent/chat
 */
export function startAgentChat(data: AgentChatBo): AxiosPromise<AgentChatStartVo> {
  return request({
    url: '/databus/agent/chat',
    method: 'post',
    data
  });
}

/**
 * 停止进行中的 run（用户点停止）。
 * POST /databus/agent/run/{runId}/stop
 */
export function stopAgentRun(runId: string) {
  return request({
    url: `/databus/agent/run/${runId}/stop`,
    method: 'post'
  });
}

/**
 * 上报「用户丢弃了本次画布更新」：后端记一行审计，下一轮对话让模型知道改动未采纳。
 * POST /databus/agent/run/{runId}/canvas-skip
 */
export function reportAgentCanvasSkip(runId: string, chainName?: string) {
  return request({
    url: `/databus/agent/run/${runId}/canvas-skip`,
    method: 'post',
    params: { chainName }
  });
}

/**
 * 按会话查当前用户进行中的 run（刷新后恢复用，无则 data 为 null）。
 * GET /databus/agent/run/active
 */
export function getActiveAgentRun(conversationId: string): AxiosPromise<AgentRunVo | null> {
  return request({
    url: '/databus/agent/run/active',
    method: 'get',
    params: { conversationId }
  });
}

/**
 * 回放某个 run 已落库的消息（按 seq 升序）。
 * GET /databus/agent/run/{runId}/messages
 */
export function listAgentMessages(runId: string): AxiosPromise<AgentMessageVo[]> {
  return request({
    url: `/databus/agent/run/${runId}/messages`,
    method: 'get'
  });
}

/**
 * 按会话回放历史轮次（刷新后还原对话用，按创建时间升序）。
 * GET /databus/agent/conversation/{conversationId}/history
 */
export function listAgentHistory(conversationId: string): AxiosPromise<AgentRunVo[]> {
  return request({
    url: `/databus/agent/conversation/${conversationId}/history`,
    method: 'get'
  });
}

/**
 * 列出当前用户的会话（置顶优先，其次按最近活跃倒序，供左侧历史栏用）。
 * GET /databus/agent/conversations?limit=50
 */
export function listAgentConversations(limit = 50): AxiosPromise<AgentConversationVo[]> {
  return request({
    url: '/databus/agent/conversations',
    method: 'get',
    params: { limit }
  });
}

/**
 * 搜当前用户的会话（标题 + 问句 + 消息内容模糊匹配）。
 * GET /databus/agent/conversations/search?keyword=
 */
export function searchAgentConversations(keyword: string, limit = 50): AxiosPromise<AgentConversationVo[]> {
  return request({
    url: '/databus/agent/conversations/search',
    method: 'get',
    params: { keyword, limit }
  });
}

/**
 * 重命名会话（只覆盖显示标题，不影响历史问句）。
 * PUT /databus/agent/conversation/{conversationId}/title
 */
export function renameAgentConversation(conversationId: string, title: string) {
  return request({
    url: `/databus/agent/conversation/${conversationId}/title`,
    method: 'put',
    data: { title }
  });
}

/**
 * 置顶 / 取消置顶会话。
 * PUT /databus/agent/conversation/{conversationId}/pin
 */
export function pinAgentConversation(conversationId: string, pinned: boolean) {
  return request({
    url: `/databus/agent/conversation/${conversationId}/pin`,
    method: 'put',
    params: { pinned }
  });
}

/**
 * 删除会话（软删覆盖信息，run / step / message 历史保留）。
 * DELETE /databus/agent/conversation/{conversationId}
 */
export function deleteAgentConversation(conversationId: string) {
  return request({
    url: `/databus/agent/conversation/${conversationId}`,
    method: 'delete'
  });
}

/**
 * 撤销删除会话（复位软删标记，历史原样回来）。
 * POST /databus/agent/conversation/{conversationId}/restore
 */
export function restoreAgentConversation(conversationId: string) {
  return request({
    url: `/databus/agent/conversation/${conversationId}/restore`,
    method: 'post'
  });
}

/**
 * 该轮是否真正改过链路：前端据此决定是否显示「回退到本轮对话发起前」。
 * GET /databus/agent/run/{runId}/changed
 */
export function getAgentRunChanged(runId: string): AxiosPromise<boolean> {
  return request({
    url: `/databus/agent/run/${runId}/changed`,
    method: 'get'
  });
}

/**
 * 删除一轮对话（逻辑删除该 run，历史回放不再出现）。
 * DELETE /databus/agent/run/{runId}
 */
export function deleteAgentRun(runId: string) {
  return request({
    url: `/databus/agent/run/${runId}`,
    method: 'delete'
  });
}

/**
 * 原地重试：隐藏旧 run，沿用原意图重新发起，返回新 run 句柄。
 * POST /databus/agent/run/{runId}/retry
 */
export function retryAgentRun(runId: string): AxiosPromise<AgentChatStartVo> {
  return request({
    url: `/databus/agent/run/${runId}/retry`,
    method: 'post'
  });
}

/**
 * 回退预检：只读算出「将撤销 / 将跳过 / 受影响」，前端据此决定是否出确认卡。
 * POST /databus/agent/run/{runId}/revert/preview
 */
export function previewAgentRunRevert(runId: string): AxiosPromise<AgentRevertPreviewVo> {
  return request({
    url: `/databus/agent/run/${runId}/revert/preview`,
    method: 'post'
  });
}

/**
 * 回退到本轮对话发起前：撤销该轮及之后各轮的链路/草稿改动，并截断这些轮次的历史。
 * POST /databus/agent/run/{runId}/revert
 */
export function revertAgentRun(runId: string): AxiosPromise<AgentRollbackVo[]> {
  return request({
    url: `/databus/agent/run/${runId}/revert`,
    method: 'post'
  });
}

/**
 * 读取会话级操作审批模式与部署的完全访问开关。
 * GET /databus/agent/conversation/{conversationId}/approval-mode
 */
export function getAgentApprovalMode(conversationId: string): AxiosPromise<AgentApprovalModeVo> {
  return request({
    url: `/databus/agent/conversation/${conversationId}/approval-mode`,
    method: 'get'
  });
}

/**
 * 保存会话级操作审批模式（MANUAL/AUTO；FULL 需部署开放；CUSTOM 暂未开放）。
 * PUT /databus/agent/conversation/{conversationId}/approval-mode
 */
export function updateAgentApprovalMode(conversationId: string, mode: AgentApprovalMode) {
  return request({
    url: `/databus/agent/conversation/${conversationId}/approval-mode`,
    method: 'put',
    data: { mode }
  });
}

/**
 * 打开对话流的 SSE 地址（EventSource 不能带自定义头，鉴权沿用 ?Authorization=Bearer token）。
 * clientid 不能省：后端鉴权拦截器要求 header 或 param 里的 clientid 与 token 内的一致。
 * @param runId run 句柄
 */
export function buildAgentStreamUrl(runId: string): string {
  const clientId = import.meta.env.VITE_APP_CLIENT_ID;
  return `${import.meta.env.VITE_APP_BASE_API}/databus/agent/chat/${runId}/stream?Authorization=Bearer ${getToken()}&clientid=${clientId}`;
}