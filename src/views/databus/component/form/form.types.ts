import type { DatabusComponentForm } from '@/api/databus/component/types';

/** 弹窗表单模型：治理列 + 回显用的脚本工件三列（提交治理时剔除，工件走独立保存端点） */
export type ComponentFormModel = DatabusComponentForm & {
  scriptLang?: string | null;
  scriptBody?: string | null;
  version?: number | null;
};

export type TabName = 'basic' | 'appearance' | 'params' | 'script' | 'advanced';

/** el-form 校验字段 → 所在 tab（字段构造器的校验失败直接记 params） */
export const TAB_OF: Partial<Record<keyof DatabusComponentForm, TabName>> = {
  componentCode: 'basic',
  componentName: 'basic',
  category: 'basic',
  icon: 'appearance',
  dataExample: 'advanced',
  inputSchema: 'advanced',
  outputSchema: 'advanced'
};

export const defaultForm = (): ComponentFormModel => ({
  componentCode: '',
  componentName: '',
  shortName: '',
  category: 'DATA',
  groupName: 'business',
  domain: '',
  icon: '',
  color: '',
  sort: 100,
  description: '',
  tags: [],
  nodeType: 'NODE',
  editor: 'form',
  paramSchema: '',
  dataExample: '',
  inputSchema: '',
  outputSchema: '',
  scriptLang: '',
  scriptBody: '',
  version: null,
  status: '0',
  deprecated: '0',
  deprecateNote: '',
  docUrl: '',
  remark: ''
});
