<!-- ⑤ 高级 Tab：配置示例/输入输出 schema/文档/废弃标记/备注（JSON 列用 CodeMirror，输入输出默认折叠） -->
<template>
  <el-tab-pane name="advanced">
    <template #label>
      <TabLabel title="高级" :invalid="invalid" />
    </template>
    <el-form-item label="配置示例（JSON，可留空）">
      <JsonCodeEditor
        v-model="form.dataExample"
        height="130px"
        :readonly="hasArtifact"
      />
      <div v-if="hasArtifact" class="cf-hint">库存脚本件的配置示例由脚本注解物化，随脚本保存更新。</div>
    </el-form-item>

    <el-collapse v-model="ioCollapse" class="cf-io-collapse">
      <el-collapse-item name="io">
        <template #title>
          <span class="cf-io-collapse__title">连线校验预留：输入 / 输出 Schema</span>
        </template>
        <el-form-item label="输入 Schema">
          <JsonCodeEditor v-model="form.inputSchema" height="120px" />
        </el-form-item>
        <el-form-item label="输出 Schema">
          <JsonCodeEditor v-model="form.outputSchema" height="120px" />
        </el-form-item>
      </el-collapse-item>
    </el-collapse>

    <el-form-item label="文档链接">
      <el-input
        v-model="form.docUrl"
        maxlength="255"
        placeholder="wiki 锚点或 http(s) URL（可留空）"
      />
    </el-form-item>
    <el-form-item label="废弃管理">
      <div class="cf-deprecated">
        <el-switch
          v-model="form.deprecated"
          active-value="1"
          inactive-value="0"
          active-text="标记废弃"
          inactive-text="正常"
        />
        <el-input
          v-if="form.deprecated === '1'"
          v-model="form.deprecateNote"
          maxlength="200"
          placeholder="废弃说明/替代组件引导，面板与台账会置灰提示"
          style="flex: 1"
        />
      </div>
      <div class="cf-hint">废弃≠停用：废弃件在已发布链路仍可见可跑，只是面板提示别在新链路使用。</div>
    </el-form-item>
    <el-form-item label="备注">
      <el-input
        v-model="form.remark"
        type="textarea"
        :rows="2"
        maxlength="500"
        placeholder="内部备注"
      />
    </el-form-item>
  </el-tab-pane>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import JsonCodeEditor from '../../../editor/components/common/JsonCodeEditor.vue';
import type { ComponentFormModel } from '../form.types';
import TabLabel from './TabLabel.vue';

defineOptions({ name: 'AdvancedTab' });

defineProps<{
  form: ComponentFormModel;
  hasArtifact: boolean;
  invalid?: boolean;
}>();

/** 输入输出折叠默认收起 */
const ioCollapse = ref<string[]>([]);
</script>

<style lang="scss" scoped>
@use './shared.scss';

.cf-io-collapse {
  margin-bottom: 12px;

  :deep(.el-collapse-item__header) {
    height: 34px;
    font-size: 13px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 8px;
    padding: 0 12px;
    background: var(--el-fill-color-blank);
  }

  :deep(.el-collapse-item__wrap) {
    border: none;
  }

  &__title {
    font-weight: 500;
    color: var(--el-text-color-regular);
  }
}

.cf-deprecated {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}
</style>
