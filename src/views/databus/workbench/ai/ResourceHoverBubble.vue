<!--
  hover 卡的薄适配层：入口只传 controller，事件接线收在这里。
  业务与交互状态在 useResourceHover，外观在 ContextActionBubble；
  本组件不持有任何状态，因此每个入口只需要一个实例。
-->
<template>
  <Teleport to="body">
    <ContextActionBubble
      v-if="mode === 'ask' || mode === 'comment'"
      :mode="mode"
      :anchor-el="anchorEl"
      :note="note"
      :info="info"
      :copy-title="copyTitle"
      copy-icon="lucide:code"
      :auto-focus="false"
      @update:note="note = $event"
      @copy="controller.copy"
      @join="controller.join"
      @remove="controller.remove"
      @commit="controller.commit"
      @esc="controller.commit"
      @keep="controller.keep"
      @leave="controller.leave"
      @close="controller.close"
      @note-focus="controller.onNoteFocus"
      @note-blur="controller.onNoteBlur"
    />
  </Teleport>
</template>

<script setup lang="ts">
import ContextActionBubble from './ContextActionBubble.vue';
import type { ResourceHoverController } from './useResourceHover';

defineOptions({ name: 'ResourceHoverBubble' });

const props = defineProps<{ controller: ResourceHoverController }>();

// controller 是入口创建后不再替换的稳定对象；解构成顶层 ref 后在模板里自动解包
const { mode, note, anchorEl, info, copyTitle } = props.controller;
</script>
