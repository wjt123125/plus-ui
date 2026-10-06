/**
 * 组件插入推荐的融合层（弹窗与未来其他入口共用）。
 *
 * 三路信号，职责分明：
 * 1. 本地规则（cmp-recommend 纯函数）：候选全集、合法性过滤、结构类基线分；
 * 2. 后端远程分（种子经验 + 全员真账，/databus/editor/recommend）：有信号即覆盖本地分，
 *    请求失败静默退回纯本地，弹窗绝不因推荐服务不可用而打不开；
 * 3. 个人频次（localStorage）：同一前置下自己常用的组件小幅抬分（每次 +10、封顶 +30），
 *    只影响接近项之间的先后。
 *
 * replace 场景不拉远程：同类互转（THEN↔WHEN、IF↔SWITCH）本地规则已足够准，
 * 真账/种子在该场景也没有额外信息量。
 *
 * 排序稳定性：map 阶段保留本地规则的原始顺序（分数降序 + 物料分组序），
 * 融合后仅按分数稳定排序，同分时原始顺序不被打乱（JS sort 规范保证稳定）。
 */
import { computed, ref, watch } from 'vue';
import { fetchCmpRecommend, reportCmpPick } from '@/api/databus/recommend';
import { materialTick, type CmpDef } from '../cmp-defs';
import { getRecommendations } from '../cmp-recommend';
import type { PickerMode } from './useCanvasController';

const FREQ_STORAGE_KEY = 'databus:cmp-pick-freq';
/** 个人频次每次使用的抬分与封顶：3 次即吃满，只在接近项间起决定作用 */
const PERSONAL_BOOST_PER_USE = 10;
const PERSONAL_BOOST_CAP = 30;
/**
 * 远程在线但某组件无任何信号时的兜底分。
 * 必须低于远程通用基线（70）：否则本地规则给业务组件的 75 高保分会把远程
 * 认定的高频后继压下去，推荐位退化为「所有业务组件并列」。
 * 取 60 让无信号组件在 tab 列表内仍有序可见，但不抢推荐区（门槛 75，
 * 个人频次 2 次后 +20 可进入，新组件靠真账自然上位）。
 */
const REMOTE_FALLBACK_SCORE = 60;

/** 结构：{ [`${anchor ?? 'ANY'}|${mode}`]: { [pickedType]: count } } */
type FreqMap = Record<string, Record<string, number>>;

let freqCache: FreqMap | null = null;

function loadFreq(): FreqMap {
  if (freqCache) return freqCache;
  try {
    freqCache = JSON.parse(localStorage.getItem(FREQ_STORAGE_KEY) || '{}') as FreqMap;
  } catch {
    freqCache = {};
  }
  return freqCache;
}

function saveFreq() {
  try {
    localStorage.setItem(FREQ_STORAGE_KEY, JSON.stringify(loadFreq()));
  } catch {
    /* 隐私模式/存储满：个人频次静默失效，不影响主流程 */
  }
}

function freqBucket(anchorDefType: string | null, mode: PickerMode): Record<string, number> {
  const map = loadFreq();
  const key = `${anchorDefType ?? 'ANY'}|${mode}`;
  return map[key] ?? {};
}

function bumpLocalFreq(mode: PickerMode, anchorDefType: string | null, pickedType: string) {
  const map = loadFreq();
  const key = `${anchorDefType ?? 'ANY'}|${mode}`;
  const bucket = map[key] ?? {};
  bucket[pickedType] = (bucket[pickedType] ?? 0) + 1;
  map[key] = bucket;
  saveFreq();
}

/**
 * 上报一次真实选择：本地频次立即 +1（下次打开弹窗即生效），
 * 后端真账 fire-and-forget，失败不打扰画布操作。
 */
export function recordCmpPick(
  mode: PickerMode,
  anchorDefType: string | null,
  pickedType: string
) {
  bumpLocalFreq(mode, anchorDefType, pickedType);
  reportCmpPick({ mode, anchorType: anchorDefType, pickedType }).catch(() => {});
}

export function useCmpRecommend(
  getMode: () => PickerMode,
  getAnchor: () => string | null,
  getExcluded: () => string[]
) {
  const mode = computed(getMode);
  const anchor = computed(getAnchor);
  const excluded = computed(getExcluded);

  /** 后端信号：type → 融合分 */
  const remoteScores = ref<Record<string, number>>({});
  /**
   * 远程是否主导排序：replace 模式 / 请求失败 / 后端零信号时为 false，
   * 排序完全退回本地结构规则；true 时无信号组件只给兜底分，排序权归后端。
   */
  const remoteActive = ref(false);
  let requestSeq = 0;

  async function loadRemote() {
    if (mode.value === 'replace') {
      remoteScores.value = {};
      remoteActive.value = false;
      return;
    }
    const seq = ++requestSeq;
    try {
      // request 拦截器 resolve 的是 R 包装体 { code, msg, data }，载荷在 data
      const resp = await fetchCmpRecommend({
        mode: mode.value,
        anchorType: anchor.value,
        excludedTypes: excluded.value
      });
      const list = resp?.data ?? [];
      // 弹窗快速重开时只认最后一次请求的结果，防旧响应覆盖新状态
      if (seq !== requestSeq) return;
      remoteScores.value = Object.fromEntries(list.map((item) => [item.type, item.score]));
      // ANY 通用基线保证非 replace 场景正常情况下总有信号；万一为空则不接管排序
      remoteActive.value = list.length > 0;
    } catch {
      if (seq === requestSeq) {
        remoteScores.value = {};
        remoteActive.value = false;
      }
    }
  }

  // 弹窗组件每次打开都重新挂载（Popover v-if），immediate 即覆盖首拉
  watch([mode, anchor, excluded], loadRemote, { immediate: true });

  const scoredAll = computed(() => {
    // 依赖物料合流滴答：/options 覆盖/追加 CMP_DEFS 后重算候选全集
    materialTick.value;
    const local = getRecommendations(mode.value, anchor.value, excluded.value);
    const freq = freqBucket(anchor.value, mode.value);
    return local
      .map(({ def, score }) => {
        // 远程主导：有信号用远程分，无信号统一兜底（不再吃本地 75 高保底）；
        // 远程缺席：完整使用本地结构规则分，保证离线/后端故障时弹窗质量不退
        const base =
          remoteActive.value
            ? (remoteScores.value[def.type] ?? REMOTE_FALLBACK_SCORE)
            : score;
        const boost = Math.min(
          PERSONAL_BOOST_CAP,
          (freq[def.type] ?? 0) * PERSONAL_BOOST_PER_USE
        );
        return { def, score: base + boost } satisfies { def: CmpDef; score: number };
      })
      .toSorted((a, b) => b.score - a.score);
  });

  /**
   * 推荐区入选门槛：远程主导时 68（放进 70 分通用基线，挡住 60 分无信号兜底）；
   * 远程缺席时 75（本地规则量纲：业务/同算子档）。
   */
  const recommendCutoff = computed(() => (remoteActive.value ? 68 : 75));

  return { scoredAll, recommendCutoff };
}
