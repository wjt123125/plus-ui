<!--
  standalone 独立窗体父容器（2026-10-20，databus-workspace-tabs.md §6.3 写法 1 · Layout Route）。
  本身不显示业务内容：只框「独立窗体壳」——一行工具栏（返回工作台）+ 一个 <router-view/>，
  具体内容由子路由 URL 决定（复用工作台的各 pane）。
  护栏①：100vh 只在这个最外层出现一次；.standalone-body flex:1 + min-height:0，子页自行内层滚动。
  壳不读工作台 tab store（铁律「pane 与壳解耦」：同 pane 既挂工作台壳、也挂 standalone 裸页）。
  同源同站，localStorage token 自动共享，新窗打开不要求重新登录。
-->
<template>
  <div class="standalone-shell">
    <header class="standalone-toolbar">
      <button class="standalone-back" @click="goWorkspace">
        <el-icon><Back /></el-icon>
        <span>返回工作台</span>
      </button>
      <span class="standalone-brand">数据总线 · 独立窗体</span>
    </header>
    <div class="standalone-body">
      <router-view />
    </div>
  </div>
</template>

<script setup name="DatabusStandalone" lang="ts">
import { Back } from '@element-plus/icons-vue';
import { useRouter } from 'vue-router';

const router = useRouter();

/** 返回工作台主壳 */
function goWorkspace() {
  router.push('/databus/workspace');
}
</script>

<style scoped>
.standalone-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--el-bg-color, #fff);
}

.standalone-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 48px;
  padding: 0 16px;
  border-bottom: 1px solid var(--el-border-color-light, #e4e7ed);
  background: var(--app-surface-bg, #fff);
}

.standalone-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: var(--app-radius-md, 10px);
  background: var(--el-bg-color, #fff);
  color: var(--el-text-color-regular, #363b41);
  font-size: 13px;
  cursor: pointer;
  transition:
    color 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    color: var(--el-color-primary);
    border-color: var(--el-color-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 2px;
  }
}

.standalone-brand {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text-title, #1f2937);
}

.standalone-body {
  flex: 1;
  min-height: 0;
  position: relative;
}
</style>