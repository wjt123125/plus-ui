/**
 * 资源引用的业务动作：复制编码、加入会话、改评论、移除。
 *
 * 只碰暂存区与剪贴板，不认识 hover、计时器、气泡位置；
 * hover 卡与右键菜单等入口都调用这里，避免同一业务散落在各组件里。
 */
import { ElMessage } from 'element-plus';
import { useAgentContext } from './useAgentContext';
import type { AgentContextItem } from './contextTypes';

/** 一个可引用的资源：上下文类型 + 主键/编码 + 展示文案 */
export interface HoverResourceAction {
  /** 上下文类型：chain / component / connector */
  type: string;
  id?: number | string;
  code?: string;
  name: string;
  /** 复制按钮的文案：组件码 / 链路码 / 连接器码 */
  codeLabel: string;
  /** 连接器专用：包定位身份（type + version），点击引用卡时据此打开包详情 */
  connectorType?: string;
  connectorVersion?: string;
  /** 信息区展示的编码；缺省与复制用的 code 相同（画布组件的展示码是 cmpId，复制码是 defType） */
  infoCode?: string;
}

export function useResourceActions() {
  const { addContext, resourceContext, updateNote, removeContext } = useAgentContext();

  /** 复制资源编码：资源为空或没有编码时给出可读提示 */
  async function copyCode(resource: HoverResourceAction | null): Promise<void> {
    if (!resource?.code) {
      ElMessage.warning(`该${resource?.name ?? '资源'}没有可复制的编码`);
      return;
    }
    try {
      await navigator.clipboard.writeText(resource.code);
      ElMessage.success(`已复制${resource.codeLabel}：${resource.code}`);
    } catch {
      ElMessage.error('复制失败，请手动选择文本复制');
    }
  }

  /** 整件资源进暂存区（去重由 addContext 负责），返回真正留在区里的条目 */
  function addToSession(resource: HoverResourceAction): AgentContextItem {
    const stored = addContext(
      resourceContext({
        type: resource.type,
        id: resource.id,
        code: resource.code,
        name: resource.name,
        connectorType: resource.connectorType,
        connectorVersion: resource.connectorVersion
      })
    );
    // 让 AI 栏展开，新卡片当场可见；已有面板的场景这个事件是空操作
    window.dispatchEvent(new Event('databus:reveal-ai'));
    return stored;
  }

  function saveNote(itemId: string, note: string): void {
    if (!itemId) {
      return;
    }
    updateNote(itemId, note.trim());
  }

  function removeFromSession(itemId: string): void {
    if (!itemId) {
      return;
    }
    removeContext(itemId);
  }

  return { copyCode, addToSession, saveNote, removeFromSession };
}
