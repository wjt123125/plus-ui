/**
 * 物料市场展示层共享件（市场 tab MarketPane / 物料管理 tab MarketManagePane 共用）。
 * 住在这里的只有两类东西：
 *   1. 翻译类纯函数——图标、上架状态标签、连接器 def 状态/来源标签、类型分组标签与顺序。
 *      拆 tab 前它们是 MarketPane 的内部函数，拆成两个面板后两边都要用，留一份在此，
 *      免得各写各的、日后改一处漏一处（两份 STATUS_META 已经在这个目录里出现过）。
 *   2. 连接器 def 行的模块级共享单例。市场卡片的「启用/停用」按钮态与管理页连接器治理行
 *      读的是同一份数据；两个 tab 会同时开着，各存一份就会出现「市场页刚点了启用、
 *      管理页那行还写着未启用」这种对不上的场面。
 */
import { ref } from 'vue';
import type { ConnectorDefVo } from '@/api/databus/connector/types';
import { listConnectorDefs } from '@/api/databus/connector';
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

/** 已装台账行图标（安装记录里没有连接器：连接器不写 install 台账，故只需分链路/组件） */
export function rowIcon(row: DatabusMarketInstallVo): string {
  return row.resourceType === 'CHAIN' ? 'lucide:spline' : row.icon || 'lucide:box';
}

/* ---------------- 标签翻译 ---------------- */

/** 上架状态标签映射 */
const STATUS_META: Record<MarketItemStatus, { label: string; type: 'primary' | 'success' | 'warning' | 'danger' | 'info' }> = {
  DRAFT: { label: '草稿', type: 'info' },
  PENDING: { label: '待审核', type: 'warning' },
  APPROVED: { label: '已通过', type: 'primary' },
  REJECTED: { label: '已驳回', type: 'danger' },
  ONLINE: { label: '已上架', type: 'success' },
  OFFLINE: { label: '已下架', type: 'info' }
};
export function statusMeta(status: MarketItemStatus) {
  return STATUS_META[status] ?? { label: status, type: 'info' as const };
}

/** 连接器 def 状态标签映射 */
const CONNECTOR_STATUS_META: Record<ConnectorDefVo['status'], { label: string; type: 'success' | 'warning' | 'info' }> = {
  INACTIVE: { label: '未启用', type: 'info' },
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
 * 连接器版本展示标签：DEV 行的 version 是后端给的字面量 'dev'（占位，非 semver），
 * 拼 v 前缀会出来「vdev」这种 nonsense，故 dev 原样返回；其余按 semver 惯例拼 v。
 * 空串返回空串，由调用方自己兜底「—」（各处兜底文案不同，不在此写死）。
 */
export function versionLabel(version?: string | null): string {
  if (!version) {
    return '';
  }
  return version === 'dev' ? version : `v${version}`;
}

/** 平铺分组标签与固定顺序（组件 → 链路 → 连接器） */
export const TYPE_LABELS: Record<MarketResourceType, string> = { COMPONENT: '组件', CHAIN: '链路', CONNECTOR: '连接器' };
export const TYPE_ORDER: MarketResourceType[] = ['COMPONENT', 'CHAIN', 'CONNECTOR'];

/* ---------------- 连接器 def 行共享单例（§15.7 运行层） ---------------- */

/** def 视图（零内置，只查 def 行）：市场卡片启停匹配、管理页治理行列表共用同一份 */
export const connectorDefs = ref<ConnectorDefVo[]>([]);

/**
 * 拉 def 行。无 connector:list 权限时置空返回（后端 403，前端按权限串不调用）。
 * 权限判定在函数体内取 store：模块加载时 pinia 还没激活，写在模块顶层会炸。
 */
export async function loadConnectorDefs(): Promise<void> {
  const canList = useUserStore().permissions.some((p: string) => p === '*:*:*' || p === 'databus:connector:list');
  if (!canList) {
    connectorDefs.value = [];
    return;
  }
  try {
    const { data } = await listConnectorDefs();
    connectorDefs.value = data ?? [];
  } catch {
    /* 拦截器已提示；置空保持空态 */
    connectorDefs.value = [];
  }
}
