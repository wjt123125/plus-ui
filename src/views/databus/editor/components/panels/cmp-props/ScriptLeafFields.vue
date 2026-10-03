<!--
  脚本节点（script/booleanScript）专用表单：数据空间 + language 下拉 + 脚本文本。
  language/script 与叶子 data（JSON 字符串）同源；布尔脚本必须 return true/false。
-->
<template>
  <el-form label-position="top" size="small" class="cmp-leaf__form">
    <ConditionLeafBadge v-if="ctx.isConditionLeaf.value" />
    <DataSpaceField
      placeholder="如 script1（字母开头，字母数字下划线）"
      script-hint
      @data-change="emit('data-change')"
    />
    <el-form-item label="语言 language">
      <el-select
        v-model="language"
        placeholder="无可用引擎时手填 groovy"
        filterable
        allow-create
        default-first-option
        style="width: 100%"
        @change="onFieldChange"
      >
        <el-option v-for="lang in engines" :key="lang" :label="lang" :value="lang" />
      </el-select>
      <div v-if="engines.length === 0" class="cmp-field__hint">
        后端未装任何脚本引擎 jar，可手填语言名（如 groovy）但试运行会报错
      </div>
    </el-form-item>
    <el-form-item label="脚本 script">
      <el-input
        v-model="script"
        type="textarea"
        :rows="10"
        placeholder="def v = databusContext.read('$.request.code'); databusContext.save('$.script1.out', v)"
        @change="onFieldChange"
      />
      <div class="cmp-field__hint">
        Groovy 语法；布尔脚本必须 return true/false；可直接调任意 Java/hutool 类
      </div>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { ElForm, ElFormItem, ElInput, ElOption, ElSelect } from 'element-plus';
import { listScriptEngines } from '@/api/databus/script';
import { useElTreeModelInject } from '../../../composables/useElTreeModel';
import ConditionLeafBadge from './ConditionLeafBadge.vue';
import DataSpaceField from './DataSpaceField.vue';
import { usePropsContext } from './usePropsContext';

defineOptions({ name: 'ScriptLeafFields' });

const emit = defineEmits<{ (e: 'data-change'): void }>();

const ctx = usePropsContext();
const treeModel = useElTreeModelInject();

const language = ref('');
const script = ref('');
const engines = ref<string[]>([]);

onMounted(async () => {
  try {
    const res = await listScriptEngines();
    engines.value = (res.data ?? [])
      .map((e) => e.language ?? '')
      .filter((lang) => !!lang);
  } catch {
    // 接口未部署/未登录时静默：用户可手填语言名，试运行时由后端报错
    engines.value = [];
  }
});

// 切节点即重建；immediate 从 data JSON 解析 language/script，非法 JSON 给空值
watch(
  () => [ctx.elNode.value?.id, ctx.elNode.value?.data] as const,
  () => {
    const parsed = parseCfg(ctx.elNode.value?.data);
    language.value = parsed.language;
    script.value = parsed.script;
  },
  { immediate: true }
);

/** 解析 data 为 {language, script}；非 JSON 或缺字段返回空串 */
function parseCfg(data?: string): { language: string; script: string } {
  if (!data) return { language: '', script: '' };
  try {
    const obj = JSON.parse(data) as { language?: string; script?: string };
    return {
      language: typeof obj.language === 'string' ? obj.language : '',
      script: typeof obj.script === 'string' ? obj.script : ''
    };
  } catch {
    return { language: '', script: '' };
  }
}

/** 任意字段变更：序列化为 JSON 写回 ElNode.data 并重投影 */
function onFieldChange() {
  const n = ctx.elNode.value;
  if (!n) return;
  const lang = language.value.trim();
  const text = script.value;
  const cfg: Record<string, string> = {};
  if (lang) cfg.language = lang;
  if (text) cfg.script = text;
  const json = Object.keys(cfg).length > 0 ? JSON.stringify(cfg) : '';
  treeModel.updateLeafData(n.id, { data: json });
  emit('data-change');
}
</script>

<style scoped>
.cmp-leaf__form {
  margin-top: 4px;
}

.cmp-field__hint {
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}
</style>
