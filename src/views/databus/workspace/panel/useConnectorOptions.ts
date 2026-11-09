import { computed, ref } from 'vue';
import { listConnectorDefs, listMyConnectorDefs } from '@/api/databus/connector';
import type { ConnectorConfigField, ConnectorConfigGroup, ConnectorDefVo } from '@/api/databus/connector/types';
import { connectorHealthMeta, versionLabel, type ConnectorHealthMeta } from '../market/marketDisplay';

/**
 * 连接器类型选项 + configSchema 供给（连接管理页消费侧，万物皆包 §15.7 / 方案 §8.2）。
 *
 * 下拉选项来源＝GET /databus/connector/defs/mine（只列「我装过」的连接器）。
 * 另拉一份全量 defs 仅用于存量连接的类型名与 configSchema 回显：别人装的连接器虽然不能新选，
 * 已有连接仍要显示成可读名字、编辑时仍要按 schema 渲染。
 * **没有静态兜底表**：连接器零内置之后，「装了哪些件」只有 def 表知道，前端写死一份
 * bpmHttp 兜底等于把已删掉的内置概念又请回来（方案 §10.3 明确要求删除 CONNECTOR_OPTIONS）。
 * 无权限 / 请求失败时选项为空，表单落到空态提示，不假装能连。
 *
 * 不筛 status：PENDING/DISABLED/DEPRECATED 只挡新建（§15.3），
 * 存量连接的类型筛选、label 展示与 configSchema 回显仍需可见。
 */
export interface ConnectorTypeOption {
  value: string;
  label: string;
  /** 运行态是否可用（status=ENABLED 且 health=OK）。false 时选择器置灰、测试连接禁用 */
  usable: boolean;
  /** 不可用时的短标签（缺驱动 / 未装载 / 未启用…），跟在选择器选项尾部 */
  healthLabel: string;
  /** 不可用的人话原因（后端 healthReason 优先），做 title 与表单提示 */
  healthReason: string;
}

/**
 * 版本级选项（新建连接时选「哪个连接器的哪一版」）。
 * 同 type 不同 version 是不同连接器：身份键是 (type, version)，落库锁 connectorDefId。
 */
export interface ConnectorDefOption extends ConnectorTypeOption {
  /** def 行主键（databus_connector_def.id），提交时作为 connectorDefId */
  defId: number | string;
  /** 连接器类型 */
  type: string;
  /** 版本号 */
  version: string;
  /** 构建号：同 type+version 下只有更大的 buildNo 才算升级 */
  buildNo: number;
}

/** 同 type 多行时挑「当前最该用」的一行：已启用优先，其次构建号大，再按更新时间 */
function preferDef(list: ConnectorDefVo[]): ConnectorDefVo | undefined {
  if (!list.length) {
    return undefined;
  }
  return [...list].toSorted((a, b) => {
    const enabledA = a.status === 'ENABLED' ? 1 : 0;
    const enabledB = b.status === 'ENABLED' ? 1 : 0;
    if (enabledA !== enabledB) {
      return enabledB - enabledA;
    }
    const buildA = Number(a.buildNo ?? 0);
    const buildB = Number(b.buildNo ?? 0);
    if (buildA !== buildB) {
      return buildB - buildA;
    }
    return String(b.updateTime ?? '').localeCompare(String(a.updateTime ?? ''));
  })[0];
}

export function useConnectorOptions() {
  const defs = ref<ConnectorDefVo[]>([]);
  /** 全量 def 行：只给标签/schema 回显兜底，不进下拉选项 */
  const allDefs = ref<ConnectorDefVo[]>([]);
  const loaded = ref(false);

  /** 类型级选项（按 type 去重，取该 type 下最该用的一版）：连接列表的类型筛选与存量回显用 */
  const options = computed<ConnectorTypeOption[]>(() => {
    const byType = new Map<string, ConnectorDefVo[]>();
    defs.value.forEach((d) => {
      const group = byType.get(d.type);
      if (group) {
        group.push(d);
      } else {
        byType.set(d.type, [d]);
      }
    });
    return [...byType.values()].map((group) => {
      const d = preferDef(group) as ConnectorDefVo;
      const health = connectorHealthMeta(d);
      return {
        value: d.type,
        label: d.label || d.type,
        usable: health.usable,
        healthLabel: health.label,
        healthReason: health.reason
      };
    });
  });

  /**
   * 版本级选项（一行一个 def）：新建连接时选版本用。
   * 同 type 多版本共存，value 用 def 主键，提交时直接落 connectorDefId 锁定版本。
   */
  const defOptions = computed<ConnectorDefOption[]>(() =>
    [...defs.value]
      .toSorted((a, b) => {
        if (a.type !== b.type) {
          return a.type.localeCompare(b.type);
        }
        const buildA = Number(a.buildNo ?? 0);
        const buildB = Number(b.buildNo ?? 0);
        if (buildA !== buildB) {
          return buildB - buildA;
        }
        return String(b.updateTime ?? '').localeCompare(String(a.updateTime ?? ''));
      })
      .map((d) => {
        const health = connectorHealthMeta(d);
        return {
          defId: d.id ?? '',
          type: d.type,
          version: d.version ?? '',
          buildNo: Number(d.buildNo ?? 0),
          value: String(d.id ?? `${d.type}@${d.version ?? ''}`),
          label: `${d.label || d.type} · ${versionLabel(d.version) || '—'}`,
          usable: health.usable,
          healthLabel: health.label,
          healthReason: health.reason
        };
      })
  );

  /** 拉取「我的已装」defs 做下拉；全量 defs 单独兜底回显，失败不打断 */
  async function loadConnectorOptions(): Promise<void> {
    try {
      const { data } = await listMyConnectorDefs();
      defs.value = data ?? [];
      loaded.value = true;
    } catch {
      /* 无权限 / 网络失败：静默留空，由调用方渲染空态 */
      defs.value = [];
      loaded.value = true;
    }
    try {
      const { data } = await listConnectorDefs();
      allDefs.value = data ?? [];
    } catch {
      allDefs.value = [];
    }
  }

  /** 类型值 → 可读 label；未知类型原样显示（与旧 connectorTypeLabel 语义一致） */
  function connectorLabelOf(value?: string): string {
    if (!value) {
      return '-';
    }
    return options.value.find((o) => o.value === value)?.label ?? value;
  }

  /**
   * 类型值 → def 行：先找我的已装，再退回全量（存量连接回显用）。
   * 同 type 多版本共存：传 version 精确命中；不传按「已启用优先、构建号大」挑一版做代表。
   */
  function defOf(value?: string, version?: string): ConnectorDefVo | undefined {
    if (!value) {
      return undefined;
    }
    const match = (d: ConnectorDefVo) => d.type === value && (!version || d.version === version);
    return preferDef(defs.value.filter(match)) ?? preferDef(allDefs.value.filter(match));
  }

  /** def 主键 → def 行：连接行上锁定的 connectorDefId 用它精确回显类型与版本 */
  function defById(id?: number | string | null): ConnectorDefVo | undefined {
    if (id === undefined || id === null || id === '') {
      return undefined;
    }
    return [...defs.value, ...allDefs.value].find((d) => d.id != null && String(d.id) === String(id));
  }

  /**
   * 类型值 → Connection 配置 schema（字段名 → 字段定义）。
   * 连接表单据此动态渲染；老包（manifest 没存 configSchema）返回空对象，表单降级为裸 JSON 编辑。
   */
  function schemaOf(value?: string, version?: string): Record<string, ConnectorConfigField> {
    return defOf(value, version)?.configSchema ?? {};
  }

  /**
   * 类型值 → 分组元数据（tab 顺序 / 主组 / 列数 / 标签位置）。
   * 老包（describe 没声明 groups）返回空数组，由 connectionSchema.resolveGroups 兜底分组。
   */
  function groupsOf(value?: string, version?: string): ConnectorConfigGroup[] {
    return defOf(value, version)?.groups ?? [];
  }

  /**
   * 类型值 → 运行态健康结论（§4.2.1）。挡「新建连接 / 测试连接」与给原因文案都从这里取，
   * 与物料管理页连接器行、市场卡片共用 marketDisplay 里同一份口径，不会各判各的。
   */
  function healthOf(value?: string, version?: string): ConnectorHealthMeta {
    return connectorHealthMeta(defOf(value, version));
  }

  return {
    options,
    defOptions,
    defs,
    loaded,
    loadConnectorOptions,
    connectorLabelOf,
    defOf,
    defById,
    schemaOf,
    groupsOf,
    healthOf
  };
}
