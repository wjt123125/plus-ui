<!--
  领域通用控件：链路选择（全 databus 唯一的 el-select 形态链路选择器）。
  数据源走 useChainOptions 共享缓存（会话单飞，失败切走再切回可重试）。

  可配置要点：
  - valueKey：选中值用表主键 id（执行场景）还是 chainCode（CHAIN 引用，Rule-DB 身份），默认 chainCode；
  - status：按状态过滤（'1' 仅已发布等），不传=全部状态；
  - includeTemplate：默认只列普通链（模板恒草稿不可发布，运行时永远无法被引用）；
  - excludeId：按表主键排除（CHAIN 引用时排除当前编辑链，防直接递归）；
  - showStatusTag：候选项右侧状态徽标（执行弹窗只选已发布时可关）；
  - openable：右侧加「新窗口打开」按钮（默认关）。开窗行为内聚在本件：选中真实候选才可点，
    点击按子链表主键 id 解析编辑器路由，用命名窗口 databus_chain_<chainCode> 打开完整编辑器
    （同子链复用窗口、独立 JS 上下文不影响调用方未保存状态），使用方只加 openable 即可。
  - 选中值不在候选（被删/转模板/状态不符/排除自身）时自动补一条只读项把值露出来。
  不支持 allow-create 自由输入：执行记录页那种编码片段 LIKE 筛选是筛选器，语义不同，勿用本件。
-->
<template>
  <div class="chain-select">
  <el-select
    class="chain-select__select"
    :model-value="modelValue ?? ''"
    :placeholder="placeholder"
    :disabled="disabled"
    :loading="loading"
    :clearable="clearable"
    filterable
    style="width: 100%"
    @update:model-value="onValueChange"
  >
    <el-option
      v-for="opt in options"
      :key="String(opt.id)"
      :label="optionLabel(opt)"
      :value="optValue(opt)"
    >
      <span>{{ opt.chainName }}</span>
      <el-tag
        v-if="showStatusTag"
        size="small"
        :type="STATUS_TAG[opt.status ?? ''] ?? 'info'"
        effect="plain"
        class="chain-select__status"
      >
        {{ STATUS_TEXT[opt.status ?? ''] ?? '未知' }}
      </el-tag>
      <span class="chain-select__code">#{{ opt.chainCode }}</span>
    </el-option>
    <!-- 当前值不在候选：补只读项，避免下拉显示空白编码让人以为丢了选择 -->
    <el-option
      v-if="missing"
      :label="missingLabel"
      :value="missingValue"
      disabled
    >
      <span>{{ missingLabel }}</span>
      <span class="chain-select__code">当前选择已不可选，请重选</span>
    </el-option>
    <template #empty>
      <span class="chain-select__empty">{{ failed ? '链路列表加载失败，请切走再切回重试' : '暂无可选链路' }}</span>
    </template>
  </el-select>
  <el-tooltip
    v-if="openable"
    content="新窗口打开该链路"
    placement="top"
    :show-after="300"
  >
    <span class="chain-select__open-wrap">
      <el-button
        class="chain-select__open"
        :disabled="disabled || !selectedOption"
        @click="onOpenClick"
      >
        <el-icon><TopRight /></el-icon>
      </el-button>
    </span>
  </el-tooltip>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElButton, ElIcon, ElMessage, ElOption, ElSelect, ElTag, ElTooltip } from 'element-plus';
import { TopRight } from '@element-plus/icons-vue';
import type { DatabusChainQuery, DatabusChainVo } from '@/api/databus/chain/types';
import { useChainOptions } from '../../composables/useChainOptions';

defineOptions({ name: 'ChainSelect' });

type SelectValue = string | number;

const props = withDefaults(
  defineProps<{
    /** 当前选中值：语义随 valueKey（chainCode 或 id） */
    modelValue?: SelectValue | null;
    /** 值语义：chainCode=Rule-DB 链路编码（默认）；id=表主键 */
    valueKey?: 'chainCode' | 'id';
    /** 状态精确过滤（0草稿 1已发布 2已下线）；不传=全部 */
    status?: string;
    /** 是否包含精选模板，默认 false（只列普通链） */
    includeTemplate?: boolean;
    /** 排除的表主键 id（防自引用场景） */
    excludeId?: string | number | null;
    placeholder?: string;
    disabled?: boolean;
    clearable?: boolean;
    /** 候选项是否显示状态徽标 */
    showStatusTag?: boolean;
    /** 是否显示「新窗口打开」按钮（CHAIN 子流程查看场景，默认关） */
    openable?: boolean;
  }>(),
  {
    valueKey: 'chainCode',
    includeTemplate: false,
    excludeId: null,
    placeholder: '选择链路',
    disabled: false,
    clearable: true,
    showStatusTag: true,
    openable: false
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: SelectValue): void;
  (e: 'change', value: SelectValue): void;
}>();

const STATUS_TEXT: Record<string, string> = { '0': '草稿', '1': '已发布', '2': '已下线' };
const STATUS_TAG: Record<string, 'success' | 'info' | 'warning'> = {
  '0': 'info',
  '1': 'success',
  '2': 'warning'
};

const query = computed<DatabusChainQuery>(() => ({
  pageNum: 1,
  pageSize: 1000,
  ...(props.status ? { status: props.status } : {}),
  // isTemplate：不传=不过滤；默认只看普通链显式传 '0'
  ...(props.includeTemplate ? {} : { isTemplate: '0' })
}));

const { chains, loading, failed, ensure } = useChainOptions(() => query.value);

const router = useRouter();

/** 挂载首拉是否已结束：refresh 与其并发时复用单飞，避免首次打开弹两条请求 */
let firstLoadSettled = false;

onMounted(() => {
  ensure()
    .catch(() => {
      /* failed 已在 composable 标记，empty 槽给重试提示 */
    })
    .finally(() => {
      firstLoadSettled = true;
    });
});

/** 排除自身后的候选 */
const options = computed<DatabusChainVo[]>(() => {
  const exclude = props.excludeId != null ? String(props.excludeId) : '';
  return chains.value.filter((c) => !exclude || String(c.id ?? '') !== exclude);
});

function optValue(opt: DatabusChainVo): SelectValue {
  return props.valueKey === 'id' ? (opt.id ?? '') : opt.chainCode;
}

function optionLabel(opt: DatabusChainVo): string {
  return `${opt.chainName} #${opt.chainCode}`;
}

/** 当前值在候选中找不到时（被删/转模板/状态不符/排除自身）补的只读项 */
const missing = computed<DatabusChainVo | null>(() => {
  const val = props.modelValue;
  if (val === undefined || val === null || val === '') return null;
  const hit = options.value.some((o) => String(optValue(o)) === String(val));
  if (hit) return null;
  // 未过滤的全量缓存里可能还能找到名字（如被状态过滤/排除自身），尽量给可读展示
  const raw = chains.value.find((o) => String(optValue(o)) === String(val));
  // 彻底找不到：伪造行必须带上当前值对应的键，否则 disabled option 的 value 对不上无法回显
  return (
    raw ??
    (props.valueKey === 'id'
      ? { id: val, chainCode: String(val), chainName: String(val) }
      : { chainCode: String(val), chainName: String(val) })
  );
});

const missingValue = computed<SelectValue>(() =>
  missing.value ? optValue(missing.value) : ''
);
const missingLabel = computed(() =>
  missing.value ? optionLabel(missing.value) : ''
);

function onValueChange(val: SelectValue) {
  // clearable 清空时 el-select 给空串
  emit('update:modelValue', val ?? '');
  emit('change', val ?? '');
}

/**
 * 当前值对应的真实候选（从未过滤缓存里找，状态过滤/排除自身场景仍能开窗）。
 * 找不到（值为空/已删除/伪造只读项）返回 null，按钮据此置灰。
 */
const selectedOption = computed<DatabusChainVo | null>(() => {
  const val = props.modelValue;
  if (val === undefined || val === null || val === '') return null;
  return chains.value.find((o) => String(optValue(o)) === String(val)) ?? null;
});

/**
 * 新浏览器窗口打开选中链路的完整编辑器：
 * - 编辑器为隐藏菜单，按 path 约定（endsWith /editor 且含 databus）动态解析，不硬编码；
 * - 窗口名按 chainCode，同一链路复用已开窗口；独立窗口不影响调用方（弹窗/未保存画布）。
 */
function onOpenClick() {
  const opt = selectedOption.value;
  if (!opt?.id) return;
  const target = router.getRoutes().find((r) => r.path.endsWith('/editor') && r.path.includes('databus'));
  if (!target) {
    ElMessage.error('未找到编辑器路由，请确认编辑器隐藏菜单已加载（重新登录后重试）');
    return;
  }
  const href = router.resolve({ path: target.path, query: { id: String(opt.id) } }).href;
  window.open(href, `databus_chain_${opt.chainCode}`);
}

/**
 * 强制重拉（弹窗每次打开等需要最新列表的场景用；普通挂载走缓存）。
 * 与挂载首拉并发时复用同一条在飞请求，之后再调才真正强刷。
 */
defineExpose({
  refresh: () => (firstLoadSettled ? ensure(true) : ensure())
});
</script>

<style scoped>
.chain-select {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.chain-select__select {
  flex: 1;
  min-width: 0;
}

.chain-select__open-wrap {
  /* el-tooltip 包裹 disabled 按钮时需要非禁用元素承接 hover/focus 事件 */
  display: inline-flex;
  flex-shrink: 0;
}

.chain-select__open {
  padding-left: 8px;
  padding-right: 8px;
}

.chain-select__status {
  margin-left: 8px;
}

.chain-select__code {
  margin-left: 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.chain-select__empty {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
