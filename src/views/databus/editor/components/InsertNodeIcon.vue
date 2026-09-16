<template>
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
  <!-- 语义：带「+」的圆角卡片=新节点；箭头指向插入方位（上/下） -->
    <template v-if="dir === 'top'">
      <rect x="5" y="2" width="14" height="8" rx="1.5" />
      <path d="M9.5 6h5M12 3.5v5" />
      <path d="M12 21v-8M8 16.5l4-3.5 4 3.5" />
    </template>
    <template v-else>
      <path d="M12 3v8M8 7.5l4 3.5 4-3.5" />
      <rect x="5" y="14" width="14" height="8" rx="1.5" />
      <path d="M9.5 18h5M12 15.5v5" />
    </template>
  </svg>
</template>

<script setup lang="ts">
defineOptions({ name: 'InsertNodeIcon' });
defineProps<{ dir: 'top' | 'bottom' }>();
</script>
