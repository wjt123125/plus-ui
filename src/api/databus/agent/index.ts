import type { AxiosPromise } from '@/utils/api-types';
import { getToken } from '@/utils/auth';
import request from '@/utils/request';
import type { AgentChatBo, AgentChatStartVo, AgentMessageVo, AgentRunVo, AgentSnapshotVo } from './types';

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
 * 列某个 run 的链路快照（每轮动手前一行，按 round 升序）。
 * GET /databus/agent/run/{runId}/snapshots
 */
export function listSnapshots(runId: string): AxiosPromise<AgentSnapshotVo[]> {
  return request({
    url: `/databus/agent/run/${runId}/snapshots`,
    method: 'get'
  });
}

/**
 * 把链路回滚到该 run 的某一轮动手前（只认服务端快照，不复制 run、不再写快照）。
 * POST /databus/agent/run/{runId}/rollback?round=n
 * @returns 回滚后的链路 id
 */
export function rollbackTo(runId: string, round: number): AxiosPromise<number | string> {
  return request({
    url: `/databus/agent/run/${runId}/rollback`,
    method: 'post',
    params: { round }
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