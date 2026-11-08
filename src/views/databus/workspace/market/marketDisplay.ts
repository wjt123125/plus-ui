/**
 * 物料市场展示层共享件（市场 tab MarketPane / 物料管理 tab MarketManagePane 共用）。
 * 住在这里的只有两类东西：
 *   1. 翻译类纯函数——图标、上架状态标签、连接器 def 状态/来源标签、类型分组标签与顺序。
 *      拆 tab 前它们是 MarketPane 的内部函数，拆成两个面板后两边都要用，留一份在此，
 *      免得各写各的、日后改一处漏一处（两份 STATUS_META 已经在这个目录里出现过）。
 *   2. 连接器 def 行的模块级共享单例。市场卡片只读它做运行态提示（已废弃 / 缺驱动 / 未装载），
 *      管理页连接器治理行读它拿启停状态与治理动作；两个 tab 会同时开着，各存一份就会出现
 *      「治理页刚点了启用、市场卡片还挂旧状态」这种对不上的场面。
 */
import { ref } from 'vue';
import type { ConnectorDefVo } from '@/api/databus/connector/types';
import { listConnectorDefs, listMyConnectorDefs } from '@/api/databus/connector';
import type {
  DatabusMarketInstallVo,
  DatabusMarketItemVo,
  MarketItemStatus,
  MarketResourceType
} from '@/api/databus/market/types';
import { useUserStore } from '@/store/modules/user';

/* ---------------- 图标 ---------------- */

/** 物料图标：链路固定，连接器兜底电插头，组件取自带图标 */
export function itemIcon(it: DatabusMarketItemVo): string {
  if (it.resourceType === 'CHAIN') {
    return 'lucide:spline';
  }
  if (it.resourceType === 'CONNECTOR') {
    return it.icon || 'lucide:plug';
  }
  return it.icon || 'lucide:box';
}

/** 已装台账行图标：链路固定，组件/连接器取物料自带图标，缺省用盒子 */
export function rowIcon(row: DatabusMarketInstallVo): string {
  return row.resourceType === 'CHAIN' ? 'lucide:spline' : row.icon || 'lucide:box';
}

/* ---------------- 标签翻译 ---------------- */

/** 上架状态标签映射 */
const STATUS_META: Record<MarketItemStatus, { label: string; type: 'primary' | 'success' | 'warning' | 'danger' | 'info' }> = {
  PENDING: { label: '待审核', type: 'warning' },
  REJECTED: { label: '已驳回', type: 'danger' },
  ONLINE: { label: '已上架', type: 'success' },
  OFFLINE: { label: '已下架', type: 'info' }
};
export function statusMeta(status: MarketItemStatus) {
  return STATUS_META[status] ?? { label: status, type: 'info' as const };
}

/* ---------------- 行状态圆点（2026-11-03 定） ---------------- */

/** 圆点色调，与 StatusDot 的 tone 对齐 */
export type StatusTone = 'success' | 'warning' | 'danger' | 'info';

/** 行状态：正常态 label 为空串（只画点不写字），异常态才带短词 */
export interface RowStatusMeta {
  tone: StatusTone;
  label: string;
  reason?: string;
}

/** 「我的上架」行状态 → 圆点：已上架绿点不写字，其余带短词 */
const MARKET_ITEM_ROW_STATUS: Record<MarketItemStatus, RowStatusMeta> = {
  PENDING: { tone: 'warning', label: '待审核', reason: '已提交，等待治理审核' },
  REJECTED: { tone: 'danger', label: '已驳回', reason: '审核未通过，按驳回理由修改后可重新提交' },
  ONLINE: { tone: 'success', label: '', reason: '已上架，市场可见' },
  OFFLINE: { tone: 'info', label: '已下架', reason: '已从市场下架，你的源资源不受影响' }
};
export function marketItemRowStatus(status: MarketItemStatus): RowStatusMeta {
  return MARKET_ITEM_ROW_STATUS[status] ?? { tone: 'info', label: status };
}

/**
 * 「已装管理」台账行状态 → 圆点。
 * 链路叠两层：治理态（草稿/已发布/已下线）优先，已发布再看最近一次执行（失败红 / 执行中黄）。
 * 颜色沿用资源树与画布的既有语义：草稿灰、已发布绿、已下线黄。
 */
export function installRowStatus(row: DatabusMarketInstallVo): RowStatusMeta {
  if (row.resourceType === 'CHAIN') {
    if (row.status === 'DRAFT') {
      return { tone: 'info', label: '草稿', reason: '链路副本还是草稿，尚未发布' };
    }
    if (row.status === 'DISABLED') {
      return { tone: 'warning', label: '已下线', reason: '链路已下线，定义保留可重新发布' };
    }
    if (row.health === 'FAILED') {
      return { tone: 'danger', label: '最近执行失败', reason: '最近一次执行失败，打开执行记录查看错误详情' };
    }
    if (row.health === 'RUNNING') {
      return { tone: 'warning', label: '执行中', reason: '最近一次执行仍在进行中' };
    }
    return { tone: 'success', label: '', reason: '链路已发布，最近执行正常' };
  }
  if (row.resourceType === 'COMPONENT') {
    const enabled = row.status ? row.status === 'ENABLED' : row.enabled !== false;
    return enabled
      ? { tone: 'success', label: '', reason: '组件已启用' }
      : { tone: 'info', label: '已停用', reason: '组件已停用，链路引用处按停用处理' };
  }
  return row.enabled === false
    ? { tone: 'info', label: '未启用', reason: '尚未启用' }
    : { tone: 'success', label: '', reason: '连接器已启用，可正常新建连接' };
}

/** 连接器 def 行状态 → 圆点：健康语义沿用 connectorHealthMeta（标签只在 hover 提示里出现） */
export function connectorRowStatus(row?: ConnectorDefVo | null): RowStatusMeta {
  const health = connectorHealthMeta(row);
  return { tone: health.type, label: health.label, reason: health.reason };
}

/** 连接器 def 状态标签映射 */
const CONNECTOR_STATUS_META: Record<ConnectorDefVo['status'], { label: string; type: 'success' | 'warning' | 'info' }> = {
  PENDING: { label: '未启用', type: 'info' },
  ENABLED: { label: '已启用', type: 'success' },
  DISABLED: { label: '已禁用', type: 'warning' },
  DEPRECATED: { label: '已废弃', type: 'info' }
};
export function connectorStatusMeta(status: ConnectorDefVo['status']) {
  return CONNECTOR_STATUS_META[status] ?? { label: status, type: 'info' as const };
}

/**
 * 运行态健康的界面结论（§4.2.1，2026-10-30 定）。
 * status 与 health 是两件事：status 说「治理上该不该跑」，health 说「实际跑起来没有、驱动在不在包里」。
 * 一个 ENABLED 但缺驱动的行，界面上看得见、点上去连不上，正是要暴露的故障，所以两者叠成一个标签。
 */
export interface ConnectorHealthMeta {
  /** 标签文案（治理态优先：没启用就不谈健康） */
  label: string;
  /** 标签色：status≠ENABLED 灰 / ENABLED+OK 绿 / +MISSING_DRIVER 黄 / +NOT_LOADED 红 */
  type: 'success' | 'warning' | 'danger' | 'info';
  /** 不正常时的人话原因，可直接做 title 或行内说明；正常时为空串 */
  reason: string;
  /** 能否用它建连接 / 测连接。重载不看这个位——重载正是把不健康修回健康的动作，永不禁用 */
  usable: boolean;
}

/**
 * def 行 → 健康标签。health 由后端 GET /databus/connector/defs 现算返回（不落库），
 * 老后端不返这个字段时按 OK 处理：那时判据还没上线，不能凭空把可用连接器标成故障。
 */
export function connectorHealthMeta(row?: ConnectorDefVo | null): ConnectorHealthMeta {
  if (!row) {
    return { label: '无台账行', type: 'info', reason: '运行台账里没有这个连接器，先上传并启用连接器包', usable: false };
  }
  if (row.status !== 'ENABLED') {
    const st = connectorStatusMeta(row.status);
    return { label: st.label, type: 'info', reason: `连接器${st.label}，未在运行；启用后才能建连接`, usable: false };
  }
  if (row.health === 'MISSING_DRIVER') {
    return { label: '缺驱动', type: 'warning', reason: row.healthReason || '包里缺 JDBC 驱动，连接必然失败', usable: false };
  }
  if (row.health === 'NOT_LOADED') {
    return { label: '未装载', type: 'danger', reason: row.healthReason || '运行中没有这个连接器的实例', usable: false };
  }
  return { label: '已启用', type: 'success', reason: '', usable: true };
}

/** 连接器 def 来源标签（§15.3：包的来路）。
 *  ADMIN 只写「官方」不写「管理员」：它是个来路角标，不是特权标记——官方包同样要过审、
 *  同样不因 source 自动带 verified（§1.3），叫「管理员」会让人误读成「这批不用审」。 */
const CONNECTOR_SOURCE_LABEL: Record<ConnectorDefVo['source'], string> = {
  MARKET: '市场安装',
  UPLOAD: '手动上传',
  AI: 'AI 生成',
  ADMIN: '官方',
  DEV: '开发装载'
};
export function connectorSourceLabel(row: ConnectorDefVo): string {
  return CONNECTOR_SOURCE_LABEL[row.source ?? ''] ?? row.source ?? '未知来源';
}

/** 是否开发目录装载的行：这类行的启停、包下载、包查看、提交上架后端一律拒，前端不给入口 */
export function isDevDef(row: ConnectorDefVo): boolean {
  return row.source === 'DEV';
}

/**
 * 连接器版本展示标签：DEV 行与正式包一样展示 manifest 里的真实版本，统一拼 v 前缀。
 * 空串返回空串，由调用方自己兜底「—」（各处兜底文案不同，不在此写死）。
 */
export function versionLabel(version?: string | null): string {
  if (!version) {
    return '';
  }
  return `v${version}`;
}

/** 平铺分组标签与固定顺序（组件 → 链路 → 连接器） */
export const TYPE_LABELS: Record<MarketResourceType, string> = { COMPONENT: '组件', CHAIN: '链路', CONNECTOR: '连接器' };
export const TYPE_ORDER: MarketResourceType[] = ['COMPONENT', 'CHAIN', 'CONNECTOR'];

/** 平铺视角的分组结果（空组已在生成时丢弃，不渲染标题） */
export interface TypeGroup<T> {
  type: MarketResourceType;
  label: string;
  items: T[];
}

/**
 * 平铺视角分组：按关键字过滤 → 按固定类型顺序拆组 → 丢弃空组。
 * fields 由调用方给：同为「搜物料」，「已装管理」搜名称/简介/展示码（展示码由台账接口回填），
 * 「我的上架 / 待审核」还搜 codeDisplay。
 */
export function groupByType<T extends { resourceType?: MarketResourceType }>(
  list: T[],
  keyword: string,
  fields: (keyof T)[]
): TypeGroup<T>[] {
  const k = keyword.trim().toLowerCase();
  const filtered = k ? list.filter((row) => fields.some((f) => String(row[f] ?? '').toLowerCase().includes(k))) : list;
  return TYPE_ORDER.map((type) => ({
    type,
    label: TYPE_LABELS[type],
    items: filtered.filter((row) => row.resourceType === type)
  })).filter((group) => group.items.length > 0);
}

/* ---------------- 连接器 def 行共享单例（§15.7 运行层） ---------------- */

/** def 视图（零内置，只查 def 行）：市场卡片启停匹配、管理页治理行列表共用同一份 */
export const connectorDefs = ref<ConnectorDefVo[]>([]);

/** 上架成功回执：跳到哪个视角 + 要高亮的新物料 id */
export interface MarketPublishedInfo {
  scope: 'mine';
  highlightId?: string | number;
}

/**
 * 待消费的新行高亮 id：上架 pane 成功后由宿主写入，管理 pane 消费一次即清。
 * 只存内存不落盘——「刚提交」是瞬时信号，刷新后不该重放。
 */
export const marketHighlightId = ref<string>();

/**
 * 拉 def 行。无 connector:list 权限时置空返回（后端 403，前端按权限串不调用）。
 * 权限判定在函数体内取 store：模块加载时 pinia 还没激活，写在模块顶层会炸。
 */
export async function loadConnectorDefs(): Promise<void> {
  const permissions = useUserStore().permissions;
  const canList = permissions.some((p: string) => p === '*:*:*' || p === 'databus:connector:list');
  if (!canList) {
    connectorDefs.value = [];
    return;
  }
  // 治理视角（能启停/卸载）看全部 def；上架权限不再放宽成全量——
  // 否则「已装/治理」会变成混着别人未审核 PENDING 包的台账。上架者只看自己装过且已启用的。
  const fullView = permissions.some((p: string) => p === '*:*:*' || p === 'databus:connector:edit');
  try {
    const { data } = fullView ? await listConnectorDefs() : await listMyConnectorDefs();
    connectorDefs.value = data ?? [];
  } catch {
    /* 拦截器已提示；置空保持空态 */
    connectorDefs.value = [];
  }
}
