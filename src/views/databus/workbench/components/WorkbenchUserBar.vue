<!--
  工作台侧栏底部用户区（§7 改造点3，n8n 式）：头像 + 昵称 + 角色徽标 + 箭头整行，点击展开下拉
  （个人中心 / 进入后台 / 退出登录）。数据复用 RuoYi userStore（登录已拉 getInfo，零新接口）；
  命令一律抛事件由页面统一处理跳转/登出，本组件零路由依赖。
  「进入后台」adminEntry opt-in + checkRole 角色门控（非后台角色整项隐藏，n8n Owner/Admin 才见管理项模式）。
  2026-10-24 极简化（QLM 参考图）：面板向上弹（top-start）且宽度实测同步下方触发器胶囊
  （ResizeObserver，侧栏拖拽跟着变）；菜单项默认融入底色、hover 才浮胶囊底；去分隔线、
  面板去边框只留阴影。
-->
<template>
  <el-dropdown
    trigger="click"
    :show-timeout="0"
    class="wb-userbar"
    placement="top-start"
    popper-class="wb-userbar-popper"
    @command="handleCommand"
  >
    <button ref="rowRef" type="button" class="wb-userbar__row" aria-haspopup="menu" aria-label="用户菜单">
      <img v-if="avatarUrl" class="wb-userbar__avatar" :src="avatarUrl" alt="用户头像" />
      <span v-else class="wb-userbar__avatar">{{ avatarText }}</span>
      <span class="wb-userbar__name">{{ userStore.nickname }}</span>
      <span class="wb-userbar__role">{{ roleLabel }}</span>
      <SvgIcon class="wb-userbar__caret" icon-class="lucide:chevron-down" />
    </button>
    <template #dropdown>
      <el-dropdown-menu class="wb-userbar__menu" :style="menuStyle">
        <el-dropdown-item command="profile">
          <SvgIcon class="wb-userbar__ico wb-userbar__ico--profile" icon-class="lucide:user-round" />
          <span>个人中心</span>
        </el-dropdown-item>
        <el-dropdown-item v-if="adminEntry && canEnterAdmin" command="admin">
          <SvgIcon class="wb-userbar__ico wb-userbar__ico--admin" icon-class="lucide:external-link" />
          <span>进入后台</span>
        </el-dropdown-item>
        <el-dropdown-item command="logout" class="wb-userbar__logout">
          <SvgIcon class="wb-userbar__ico wb-userbar__ico--logout" icon-class="lucide:log-out" />
          <span>退出登录</span>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useUserStore } from '@/store/modules/user';
import { checkRole } from '@/utils/permission';
import { useLucideSubset } from '../composables/useLucideSubset';

defineOptions({ name: 'WorkbenchUserBar' });

withDefaults(
  defineProps<{
    /** 是否渲染「进入后台」菜单项（opt-in）；undefined = 不渲染 */
    adminEntry?: boolean;
  }>(),
  {}
);

const emit = defineEmits<{
  /** 点「个人中心」：交页面跳转，本组件零路由依赖 */
  (e: 'profile'): void;
  /** 点「进入后台」：交页面跳转，本组件零路由依赖 */
  (e: 'admin'): void;
  /** 点「退出登录」：交页面处理登出与跳转，本组件零路由依赖 */
  (e: 'logout'): void;
}>();

useLucideSubset();

/** 用户信息与角色徽标：复用 RuoYi userStore（登录时已拉取 getInfo，零新接口） */
const userStore = useUserStore();

/** 用户头像：userStore 登录时已取（无头像时是默认占位图），img 优先、首字圆兜底 */
const avatarUrl = computed(() => userStore.avatar?.trim() ?? '');

/** 头像首字（无昵称兜底 U），彩色圆头像不依赖图片资源 */
const avatarText = computed(() => userStore.nickname?.trim().charAt(0).toUpperCase() ?? 'U');

/** 触发器实宽（随侧栏拖拽变化）：下拉面板宽度与其同步，视觉上与下方胶囊一列等宽 */
const rowRef = ref<HTMLButtonElement>();
const rowWidth = ref(0);
let rowObserver: ResizeObserver | undefined;

onMounted(() => {
  const el = rowRef.value;
  if (!el) {
    return;
  }
  rowWidth.value = el.offsetWidth;
  rowObserver = new ResizeObserver(() => {
    rowWidth.value = el.offsetWidth;
  });
  rowObserver.observe(el);
});

onBeforeUnmount(() => {
  rowObserver?.disconnect();
  rowObserver = undefined;
});

/** 面板等宽：实测到手才给 width，避免首帧 0 宽闪一下 */
const menuStyle = computed(() => (rowWidth.value ? { width: `${rowWidth.value}px` } : undefined));

/** 行内角色徽标：superadmin/admin 显「管理员」；数据总线角色显操作员/治理员；其余「成员」。
 *  曾把 superadmin 显示成「成员」，让人误以为超管是无权限账号、进而怀疑权限门控失效 */
const roleLabel = computed(() => {
  const roles = userStore.roles ?? [];
  if (roles.includes('superadmin') || roles.includes('admin')) {
    return '管理员';
  }
  const databusRole = roles.includes('databus_gov') ? '治理员' : roles.includes('databus_ops') ? '操作员' : null;
  return databusRole ?? '成员';
});

/** 「进入后台」角色门控：用 @/utils/permission 的 checkRole（v-hasRoles 的 JS 侧同源代码），不自己拼角色数组。
 *  为什么不用 v-hasRoles 指令：el-dropdown-item 根节点是插槽 Fragment（非元素），
 *  指令挂不上 DOM，Vue 会报「Runtime directive used on component with non-element root node」。
 *  superadmin 要显式列进白名单：checkRole 只把 admin 当超管直通，本项目超管 role_key 是 superadmin */
const canEnterAdmin = computed(() => checkRole(['superadmin', 'admin', 'databus_ops', 'databus_gov']));

/** 下拉命令 → 抛事件：页面统一处理跳转/登出 */
function handleCommand(command: string) {
  switch (command) {
    case 'profile':
      emit('profile');
      break;
    case 'admin':
      emit('admin');
      break;
    case 'logout':
      emit('logout');
      break;
  }
}
</script>

<style lang="scss" scoped>
.wb-userbar {
  display: block;
  width: 100%;

  /* 整行触发器：头像 + 昵称 + 角色徽标 + 箭头；平时融入底色，hover 才浮胶囊底（QLM 同款） */
  &__row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 36px;
    padding: 0 8px;
    border: none;
    border-radius: 999px;
    background: transparent;
    cursor: pointer;
    transition: background-color 0.15s ease;

    &:hover {
      background: var(--el-fill-color-light, #f5f7fa);
    }
  }

  /* 头像：img 真图（object-fit 防拉伸）或 span 首字兜底，统一 26px 圆 */
  &__avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--el-color-primary, #409eff);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    line-height: 26px;
    object-fit: cover;
  }

  &__name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: var(--el-text-color-regular);
    text-align: left;
  }

  /* 角色徽标：浅灰小标签（对齐参考图「免费」标签位），命中后台角色时换主色 */
  &__role {
    flex-shrink: 0;
    padding: 0 6px;
    border-radius: 4px;
    background: var(--el-fill-color-light, #f5f7fa);
    color: var(--el-text-color-secondary);
    font-size: 10px;
    line-height: 16px;
  }

  &__caret {
    flex-shrink: 0;
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  /* 下拉面板 teleport 到 body，scoped 样式经 :deep 落到 popper 内元素；
     宽度由脚本实测同步（menuStyle），此处只管留白与菜单项形态 */
  &__menu {
    padding: 4px;

    /* 菜单项：默认融入面板底色，hover 才浮胶囊底；无分隔线（极简） */
    :deep(.el-dropdown-menu__item) {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 32px;
      padding: 0 10px;
      margin: 0;
      font-size: 13px;
      background: transparent;
      border-radius: 999px;
      transition:
        background-color 0.15s ease,
        color 0.15s ease;

      &:not(.is-disabled):hover,
      &:not(.is-disabled):focus {
        background: var(--el-fill-color-light, #f5f7fa);
        color: var(--el-text-color-primary);
      }
    }

    /* 退出登录整行危险色（钉底，n8n/通用 SaaS 模式） */
    :deep(.wb-userbar__logout) {
      color: var(--el-color-danger, #f56c6c);
    }
  }

  /* 菜单项彩色图标：个人中心蓝 / 进入后台绿 / 退出登录红 */
  &__ico {
    font-size: 14px;

    &--profile {
      color: var(--el-color-primary, #409eff);
    }

    &--admin {
      color: var(--el-color-success, #67c23a);
    }

    &--logout {
      color: var(--el-color-danger, #f56c6c);
    }
  }
}

/* 面板壳：teleport 到 body，经 popper-class 全局命中——去边框、去箭头，只留阴影（少线极简）。
   注意 :global() 内不能嵌套后代选择器：scoped 编译会把后代部分丢弃
   （曾把 .el-popper__arrow 的 display:none 扁平化到面板本体，导致弹层永远 display:none）。 */
:global(.el-popper.is-light.wb-userbar-popper) {
  padding: 0;
  border: none;
  border-radius: 12px;
  box-shadow: var(--el-box-shadow-light);
}

:global(.el-popper.is-light.wb-userbar-popper .el-popper__arrow) {
  display: none;
}
</style>
