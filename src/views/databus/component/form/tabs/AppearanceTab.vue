<!-- ② 外观 Tab：面板分组/业务域/图标/颜色/排序/标签 -->
<template>
  <el-tab-pane name="appearance">
    <el-form-item label="面板分组">
      <el-select v-model="form.groupName" placeholder="未分组" clearable style="width: 100%">
        <el-option v-for="g in groups" :key="g.key" :label="g.label" :value="g.key" />
      </el-select>
    </el-form-item>
    <!-- 业务域：只有 business 组的叶子有域概念，其余六组恒无 -->
    <el-form-item v-if="showDomain" label="业务域">
      <el-select
        v-model="domainValue"
        :placeholder="`空＝兜底域（${defaultDomainKey}）`"
        clearable
        :disabled="domainLocked"
        style="width: 100%"
      >
        <el-option v-for="d in domainOptions" :key="d.key" :label="d.label" :value="d.key" />
      </el-select>
      <div v-if="domainLocked" class="cf-hint">
        条件位（节点类型 ≠ 普通节点）固定归「{{ slotDomainLabel }}」，不可改。
      </div>
    </el-form-item>
    <el-form-item label="图标" prop="icon" :rules="iconRules">
      <PhIconPicker v-model="iconValue" />
    </el-form-item>
    <el-form-item label="面板颜色">
      <div class="cf-color">
        <el-color-picker v-model="form.color" color-format="hex" />
        <button
          v-for="c in COLOR_PRESETS"
          :key="c"
          type="button"
          class="cf-color__swatch"
          :style="{ backgroundColor: c }"
          :title="c"
          @click="form.color = c"
        />
        <el-button link type="info" size="small" @click="form.color = ''">清空</el-button>
      </div>
    </el-form-item>
    <el-form-item label="排序（数值越小越靠前）">
      <el-input
        :model-value="form.sort == null ? '' : String(form.sort)"
        placeholder="100"
        @update:model-value="handleSortUpdate"
      />
    </el-form-item>
    <el-form-item label="标签（可输入新建，回车添加）">
      <el-select
        v-model="form.tags"
        multiple
        filterable
        allow-create
        default-first-option
        collapse-tags
        collapse-tags-tooltip
        placeholder="如 HTTP、MES、回写"
        style="width: 100%"
      >
        <el-option v-for="t in tagSuggestions" :key="t" :label="t" :value="t" />
      </el-select>
    </el-form-item>
  </el-tab-pane>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import type { FormItemRule } from 'element-plus';
import { useComponentTaxonomy } from '../../../editor/composables/useComponentTaxonomy';
import { usePhIcons } from '../../../editor/composables/usePhIcons';
import type { ComponentFormModel } from '../form.types';
import PhIconPicker from './PhIconPicker.vue';

defineOptions({ name: 'AppearanceTab' });

const COLOR_PRESETS = [
  '#409eff',
  '#67c23a',
  '#e6a23c',
  '#f56c6c',
  '#909399',
  '#9b59b6',
  '#1abc9c',
  '#165dff'
];

/** 条件位域名（后端按 node_type ≠ NODE 派生，见元数据设计文档 §2.3） */
const SLOT_DOMAIN_KEY = 'slot';

const props = defineProps<{
  form: ComponentFormModel;
  tagSuggestions: string[];
}>();

// 分组/业务域字典（模块级会话缓存，多个面板同时挂载只发一个请求）
const { groups, domains, defaultDomainKey, ensureTaxonomy } = useComponentTaxonomy();
onMounted(() => {
  void ensureTaxonomy();
});

const { hasPhIcon } = usePhIcons();

/** PhIconPicker 要求 string 入参，空值归一为空串 */
const iconValue = computed({
  get: () => props.form.icon ?? '',
  set: (v: string) => {
    props.form.icon = v || null;
  }
});

/**
 * icon 白名单（refactor §4.2）：值必须 `ph:` 前缀且存在于已加载的 ph 全集，
 * 校验复用选择器的同一份 chunk，不另存名单文件。
 * 挂在 el-form-item 局部 rules 上（FormPane 的 form 级 rules 只管编码/名称/分类），
 * 失败字段由 TAB_OF 映射到本 tab 挂红点。
 */
const iconRules: FormItemRule[] = [
  {
    // 回调式（非 async 函数）：async-validator 的 validator 类型只收同步返回，
    // 异步结果一律走 callback；hasPhIcon 内部已吞掉加载失败，不会 reject。
    validator: (_rule, value: string, callback) => {
      if (!value) {
        callback();
        return;
      }
      void hasPhIcon(value).then((ok) => {
        if (ok) {
          callback();
        } else {
          callback(new Error('图标须为 ph: 前缀且存在于 Phosphor 图标集'));
        }
      });
    },
    trigger: 'change'
  }
];

const showDomain = computed(() => props.form.groupName === 'business');

/** 库存脚本件：契约全量取 DB，node_type 由 param_schema 自定义，无法静态判定 → 三行全可选 */
const scripted = computed(() => !!props.form.scriptBody?.trim());

/** 条件位（node_type ≠ NODE）：必然进条件组件段，锁定 slot 不可改 */
const domainLocked = computed(
  () => !scripted.value && !!props.form.nodeType && props.form.nodeType !== 'NODE'
);

/** 普通叶子（node_type = NODE）剔除 slot：进条件段等于承诺一个它兑现不了的行为 */
const domainOptions = computed(() =>
  scripted.value || domainLocked.value
    ? domains.value
    : domains.value.filter((d) => d.key !== SLOT_DOMAIN_KEY)
);

const slotDomainLabel = computed(
  () => domains.value.find((d) => d.key === SLOT_DOMAIN_KEY)?.label ?? '条件组件'
);

const domainValue = computed({
  get: () => (domainLocked.value ? SLOT_DOMAIN_KEY : props.form.domain ?? ''),
  set: (v: string) => {
    props.form.domain = v || null;
  }
});

// 入口一致性：锁定态把 slot 落到值上（disabled 的用户改不动，保存即修复历史矛盾数据）；
// 解锁为普通叶子时清掉不可选的 slot，避免造出「在条件段但拖不进条件槽」的件。
watch(
  [domainLocked, () => props.form.domain],
  ([locked, current]) => {
    if (!showDomain.value) {
      return;
    }
    if (locked && current !== SLOT_DOMAIN_KEY) {
      props.form.domain = SLOT_DOMAIN_KEY;
    } else if (!locked && !scripted.value && current === SLOT_DOMAIN_KEY) {
      props.form.domain = null;
    }
  },
  { immediate: true }
);

/** 排序输入：空串/非数字归 undefined，让后端兜底默认值 */
function handleSortUpdate(value: string) {
  if (value === '') {
    props.form.sort = undefined;
    return;
  }
  const num = Number(value);
  props.form.sort = Number.isNaN(num) ? undefined : num;
}
</script>

<style lang="scss" scoped>
@use './shared.scss';

.cf-color {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  &__swatch {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    cursor: pointer;
    padding: 0;
    transition: transform 0.15s;

    &:hover {
      transform: scale(1.12);
    }
  }
}
</style>
