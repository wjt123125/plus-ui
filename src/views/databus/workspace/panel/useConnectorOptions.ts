import { computed, ref } from 'vue';
import { CONNECTOR_OPTIONS } from '@/api/databus/connection';
import { listConnectorDefs } from '@/api/databus/connector';
import type { ConnectorDefVo } from '@/api/databus/connector/types';

/**
 * 连接器类型选项（连接管理页消费侧，万物皆包 §15.7）。
 * 动态来源＝GET /databus/connector/defs「内置 ∪ def 行」合并视图（权限 databus:connector:list）；
 * 无权限 / 请求失败时静默降级静态内置表（CONNECTOR_OPTIONS，1D-P0 bpmHttp），页面功能不受阻。
 * 不筛 status：SUSPENDED 只挡新建（§15.3），存量连接的类型筛选与 label 展示仍需可见。
 */
export interface ConnectorTypeOption {
  value: string;
  label: string;
}

export function useConnectorOptions() {
  const defs = ref<ConnectorDefVo[]>([]);
  const loaded = ref(false);

  /** 静态降级基线（readonly as const → 拷贝为普通数组） */
  const fallback: ConnectorTypeOption[] = CONNECTOR_OPTIONS.map((o) => ({ ...o }));

  const options = computed<ConnectorTypeOption[]>(() =>
    loaded.value ? defs.value.map((d) => ({ value: d.type, label: d.label || d.type })) : fallback
  );

  /** 拉取 defs 合并视图；失败保持降级（拦截器已提示，连接管理页无需打断） */
  async function loadConnectorOptions(): Promise<void> {
    try {
      const { data } = await listConnectorDefs();
      defs.value = data ?? [];
      loaded.value = true;
    } catch {
      /* 无权限 / 网络失败：静默降级静态内置表 */
    }
  }

  /** 类型值 → 可读 label；未知类型原样显示（与旧 connectorTypeLabel 语义一致） */
  function connectorLabelOf(value?: string): string {
    if (!value) {
      return '-';
    }
    return options.value.find((o) => o.value === value)?.label ?? value;
  }

  return { options, loadConnectorOptions, connectorLabelOf };
}
