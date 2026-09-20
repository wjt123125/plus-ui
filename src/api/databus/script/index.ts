import type { AxiosPromise } from '@/utils/api-types';
import request from '@/utils/request';

/**
 * 脚本引擎语言 VO，与后端 ScriptEngineController.ScriptEngineVO 对齐。
 */
export interface ScriptEngineVO {
  /** LiteFlow ScriptTypeEnum.displayName，如 "groovy" */
  language?: string;
}

/**
 * 列出已安装的脚本引擎语言清单。
 * 后端用 ServiceLoader 枚举 classpath 内所有 LiteFlow ScriptExecutor SPI 实现，
 * 一期仅装 liteflow-script-groovy，故仅返回 "groovy"。
 */
export const listScriptEngines = (): AxiosPromise<ScriptEngineVO[]> => {
  return request({
    url: '/databus/script/engines',
    method: 'get'
  });
};
