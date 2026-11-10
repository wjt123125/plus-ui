<!--
  物料分类视角（挂在「物料管理」tab 的第 5 个视角，治理动作）。
  分类是货架目录：增 / 改名 / 排序 / 推荐标签维护；空分类可直接删除，
  有物料的分类不给裸删，只能「合并到」——后端一个事务把物料整批迁走再删源分类。
  分类按 resource_type 分组：组件分类只在组件分段出现、链路分类只在链路分段出现，空串＝通用。
-->
<template>
  <div class="mcat">
    <div v-loading="loading" class="mcat__body">
      <template v-for="grp in groups" :key="grp.type">
        <MarketGroupHeader
          :label="grp.label"
          :count="grp.items.length"
          :collapsed="isCollapsed(grp.type)"
          @toggle="toggleGroup(grp.type)"
        />
        <ul v-if="!isCollapsed(grp.type)" class="db-list db-list--framed">
          <li v-for="c in grp.items" :key="String(c.id)" class="db-row db-float">
            <SvgIcon class="db-row__icon" icon-class="lucide:folder" :style="{ color: 'var(--el-color-primary)' }" />
            <div class="db-row__meta">
              <div class="db-row__line">
                <span class="db-row__name">{{ c.name }}</span>
                <span v-if="!c.itemCount" class="db-row__self-pending">空分类</span>
              </div>
              <div class="mcat__summary">
                <span>{{ c.itemCount ? `${c.itemCount} 个物料` : '暂未挂物料' }}</span>
                <span v-for="t in c.defaultTags ?? []" :key="t" class="mcat__tag">{{ t }}</span>
              </div>
            </div>
            <div class="db-row__ops">
              <!-- 分类动作收进「更多」（与治理视角同范式）：行上只留名称与状态；
                   锚点包一层 span，行动作面板以它为根，不再居中弹窗 -->
              <span :ref="(el) => setAnchor(String(c.id), el)" class="mcat__more-anchor">
                <el-dropdown
                  trigger="click"
                  placement="bottom-end"
                  popper-class="db-menu-popper"
                  @command="(cmd: string) => onRowCommand(c, cmd)"
                >
                  <el-button size="small" text class="db-row__more" aria-label="更多分类动作">
                    <svg class="db-row__dots" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                      <circle cx="12" cy="5" r="2.4" fill="currentColor" />
                      <circle cx="12" cy="12" r="2.4" fill="currentColor" />
                      <circle cx="12" cy="19" r="2.4" fill="currentColor" />
                    </svg>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item class="db-menu-item" command="rename">
                        <SvgIcon icon-class="lucide:file-pen" /><span>改名</span>
                      </el-dropdown-item>
                      <el-dropdown-item v-if="c.itemCount" class="db-menu-item" command="merge">
                        <SvgIcon icon-class="lucide:folder-input" /><span>合并到…</span>
                      </el-dropdown-item>
                      <el-dropdown-item v-else class="db-menu-item is-danger" command="delete" divided>
                        <SvgIcon icon-class="lucide:trash" /><span>删除</span>
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </span>
            </div>
          </li>
        </ul>
      </template>
      <el-empty v-if="!categories.length" description="还没有分类" :image-size="72">
        <el-button @click="openCreate">
          <SvgIcon icon-class="lucide:plus" /><span>新增分类</span>
        </el-button>
      </el-empty>
    </div>

    <!-- 行动作面板：以行内「⋯」为锚点（virtual-ref），改名 / 合并 / 删除共用这一个浮层，
         不再开居中大弹窗；点外面收起，保存中不响应关闭 -->
    <el-popover
      :visible="panelMode !== null"
      :virtual-ref="activeAnchor"
      virtual-triggering
      popper-class="mcat__pop"
      trigger="click"
      placement="bottom-end"
      :width="panelMode === 'delete' ? 180 : panelMode === 'merge' ? 200 : 260"
      :persistent="false"
      @update:visible="onPanelVisible"
    >
      <div v-click-outside="closePanel" class="mcat__panel">
        <template v-if="panelMode === 'rename'">
          <!-- 就地改名：只留名称一行，排序与标签收进次要行；回车即保存 -->
          <el-input
            v-model="form.name"
            size="small"
            maxlength="100"
            placeholder="分类名称"
            @keyup.enter="onSaveRename"
          />
          <div class="mcat__panel-row">
            <span class="mcat__row-label">排序</span>
            <el-input-number
              v-model="form.sort"
              size="small"
              :min="0"
              :max="9999"
              :controls="false"
              class="mcat__sort"
            />
            <button type="button" class="mcat__tags-toggle" @click="tagsOpen = !tagsOpen">
              推荐标签{{ form.defaultTags.length ? ` · ${form.defaultTags.length}` : '' }}
            </button>
          </div>
          <!-- 候选标签默认收起：一屏十几个 chip 太吵，要用再展开 -->
          <div v-if="tagsOpen" class="mcat__tags">
            <TagSelect
              :key="String(activeCategory?.id ?? 'rename')"
              v-model="form.defaultTags"
              :options="tagPool"
              allow-create
              empty-text="可直接输入"
            />
          </div>
          <div class="mcat__panel-actions">
            <el-button size="small" text @click="closePanel">取消</el-button>
            <el-button size="small" type="primary" :loading="saving" @click="onSaveRename">保存</el-button>
          </div>
        </template>

        <template v-else-if="panelMode === 'merge'">
          <!-- teleported=false：下拉留在浮层内，避免点选项被 click-outside 判成“点了外面” -->
          <el-select
            v-model="mergeTarget"
            size="small"
            class="mcat__field"
            :placeholder="`合并到…`"
            :teleported="false"
          >
            <el-option label="未分类" :value="NO_TARGET" />
            <el-option v-for="c in mergeTargets" :key="String(c.id)" :label="c.name" :value="String(c.id)" />
          </el-select>
          <div class="mcat__panel-actions">
            <el-button size="small" text @click="closePanel">取消</el-button>
            <el-button size="small" type="primary" :loading="saving" @click="onMerge">合并</el-button>
          </div>
        </template>

        <template v-else>
          <div class="mcat__panel-text">确认删除吗？</div>
          <div class="mcat__panel-actions">
            <el-button size="small" text @click="closePanel">取消</el-button>
            <el-button size="small" type="danger" :loading="saving" @click="confirmDelete">删除</el-button>
          </div>
        </template>
      </div>
    </el-popover>

    <!-- 新增：字段含「适用类型」，且由页头主按钮触发，继续用弹窗 -->
    <el-dialog v-model="dialogVisible" title="新增分类" width="420px" append-to-body>
      <el-form label-width="80px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" maxlength="100" show-word-limit placeholder="例如：数据处理" />
        </el-form-item>
        <el-form-item label="适用类型">
          <el-select v-model="form.resourceType" class="mcat__field">
            <el-option label="通用（组件 / 链路 / 连接器都出现）" value="" />
            <el-option label="组件" value="COMPONENT" />
            <el-option label="链路" value="CHAIN" />
            <el-option label="连接器" value="CONNECTOR" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="推荐标签">
          <TagSelect
            v-model="form.defaultTags"
            :options="tagPool"
            allow-create
            empty-text="暂无同类型推荐，可直接输入"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onCreate">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ClickOutside as vClickOutside } from 'element-plus';
import { addMarketCategory, delMarketCategory, listMarketCategories, mergeMarketCategory, updateMarketCategory } from '@/api/databus/market';
import type { DatabusMarketCategoryVo, MarketCategoryForm } from '@/api/databus/market/types';
import { useLucideSubset } from '@/views/databus/workbench/composables/useLucideSubset';
import MarketGroupHeader from './MarketGroupHeader.vue';
import TagSelect from './TagSelect.vue';

defineOptions({ name: 'MarketCategoryPane' });

useLucideSubset();

/** 分组顺序与市场页类型分段一致 */
const GROUP_ORDER: { type: string; label: string }[] = [
  { type: 'COMPONENT', label: '组件' },
  { type: 'CHAIN', label: '链路' },
  { type: 'CONNECTOR', label: '连接器' },
  { type: '', label: '通用' }
];

const emit = defineEmits<{
  /** 分类动过：宿主刷市场页 chips（新分类/改名/删除都要重取） */
  (e: 'changed'): void;
}>();

const loading = ref(false);
const saving = ref(false);
const categories = ref<DatabusMarketCategoryVo[]>([]);

const groups = computed(() =>
  GROUP_ORDER.map((g) => ({
    ...g,
    // 组内按 sort 升序（同 sort 保持接口顺序）：排序字段在弹窗里改，列表里得看得见效果
    items: categories.value
      .filter((c) => (c.resourceType ?? '') === g.type)
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
  })).filter((g) => g.items.length)
);

/* 分组折叠：与其它视角同一套（MarketGroupHeader），key 直接是适用类型；
   默认全展开——分类视角只有一个层级，不需要按视角再拼前缀 */
const collapsedGroups = ref<Record<string, boolean>>({});

function isCollapsed(type: string): boolean {
  return collapsedGroups.value[type] === true;
}

function toggleGroup(type: string): void {
  collapsedGroups.value[type] = !isCollapsed(type);
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const { data } = await listMarketCategories();
    categories.value = data ?? [];
  } finally {
    loading.value = false;
  }
}

/* ---------------- 浮层状态（锚定行内「⋯」） ---------------- */

type PanelMode = 'rename' | 'merge' | 'delete';

const panelMode = ref<PanelMode | null>(null);
const activeId = ref('');
const activeAnchor = ref<HTMLElement | null>(null);
/** 每行「⋯」的 DOM 锚点：普通对象即可，不参与响应式 */
const anchors: Record<string, HTMLElement> = {};
/** 改名浮层里的标签候选是否展开（默认收起，避免 chip 铺满面板） */
const tagsOpen = ref(false);

const activeCategory = computed(() => categories.value.find((c) => String(c.id) === activeId.value) ?? null);

function setAnchor(id: string, el: unknown): void {
  if (el instanceof HTMLElement) {
    anchors[id] = el;
  } else {
    delete anchors[id];
  }
}

function openPanel(c: DatabusMarketCategoryVo, mode: PanelMode): void {
  activeId.value = String(c.id);
  activeAnchor.value = anchors[String(c.id)] ?? null;
  tagsOpen.value = false;
  panelMode.value = mode;
}

/** 保存/删除中不响应“点外面关闭”，失败时面板要留在原地给出错 */
function closePanel(): void {
  if (saving.value) {
    return;
  }
  panelMode.value = null;
}

function onPanelVisible(visible: boolean): void {
  if (!visible) {
    closePanel();
  }
}

/* ---------------- 新增 / 改名 ---------------- */

const dialogVisible = ref(false);
const form = reactive<MarketCategoryForm>({ name: '', resourceType: '', sort: 0, defaultTags: [] });

/** 推荐标签候选：同适用类型（含通用）分类已配的标签，避免同一类型内词汇漂移 */
const tagPool = computed(() => {
  const type = form.resourceType ?? '';
  const pool = new Set<string>();
  for (const c of categories.value) {
    const ct = c.resourceType ?? '';
    if (type && ct !== type && ct !== '') {
      continue;
    }
    for (const t of c.defaultTags ?? []) {
      pool.add(t);
    }
  }
  return [...pool].map((t) => ({ value: t, label: t }));
});

function openCreate(): void {
  form.name = '';
  form.resourceType = '';
  form.sort = (categories.value.at(-1)?.sort ?? 0) + 1;
  form.defaultTags = [];
  dialogVisible.value = true;
}

/** 改名：不走弹窗，填完表直接以「⋯」为根就地展开 */
function openRename(c: DatabusMarketCategoryVo): void {
  form.name = c.name;
  form.resourceType = c.resourceType ?? '';
  form.sort = c.sort ?? 0;
  form.defaultTags = [...(c.defaultTags ?? [])];
  openPanel(c, 'rename');
}

async function onCreate(): Promise<void> {
  if (!form.name.trim()) {
    ElMessage.warning('分类名称不能为空');
    return;
  }
  saving.value = true;
  try {
    await addMarketCategory({
      name: form.name.trim(),
      resourceType: form.resourceType,
      sort: form.sort,
      defaultTags: form.defaultTags ?? []
    });
    ElMessage.success('已新增');
    dialogVisible.value = false;
    await load();
    emit('changed');
  } catch {
    /* 拦截器已提示 */
  } finally {
    saving.value = false;
  }
}

async function onSaveRename(): Promise<void> {
  const c = activeCategory.value;
  if (!c) {
    return;
  }
  if (!form.name.trim()) {
    ElMessage.warning('分类名称不能为空');
    return;
  }
  saving.value = true;
  try {
    await updateMarketCategory(c.id, {
      name: form.name.trim(),
      sort: form.sort,
      defaultTags: form.defaultTags ?? []
    });
    ElMessage.success('已保存');
    panelMode.value = null;
    await load();
    emit('changed');
  } catch {
    /* 拦截器已提示 */
  } finally {
    saving.value = false;
  }
}

/* ---------------- 删除（仅空分类） ---------------- */

function onDelete(c: DatabusMarketCategoryVo): void {
  openPanel(c, 'delete');
}

async function confirmDelete(): Promise<void> {
  const c = activeCategory.value;
  if (!c) {
    return;
  }
  saving.value = true;
  try {
    await delMarketCategory(c.id);
    ElMessage.success('已删除');
    panelMode.value = null;
    await load();
    emit('changed');
  } catch {
    /* 拦截器已提示（例如后端发现仍有物料占用） */
  } finally {
    saving.value = false;
  }
}

/* ---------------- 合并 ---------------- */

/** 「未分类」用哨兵值，空串留给「尚未选择」以便校验必选 */
const NO_TARGET = '__none';
const merging = ref<DatabusMarketCategoryVo | null>(null);
const mergeTarget = ref<string>('');

/** 目标候选：同适用类型或通用分类，排除自身 */
const mergeTargets = computed(() => {
  const type = merging.value?.resourceType ?? '';
  return categories.value.filter(
    (c) => String(c.id) !== String(merging.value?.id) && ((c.resourceType ?? '') === '' || (c.resourceType ?? '') === type)
  );
});

function openMerge(c: DatabusMarketCategoryVo): void {
  merging.value = c;
  mergeTarget.value = '';
  openPanel(c, 'merge');
}

async function onMerge(): Promise<void> {
  const c = merging.value;
  if (!c) {
    return;
  }
  if (!mergeTarget.value) {
    ElMessage.warning('请选择目标分类');
    return;
  }
  saving.value = true;
  try {
    await mergeMarketCategory(c.id, {
      targetCategoryId: mergeTarget.value === NO_TARGET ? null : mergeTarget.value
    });
    ElMessage.success('已合并');
    panelMode.value = null;
    await load();
    emit('changed');
  } catch {
    /* 拦截器已提示 */
  } finally {
    saving.value = false;
  }
}

/* ---------------- 行内「更多」菜单 ---------------- */

/** 行动作分发：有物料只给合并，空分类才给删除（后端也按此口径校验） */
function onRowCommand(c: DatabusMarketCategoryVo, cmd: string): void {
  if (cmd === 'rename') {
    openRename(c);
  } else if (cmd === 'merge') {
    openMerge(c);
  } else if (cmd === 'delete') {
    void onDelete(c);
  }
}

/* 新增入口在页头（宿主 MarketManagePane 调）：分类视角的主按钮跟着视角走 */
defineExpose({ openCreate });

onMounted(load);
</script>

<style lang="scss" scoped>
.mcat {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.mcat__body {
  min-height: 200px;
}

.mcat__field {
  width: 100%;
}

.mcat__more-anchor {
  display: inline-flex;
}

/* 行动作浮层：宽度随锚点，内容自己排版，不再借用 dialog 的 label 栅格 */
.mcat__panel {
  min-width: 0;
}

/* 玻璃加强：全局那条玻璃（78% 白 + blur 20）压在白列表上等于白，看不出材质。
   浮层 teleport 到 body、出了 .db-app，读不到 --db-*，只能用 :root 的 --app-*（暗色自动跟随）。
   特异度写成 0,4,0，稳压全局 0,3,0 那条，不依赖样式加载顺序；全局规则本身不动。 */
:global(.el-popover.mcat__pop.el-popper:not(.is-dark)) {
  --popper-glass-bg: color-mix(in srgb, var(--app-surface-bg) 58%, transparent);

  background: var(--popper-glass-bg);
  backdrop-filter: saturate(180%) blur(24px);
  -webkit-backdrop-filter: saturate(180%) blur(24px);
  box-shadow: var(--app-shadow-md), inset 0 0 0 0.5px var(--app-surface-border);
}

.mcat__panel-text {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
}

/* 改名的次要行：排序小字段 + 标签开关，和名称挤在一屏里 */
.mcat__panel-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.mcat__row-label {
  flex: none;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.mcat__sort {
  flex: none;
  width: 56px;
}

/* 展开的标签候选与上面「排序 / 推荐标签」行拉开距离，否则 chip 贴着输入行 */
.mcat__tags {
  margin-top: 8px;
}

/* 标签候选开关：低调的文字按钮，展开才铺 chip */
.mcat__tags-toggle {
  flex: 1;
  padding: 2px 6px;
  border: 0;
  border-radius: var(--db-r-tag);
  background: transparent;
  font-family: inherit;
  font-size: 12px;
  line-height: 20px;
  color: var(--el-text-color-secondary);
  text-align: left;
  cursor: pointer;
  transition:
    color 0.15s ease,
    background-color 0.15s ease;

  &:hover {
    color: var(--el-color-primary);
    background: var(--el-fill-color-lighter);
  }

  /* 浮层在 body 上，拿不到页面里的按钮基线样式；不写会把 UA 的黑色默认焦点框带出来 */
  &:focus {
    outline: none;
  }

  &:focus-visible {
    outline: 2px solid var(--el-color-primary-light-5);
    outline-offset: 1px;
  }
}

.mcat__panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

/* 行副标题：物料数 + 推荐标签同一行；标签本身就是标签，不再加「推荐标签」前缀 */
.mcat__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.mcat__tag {
  padding: 0 6px;
  border-radius: var(--db-r-tag);
  font-size: 11px;
  line-height: 16px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
}
</style>
