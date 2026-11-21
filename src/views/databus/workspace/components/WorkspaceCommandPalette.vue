<!--
  工作区命令面板（Ctrl/Cmd+K）：
  把「打开 / 新建 / 切换会话」收进一个键盘入口，替代散落在三个栏头的小按钮。
  只做中转：命令来源于 launcherEntries（与 tab「+」、空态卡同一份清单），
  会话来源于宿主传入的 sessionList，真正的开 tab / 切会话仍由宿主处理。
-->
<template>
  <Transition name="db-palette">
    <div v-if="open" class="db-palette" role="dialog" aria-modal="true" aria-label="命令面板" @mousedown.self="close">
      <div class="db-palette__panel" @keydown="onKeydown">
        <div class="db-palette__search">
          <SvgIcon class="db-palette__search-icon" icon-class="lucide:search" />
          <input
            ref="inputRef"
            v-model="keyword"
            class="db-palette__input"
            type="text"
            placeholder="搜索操作或会话…"
            autocomplete="off"
            spellcheck="false"
          />
          <kbd class="db-palette__esc">Esc</kbd>
        </div>

        <div ref="listRef" class="db-palette__list db-scroll">
          <template v-if="filtered.length">
            <template v-for="group in grouped" :key="group.key">
              <p class="db-label db-palette__group">{{ group.label }}</p>
              <button
                v-for="item in group.items"
                :key="item.id"
                type="button"
                class="db-palette__item"
                :class="{ 'is-active': item.id === activeId }"
                @mouseenter="activeId = item.id"
                @click="run(item)"
              >
                <SvgIcon class="db-palette__item-icon" :icon-class="item.icon" />
                <span class="db-palette__item-label">{{ item.label }}</span>
                <span v-if="item.hint" class="db-palette__item-hint">{{ item.hint }}</span>
                <SvgIcon class="db-palette__item-enter" icon-class="lucide:chevron-right" />
              </button>
            </template>
          </template>
          <div v-else class="db-empty db-empty--compact">
            <span class="db-empty__icon"><SvgIcon icon-class="lucide:search" /></span>
            <p class="db-empty__title">没有匹配项</p>
            <p class="db-empty__hint">换个关键词，或直接新建一个会话</p>
          </div>
        </div>

        <div class="db-palette__foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
          <span><kbd>↵</kbd> 打开</span>
          <span><kbd>Ctrl</kbd>+<kbd>K</kbd> 关闭</span>
          <span><kbd>Ctrl</kbd>+<kbd>U</kbd> 开合 AI</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { checkPermi } from '@/utils/permission';
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';
import type { AiSession } from '@/views/databus/workbench/ai/ai.types';
import { LAUNCHER_ENTRIES } from '../panel/launcherEntries';
import type { LauncherCommand } from '../workbench.types';

defineOptions({ name: 'WorkspaceCommandPalette' });

const props = defineProps<{
  open: boolean;
  sessions?: AiSession[];
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'command', cmd: LauncherCommand): void;
  (e: 'open-session', session: AiSession): void;
}>();

useLucideSubset();

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  group: 'action' | 'session';
  cmd?: LauncherCommand;
  session?: AiSession;
}

const keyword = ref('');
const activeId = ref('');
const inputRef = ref<HTMLInputElement>();
const listRef = ref<HTMLElement>();

/** 操作项：与空态卡 / tab「+」共用清单，并按权限过滤 */
const actionItems = computed<PaletteItem[]>(() =>
  LAUNCHER_ENTRIES.filter((e) => !e.perm || checkPermi(e.perm)).map((e) => ({
    id: `action:${e.key}`,
    label: e.label,
    icon: e.icon,
    group: 'action',
    cmd: e.key
  }))
);

const sessionItems = computed<PaletteItem[]>(() =>
  (props.sessions ?? []).map((s) => ({
    id: `session:${s.id}`,
    label: s.title || '未命名会话',
    hint: s.time,
    icon: 'lucide:message-square-more',
    group: 'session',
    session: s
  }))
);

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  const all = [...actionItems.value, ...sessionItems.value];
  if (!q) {
    return all;
  }
  return all.filter((item) => item.label.toLowerCase().includes(q));
});

/** 分组展示：操作在前、会话在后；空查询时不显示空分组 */
const grouped = computed(() => {
  const groups: { key: 'action' | 'session'; label: string; items: PaletteItem[] }[] = [
    { key: 'action', label: '操作', items: filtered.value.filter((i) => i.group === 'action') },
    { key: 'session', label: '会话', items: filtered.value.filter((i) => i.group === 'session') }
  ];
  return groups.filter((g) => g.items.length);
});

function firstItem(): PaletteItem | undefined {
  return grouped.value[0]?.items[0];
}

function move(step: number) {
  if (!filtered.value.length) {
    return;
  }
  const index = filtered.value.findIndex((i) => i.id === activeId.value);
  const next = (index + step + filtered.value.length) % filtered.value.length;
  activeId.value = filtered.value[next].id;
  void nextTick(() => {
    listRef.value?.querySelector('.db-palette__item.is-active')?.scrollIntoView({ block: 'nearest' });
  });
}

function run(item: PaletteItem) {
  if (item.group === 'action' && item.cmd) {
    emit('command', item.cmd);
  } else if (item.session) {
    emit('open-session', item.session);
  }
  close();
}

function close() {
  emit('update:open', false);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    move(1);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    move(-1);
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const item = filtered.value.find((i) => i.id === activeId.value) ?? firstItem();
    if (item) {
      run(item);
    }
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      return;
    }
    keyword.value = '';
    activeId.value = firstItem()?.id ?? '';
    void nextTick(() => {
      inputRef.value?.focus();
      listRef.value?.scrollTo({ top: 0 });
    });
  }
);

watch(keyword, () => {
  activeId.value = firstItem()?.id ?? '';
});
</script>

<style lang="scss" scoped>
.db-palette {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
  background: rgba(20, 20, 24, 0.28);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.db-palette__panel {
  width: min(560px, 92vw);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--db-r-card);
  background: var(--db-bg-card, rgba(255, 255, 255, 0.82));
  backdrop-filter: saturate(180%) blur(18px);
  -webkit-backdrop-filter: saturate(180%) blur(18px);
  box-shadow: var(--db-shadow-lg), inset 0 0 0 0.5px var(--db-rule);
}

.db-palette__search {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 52px;
  padding: 0 14px;
  border-bottom: 0.5px solid var(--db-rule);
}

.db-palette__search-icon {
  flex: none;
  font-size: 16px;
  color: var(--db-ink-muted);
}

.db-palette__input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  outline: none;
  color: var(--db-ink);
  font-family: inherit;
  font-size: var(--db-fs-md);

  &::placeholder {
    color: var(--db-ink-muted);
  }
}

.db-palette__esc {
  flex: none;
  padding: 2px 6px;
  border-radius: var(--db-r-xs);
  background: var(--db-bg-hover);
  color: var(--db-ink-muted);
  font-family: inherit;
  font-size: var(--db-fs-xs);
}

.db-palette__list {
  max-height: min(52vh, 420px);
  overflow-y: auto;
  padding: 6px;
}

.db-palette__group {
  margin: 8px 8px 4px;
}

.db-palette__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 34px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--db-r-tag);
  background: transparent;
  color: var(--db-ink-secondary);
  font-family: inherit;
  font-size: var(--db-fs-md);
  text-align: left;
  cursor: pointer;

  &.is-active {
    background: var(--db-bg-hover);
    color: var(--db-ink);
  }
}

.db-palette__item-icon {
  flex: none;
  font-size: 15px;
  color: var(--db-ink-muted);
}

.db-palette__item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.db-palette__item-hint {
  flex: none;
  font-size: var(--db-fs-xs);
  color: var(--db-ink-muted);
  font-variant-numeric: tabular-nums;
}

.db-palette__item-enter {
  flex: none;
  font-size: 13px;
  color: var(--db-ink-muted);
  opacity: 0;
  transition: opacity var(--db-dur-fast) var(--db-ease);

  .db-palette__item.is-active & {
    opacity: 1;
  }
}

.db-palette__foot {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 14px;
  border-top: 0.5px solid var(--db-rule);
  color: var(--db-ink-muted);
  font-size: var(--db-fs-xs);

  kbd {
    padding: 1px 4px;
    margin-right: 2px;
    border-radius: 3px;
    background: var(--db-bg-hover);
    font-family: inherit;
    font-size: 10px;
  }
}

/* 出现/消失：轻微上浮 + 淡入，不做缩放，避免面板文字发虚 */
.db-palette-enter-active,
.db-palette-leave-active {
  transition: opacity var(--db-dur-fast) var(--db-ease);
}

.db-palette-enter-active .db-palette__panel,
.db-palette-leave-active .db-palette__panel {
  transition: transform var(--db-dur-normal) var(--db-spring);
}

.db-palette-enter-from,
.db-palette-leave-to {
  opacity: 0;
}

.db-palette-enter-from .db-palette__panel,
.db-palette-leave-to .db-palette__panel {
  transform: translateY(-6px);
}
</style>
