import type { AxiosPromise } from '@/utils/api-types';
import type { PageResult } from '@/api/types';
import request from '@/utils/request';
import type {
  ComponentOptionsResp,
  DatabusComponentForm,
  DatabusComponentQuery,
  DatabusComponentVo,
  ScriptRollbackBo,
  ScriptSaveBo,
  ScriptSaveResult,
  ScriptRuntime,
  ScriptVersion
} from './types';

/**
 * 查询编辑器物料合流选项（内置注解件 + 启用自定义件）。
 * GET /databus/component/options（权限 databus:editor:list）。
 * 模块级会话缓存见 useComponentOptions，组件内不要直接重复调用。
 */
export function listComponentOptions(): AxiosPromise<ComponentOptionsResp> {
  return request({
    url: '/databus/component/options',
    method: 'get'
  });
}

/**
 * 分页查询自定义组件元信息（仅 databus_component 表行，不含内置件）。
 * GET /databus/component/list（权限 databus:component:list）
 */
export function listComponent(
  query?: DatabusComponentQuery
): AxiosPromise<PageResult<DatabusComponentVo>> {
  return request({
    url: '/databus/component/list',
    method: 'get',
    params: query
  });
}

/**
 * 查询自定义组件详情
 * GET /databus/component/{id}（权限 databus:component:query）
 */
export function getComponent(id: number | string): AxiosPromise<DatabusComponentVo> {
  return request({
    url: '/databus/component/' + id,
    method: 'get'
  });
}

/**
 * 新增自定义组件
 * POST /databus/component（权限 databus:component:add）
 */
export function addComponent(data: DatabusComponentForm) {
  return request({
    url: '/databus/component',
    method: 'post',
    data
  });
}

/**
 * 修改自定义组件
 * PUT /databus/component（权限 databus:component:edit）
 */
export function updateComponent(data: DatabusComponentForm) {
  return request({
    url: '/databus/component',
    method: 'put',
    data
  });
}

/**
 * 删除自定义组件（支持批量；后端先校验链路引用）
 * DELETE /databus/component/{ids}（权限 databus:component:remove）
 */
export function delComponent(ids: number | string | Array<number | string>) {
  return request({
    url: '/databus/component/' + ids,
    method: 'delete'
  });
}

// ------------------------------------------------------------------
// 脚本宿主：保存即编译 / 回滚 / 版本历史 / 运行时健康
// 注意：编译失败后端仍返回 code=200（success=false + 诊断明细），
// 因全局响应拦截器对业务失败码只透传 msg、丢弃 data。
// ------------------------------------------------------------------

/**
 * 保存脚本（保存即编译，失败整体不落库；成功版本 +1 并热更全局生效）。
 * POST /databus/component/script（权限 databus:component:script:edit）
 */
export function saveScript(data: ScriptSaveBo): AxiosPromise<ScriptSaveResult> {
  return request({
    url: '/databus/component/script',
    method: 'post',
    data
  });
}

/**
 * 回滚到历史版本（旧源码重走保存管线，产生新版本行，不覆盖历史）。
 * POST /databus/component/script/rollback（权限 databus:component:script:edit）
 */
export function rollbackScript(data: ScriptRollbackBo): AxiosPromise<ScriptSaveResult> {
  return request({
    url: '/databus/component/script/rollback',
    method: 'post',
    data
  });
}

/**
 * 查询脚本版本历史（版本号倒序，含正文，仅脚本编辑权限可见）。
 * GET /databus/component/script/{id}/versions
 */
export function listScriptVersions(id: number | string): AxiosPromise<ScriptVersion[]> {
  return request({
    url: `/databus/component/script/${id}/versions`,
    method: 'get'
  });
}

/**
 * 查询库存脚本件运行时注册健康（启动期编译/注册失败件露出）。
 * GET /databus/component/script/runtime（权限 databus:component:list）
 */
export function listScriptRuntime(): AxiosPromise<ScriptRuntime[]> {
  return request({
    url: '/databus/component/script/runtime',
    method: 'get'
  });
}
