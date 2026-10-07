/**
 * 组件台账工作面板 tab 会话：在通用 useWorkbenchTabs 之上包装组件业务语义。
 * tab 身份 = 组件 + 模式；组件库/查看/编辑/代码变更各自独立可并存；重复打开只聚焦。
 */
import { useWorkbenchTabs } from '../../../workbench/composables/useWorkbenchTabs';
import type { ComponentRegistryRow } from '../../model/registry';
import { GRID_TAB_KEY } from '../workbench.types';
import type { ComponentTab, FormPreset } from '../workbench.types';

export function detailKey(code: string): string {
  return `detail:${code}`;
}
export function formKey(id?: number): string {
  return `form:${id ?? 'new'}`;
}
export function changesKey(id: number): string {
  return `changes:${id}`;
}

export function useComponentTabs() {
  const wb = useWorkbenchTabs<ComponentTab>();

  /** 打开/聚焦「组件库」tab（卡片网格宿主）；页面初始化与点树目录节点时调用 */
  function openGrid(): string {
    return wb.open({ key: GRID_TAB_KEY, kind: 'grid', title: '组件库', code: '', dirty: false });
  }

  function openDetail(row: Pick<ComponentRegistryRow, 'code' | 'name'>): string {
    return wb.open({
      key: detailKey(row.code),
      kind: 'detail',
      title: row.name,
      code: row.code,
      dirty: false
    });
  }

  function openForm(
    id: number | undefined,
    row?: Pick<ComponentRegistryRow, 'code' | 'name'>,
    preset?: FormPreset
  ): string {
    const key = formKey(id);
    // 新建 tab 是单例：换目录再次「新建组件」时只替换预设，脏草稿由 FormPane 自行决定保留
    const existed = wb.tabs.value.find((t) => t.key === key);
    if (existed) {
      existed.preset = preset;
    }
    return wb.open({
      key,
      kind: 'form',
      title: row?.name ?? '新组件',
      code: row?.code ?? '',
      dbId: id,
      dirty: false,
      preset
    });
  }

  function openChanges(row: ComponentRegistryRow): string | null {
    if (row.db?.id == null) {
      return null;
    }
    return wb.open({
      key: changesKey(row.db.id),
      kind: 'changes',
      title: row.name,
      code: row.code,
      dbId: row.db.id,
      version: row.db.version ?? null,
      dirty: false
    });
  }

  /** 关闭同组件的全部 tab（删除组件后调用） */
  function closeByCode(code: string) {
    const remain = wb.tabs.value.filter((t) => t.code !== code);
    wb.tabs.value = remain;
    if (!remain.some((t) => t.key === wb.activeKey.value)) {
      wb.activeKey.value = remain[remain.length - 1]?.key ?? '';
    }
  }

  /** 新组件保存成功：form:new 临时 tab 转正为 form:id */
  function adoptNewForm(code: string, id: number, name: string) {
    const oldKey = formKey(undefined);
    const idx = wb.tabs.value.findIndex((t) => t.key === oldKey);
    if (idx === -1) {
      return;
    }
    wb.tabs.value[idx] = {
      key: formKey(id),
      kind: 'form',
      title: name,
      code,
      dbId: id,
      dirty: false
    };
    wb.activeKey.value = formKey(id);
  }

  return {
    ...wb,
    openGrid,
    openDetail,
    openForm,
    openChanges,
    closeByCode,
    adoptNewForm
  };
}
