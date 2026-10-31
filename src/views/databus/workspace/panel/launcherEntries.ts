/**
 * 工作台入口清单（唯一权威）。
 * 两处消费：tab 条「+」下拉（WorkspaceWorkPanel）与零 tab 空态卡（WorkbenchLauncher）。
 * 只收「会真正开 tab」的入口——最近访问 / 我的收藏 / 系统组件是资源树里的常驻节，
 * 用户在右抽屉直接可见，不再当作入口重复投放（2026-10-31 收敛）。
 */
import type { LauncherCommand } from '../workbench.types';

export interface LauncherEntry {
  key: LauncherCommand;
  label: string;
  /** 图标名（必须落在 useLucideSubset 的离线子集内，否则离线环境渲染为空） */
  icon: string;
  /** 图标着色（Trae 同款每卡一色） */
  color: string;
  /** 需要的权限（缺省人人可见） */
  perm?: string[];
  /** 「+」菜单里是否在这一项之前画分隔线（空态卡忽略此字段） */
  dividerBefore?: boolean;
}

export const LAUNCHER_ENTRIES: LauncherEntry[] = [
  // 创作类：新建四合一（2026-10-21 入口收敛，decisions §10，段内在向导里选）
  {
    key: 'new',
    label: '新建',
    icon: 'lucide:file-plus',
    color: '#2DD288',
    perm: ['databus:editor:add', 'databus:component:add', 'databus:directory:add', 'databus:connection:add']
  },
  { key: 'market', label: '物料市场', icon: 'lucide:store', color: '#4F8EF7' },
  // 管理类：与上面两项隔一条分隔线（对齐 Trae 菜单的创作/工具分段）
  { key: 'admin-connection', label: '连接配置', icon: 'lucide:inbox', color: '#22B8CF', dividerBefore: true },
  { key: 'admin-execution', label: '执行记录', icon: 'lucide:clock', color: '#4F8EF7' },
  { key: 'admin-monitor', label: '监控大盘', icon: 'lucide:layout-grid', color: '#A371F7' },
  { key: 'admin-alert', label: '告警记录', icon: 'lucide:circle-alert', color: '#FF8A5B' },
  { key: 'admin-settings', label: '设置', icon: 'lucide:settings', color: '#2DD288' }
];
