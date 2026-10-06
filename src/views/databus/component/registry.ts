/**
 * 组件台账三源合流（2026-10-06 脚本宿主立法后秩序）。
 * - /options：同一次请求下发三态——
 *   SYSTEM（纯内置：无 DB 行，契约/治理全取 jar 注解）、
 *   OVERLAY（治理覆盖：同码 DB 行无脚本，治理取 DB、契约取注解）、
 *   CUSTOM（库存件：同码启用有 script_body，契约/治理全量取 DB，可覆盖同码内置）；
 *   停用件不进 /options，仅在 /list 里露出。
 * - /list：databus_component 全部 DB 行（含停用）。
 * - cmp-defs：前端物料面板现行事实源，仅给内置件补七组分组/色值（注解 group 当前恒为默认 business，
 *   待 cmp-defs 退役后自然回落到 option.group）。
 *
 * 旧「编码冲突红签」已废除：同码 DB 行启用有脚本即库存件接管，无脚本即治理覆盖，均为合法态。
 */
import type { ComponentOption, ComponentSource, DatabusComponentVo } from '@/api/databus/component/types';

/** 台账只需要 cmp-defs 的展示字段，结构类型最小化，不依赖编辑器内部类型导出 */
export interface DefMeta {
  group?: string;
  color?: string;
  icon?: string;
  short?: string;
}

/** 台账合流行 */
export interface ComponentRegistryRow {
  /** 物料编码（option.code 或 db.componentCode） */
  code: string;
  /** 展示名（有 DB 治理名取 DB；纯内置取 option.name） */
  name: string;
  /** 三态来源 */
  source: ComponentSource;
  /** /options 合流项：停用 DB 行没有 */
  option?: ComponentOption;
  /** databus_component 表行：OVERLAY/CUSTOM 及停用件有 */
  db?: DatabusComponentVo;
  /** 生效面板分组（DB 治理正本 → cmp-defs → option.group） */
  group: string;
  /** 生效图标（Iconify 名或本地 svg 名） */
  icon?: string;
  /** 生效面板色值 */
  color?: string;
  /** 物料网格短名（DB 治理列） */
  shortName?: string;
  /** 编目标签（DB 治理列） */
  tags?: string[];
  /** 废弃标记（db.deprecated='1' 或 option.deprecated） */
  deprecated: boolean;
  /** 废弃提示 */
  deprecateNote?: string;
  /** 已停用（status=1，不进 /options，编辑器面板看不到） */
  disabled: boolean;
  /** DB 行带脚本工件（库存脚本件，含停用态） */
  scripted: boolean;
}

export function buildRegistry(
  options: ComponentOption[],
  dbRows: DatabusComponentVo[],
  defMap: ReadonlyMap<string, DefMeta>
): ComponentRegistryRow[] {
  const rows: ComponentRegistryRow[] = [];
  const builtinCodes = new Set<string>();
  for (const opt of options) {
    if (opt.source === 'SYSTEM') {
      builtinCodes.add(opt.code);
    }
  }

  const matchedDbIds = new Set<number>();
  for (const opt of options) {
    const def = defMap.get(opt.code);
    if (opt.source === 'SYSTEM') {
      rows.push({
        code: opt.code,
        name: opt.name,
        source: 'SYSTEM',
        option: opt,
        group: def?.group ?? opt.group ?? '',
        icon: opt.icon ?? def?.icon ?? undefined,
        color: opt.color ?? def?.color,
        deprecated: !!opt.deprecated,
        deprecateNote: opt.deprecateNote ?? undefined,
        disabled: false,
        scripted: false
      });
    } else {
      // OVERLAY（治理覆盖）与 CUSTOM（库存脚本件）：治理字段一律 DB 正本 → option 同源缓存 → cmp-defs
      const db = dbRows.find((r) => r.componentCode === opt.code);
      if (db?.id != null) {
        matchedDbIds.add(db.id);
      }
      rows.push({
        code: opt.code,
        name: db?.componentName || opt.name,
        source: opt.source,
        option: opt,
        db,
        group: db?.groupName || opt.group || def?.group || '',
        icon: db?.icon || opt.icon || def?.icon || undefined,
        color: db?.color || opt.color || def?.color,
        shortName: db?.shortName || undefined,
        tags: db?.tags ?? undefined,
        deprecated: db ? db.deprecated === '1' : !!opt.deprecated,
        deprecateNote: db?.deprecateNote || opt.deprecateNote || undefined,
        disabled: false,
        scripted: !!db?.scriptBody
      });
    }
  }

  // /options 里没有的 DB 行：停用件。按同码内置是否存在判 OVERLAY/CUSTOM；治理列全部从 db 兜底
  for (const db of dbRows) {
    if (db.id != null && matchedDbIds.has(db.id)) {
      continue;
    }
    const source: ComponentSource = builtinCodes.has(db.componentCode) ? 'OVERLAY' : 'CUSTOM';
    rows.push({
      code: db.componentCode,
      name: db.componentName,
      source,
      db,
      group: db.groupName || '',
      icon: db.icon ?? undefined,
      color: db.color ?? undefined,
      shortName: db.shortName || undefined,
      tags: db.tags ?? undefined,
      deprecated: db.deprecated === '1',
      deprecateNote: db.deprecateNote || undefined,
      disabled: db.status === '1',
      scripted: !!db.scriptBody
    });
  }
  return rows;
}
