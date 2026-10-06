import { nextTick, ref } from 'vue';
import type { ComputedRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { getChain, updateChain } from '@/api/databus/chain';
import type { ChainInputParam, DatabusChainVo } from '@/api/databus/chain/types';
import type { CmpProperty } from '@/api/databus/el/types';
import type { Edge, Node } from '@vue-flow/core';
import type { CmpNodeData, ElTreeModel } from './useElTreeModel';

/**
 * 链路文档状态：当前编辑链路的标识与业务元数据、入参登记表，
 * 以及从链路列表跳入（query.id）/切换器换链的加载、保存、返回动作。
 *
 * 无 query.id 时为独立实验模式（editingId 为 null，不落库）。
 */
export interface ChainDocumentStore {
  treeModel: ElTreeModel;
  getNodes: ComputedRef<Node<CmpNodeData>[]>;
  getEdges: ComputedRef<Edge[]>;
  setNodes: (nodes: Node<CmpNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  /** 加载后取消选中，委托画布控制器 */
  select: (id: string | null) => void;
  /** 加载完成后自动排列，委托画布控制器 */
  autoLayout: () => void;
  /** 重建历史基线，委托历史栈 */
  resetHistory: () => void;
  ensureCanvasHasNodes: () => boolean;
  ensureDataSpacesValid: () => boolean;
}

export function useChainDocument(store: ChainDocumentStore) {
  const {
    treeModel,
    getNodes,
    getEdges,
    setNodes,
    setEdges,
    select,
    autoLayout,
    resetHistory,
    ensureCanvasHasNodes,
    ensureDataSpacesValid
  } = store;

  const route = useRoute();
  const router = useRouter();

  const editingId = ref<number | string | null>(null);
  const chainId = ref('databus_chain_1');
  /** 当前编辑链路的业务元数据（标题展示 + 保存时原样回传，避免丢档位/备注） */
  const chainName = ref('');
  const logLevel = ref('BASIC');
  const remark = ref('');
  const chainSaving = ref(false);

  /** 链路入参登记表（跟链路走；试运行按默认值预填，执行前按必填校验） */
  const inputParams = ref<ChainInputParam[]>([]);
  const inputParamsVisible = ref(false);

  /** 入参登记保存：深拷贝落到编辑器状态（保存链路时随链持久化） */
  function onInputParamsSave(params: ChainInputParam[]) {
    inputParams.value = JSON.parse(JSON.stringify(params));
  }

  /**
   * 按链路主键加载已保存链路到画布：
   * 取 Vo 的 cmpProperty 对象（后端 TypeHandler 已反序列化）→ 载入模型树 →
   * 重投影 → 重建历史基线 → ELK 自动排列。
   */
  async function loadChainToEditor(id: number | string) {
    const { data } = await getChain(id);
    const cmpProperty: CmpProperty | null = data.cmpProperty ?? null;
    if (!cmpProperty) {
      ElMessage.warning('该链路尚未编排内容，画布为空');
    }
    editingId.value = data.id ?? id;
    chainId.value = data.chainCode;
    chainName.value = data.chainName;
    logLevel.value = data.logLevel ?? 'BASIC';
    remark.value = data.remark ?? '';
    inputParams.value = data.inputParams ? JSON.parse(JSON.stringify(data.inputParams)) : [];

    treeModel.loadFromCmpProperty(cmpProperty);
    const { nodes, edges } = treeModel.project();
    setNodes(nodes);
    setEdges(edges);
    select(null);
    nextTick(() => {
      resetHistory();
      // 载入已保存链路同样需要自动排列（投影默认坐标顺序摆放，分支会绕圈）
      autoLayout();
    });
  }

  /**
   * 保存当前画布到链路（不落 EL 到 Rule-DB——发布动作才推规则）。
   * canvasData 存画布 nodes/edges 快照（编辑器还原坐标用），cmpProperty 存逻辑树。
   * 保存成功不跳走，用户可继续编排；点左上「返回」回列表。
   */
  async function saveChain() {
    if (!editingId.value) return;
    if (!ensureCanvasHasNodes()) return;
    if (!ensureDataSpacesValid()) return;

    const cmpProperty = treeModel.toCmpProperty();
    if (!cmpProperty) {
      ElMessage.warning('画布上还没有真实组件');
      return;
    }
    const canvasData = JSON.stringify({ nodes: getNodes.value, edges: getEdges.value });

    chainSaving.value = true;
    try {
      await updateChain({
        id: editingId.value,
        chainCode: chainId.value,
        chainName: chainName.value,
        cmpProperty,
        canvasData,
        logLevel: logLevel.value,
        inputParams: inputParams.value,
        remark: remark.value
      });
      ElMessage.success('链路已保存');
    } finally {
      chainSaving.value = false;
    }
  }

  /**
   * 从切换器选中链路：加载到画布，并把新链路 id 同步进地址栏。
   * URL 同步是父组件层行为（切换器本身只抛 select，不感知路由）：
   * - 加载成功后才改地址栏，失败不换 id；
   * - replace 不堆历史（换链不是新页面，避免浏览器返回键在同一编辑器里退链）；
   * - 基于现有 query 合并，只动 id；
   * - initFromRoute 仅在进入时执行一次，replace 不会触发二次加载。
   */
  async function onChainSelect(row: DatabusChainVo) {
    if (!row.id) return;
    await loadChainToEditor(row.id);
    await router.replace({ query: { ...route.query, id: String(row.id) } });
  }

  /** 返回链路列表（动态解析列表路由，与编排跳转同款，不硬编码父级路径） */
  function backToList() {
    const target = router.getRoutes().find(
      r => r.path.endsWith('/chain') && r.path.includes('databus')
    );
    if (target) {
      router.push(target.path);
    } else {
      router.back();
    }
  }

  /**
   * 从链路列表「编排」跳入时按 query.id 加载已保存链路。
   * 保持字符串原样传递：19 位雪花 id 超出 Number 安全整数，转数字会精度丢失查不到链。
   */
  function initFromRoute() {
    const idParam = route.query.id;
    if (idParam !== undefined && idParam !== null && idParam !== '') {
      void loadChainToEditor(String(idParam));
    }
  }

  return {
    editingId,
    chainId,
    chainName,
    logLevel,
    remark,
    chainSaving,
    inputParams,
    inputParamsVisible,
    onInputParamsSave,
    loadChainToEditor,
    saveChain,
    onChainSelect,
    backToList,
    initFromRoute
  };
}
