import { ElMessage } from 'element-plus';
import { getComponent } from '@/api/databus/component';
import type { ComponentOption, DatabusComponentVo } from '@/api/databus/component/types';
import type { ChainInputParam } from '@/api/databus/chain/types';
import type { CmpProperty } from '@/api/databus/el/types';
import { COMPONENT_STATUS } from '@/constants/databus';
import { parseSchemaFields } from '@/views/databus/component/model/labels';
import { clearTransientDef, setTransientDef } from '../cmp-defs';
import { useComponentOptions } from './useComponentOptions';
import type { ElTreeModel } from './useElTreeModel';

/**
 * 草稿预览链路：把 DRAFT 组件拉成一条「单节点、不落库」的画布树。
 *
 * - 草稿没进 /options，画布与右抽屉都靠瞬态 def/option 才认得它（关闭预览 tab 时摘掉）；
 * - 种子树只有一个业务叶子：id=组件编码、tag=数据空间名、data=配置示例；
 *   loadFromCmpProperty 会自动包 THEN(start, leaf, end)，就是一条最小链路；
 * - 执行时后端按 draftComponentId 临时注册 FlowBus（见 PreviewRunBo）。
 */
export interface DraftPreviewStore {
  treeModel: ElTreeModel;
  reproject: () => void;
  autoLayout: () => void;
  /** 把草稿登记好的试运行入参写进编辑器状态（试运行弹窗据此预填默认值） */
  applyInputParams: (params: ChainInputParam[]) => void;
}

export function useDraftPreview(store: DraftPreviewStore) {
  const { treeModel, reproject, autoLayout, applyInputParams } = store;
  const { ensureOptions, injectTransientOption, removeTransientOption } = useComponentOptions();
  /** 已注入瞬态物料的编码：卸载时精确摘除 */
  let injectedCode: string | null = null;

  /** 数据空间名：EL 里节点 tag，沿用「编码 + 序号」惯例，非法字符归一化 */
  function toDataSpace(code: string): string {
    const base = code.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1');
    return `${base}1`;
  }

  /** 配置示例只在是合法 JSON 时用作初始 cfg，坏数据不塞进画布 */
  function exampleJson(dataExample?: string | null): string | null {
    const text = dataExample?.trim();
    if (!text) {
      return null;
    }
    try {
      JSON.parse(text);
      return text;
    } catch {
      return null;
    }
  }

  function toOption(vo: DatabusComponentVo): ComponentOption {
    const fields = parseSchemaFields(vo.paramSchema) ?? [];
    return {
      code: vo.componentCode,
      name: vo.componentName,
      shortName: vo.shortName ?? null,
      group: vo.groupName ?? null,
      domain: vo.domain ?? null,
      icon: vo.icon ?? null,
      color: vo.color ?? null,
      description: vo.description ?? null,
      nodeType: vo.nodeType ?? null,
      editor: vo.editor ?? 'form',
      source: 'CUSTOM',
      dataExample: vo.dataExample ?? null,
      schema: fields.length ? { fields } : null
    };
  }

  function buildSeed(vo: DatabusComponentVo): CmpProperty {
    const seed: CmpProperty = {
      id: vo.componentCode,
      type: 'NodeComponent',
      properties: { tag: toDataSpace(vo.componentCode) }
    };
    const data = exampleJson(vo.dataExample);
    if (data) {
      seed.properties!.data = data;
    }
    return seed;
  }

  /**
   * 拉草稿并铺到画布；返回展示名（tab 标题用）。失败返回 null（提示已弹）。
   */
  async function load(draftId: number | string): Promise<{ name: string; code: string } | null> {
    const { data } = await getComponent(draftId);
    if (!data) {
      ElMessage.warning('草稿不存在或已被处理');
      return null;
    }
    if (data.status !== COMPONENT_STATUS.DRAFT) {
      ElMessage.warning('该组件已不是草稿，预览链路不可用');
      return null;
    }
    if (data.nodeType && data.nodeType !== 'NODE') {
      ElMessage.warning('该草稿是条件/循环类组件，暂不支持画布预览');
      return null;
    }
    if (!data.scriptBody || !data.componentCode) {
      ElMessage.warning('该草稿没有脚本正文，无法预览');
      return null;
    }

    // 先等物料到位再注瞬态件：避免后续物料刷新把画布刚渲染的节点打回「未注册」
    await ensureOptions();
    const option = toOption(data);
    setTransientDef(option);
    injectTransientOption(option);
    injectedCode = option.code;

    treeModel.loadFromCmpProperty(buildSeed(data));
    treeModel.project();
    reproject();
    autoLayout();
    // 入参登记：AI 落草稿时把探针跑通的样板入参存进了组件行，这里写进编辑器状态，
    // 试运行弹窗按 defaultValue 预填（空登记＝保持 {}，与以前一致）
    if (data.inputParams?.length) {
      applyInputParams(data.inputParams);
    }
    return { name: data.componentName || data.componentCode, code: data.componentCode };
  }

  /** 卸载：摘掉瞬态物料，别让草稿留在别的画布/物料查询里 */
  function dispose(): void {
    if (injectedCode) {
      clearTransientDef(injectedCode);
      removeTransientOption(injectedCode);
      injectedCode = null;
    }
  }

  return { load, dispose };
}
