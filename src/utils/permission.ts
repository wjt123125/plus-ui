import { useUserStore } from '@/store/modules/user';

/**
 * 字符权限校验
 * @param {Array} value 校验值
 * @returns {Boolean}
 */
export const checkPermi = (value: any) => {
  if (value && value instanceof Array && value.length > 0) {
    const permissions = useUserStore().permissions;
    const permissionDatas = value;
    const all_permission = '*:*:*';

    const hasPermission = permissions.some(permission => {
      return all_permission === permission || permissionDatas.includes(permission);
    });

    if (!hasPermission) {
      return false;
    }
    return true;
  } else {
    console.error(`need roles! Like checkPermi="['system:user:add','system:user:edit']"`);
    return false;
  }
};

/**
 * 角色权限校验
 * @param {Array} value 校验值
 * @returns {Boolean}
 */
export const checkRole = (value: any): boolean => {
  if (value && value instanceof Array && value.length > 0) {
    const roles = useUserStore().roles;
    const permissionRoles = value;
    // 超管角色 key 旁路：RuoYi-Vue-Plus 为 superadmin，老版 RuoYi 为 admin，两者都视为超管
    // （与 v-hasRoles 指令、后端 LoginHelper.isSuperAdmin 同口径）
    const SUPER_ADMIN_ROLE_KEYS = ['superadmin', 'admin'];

    const hasRole = roles.some(role => {
      return SUPER_ADMIN_ROLE_KEYS.includes(role) || permissionRoles.includes(role);
    });

    if (!hasRole) {
      return false;
    }
    return true;
  } else {
    console.error(`need roles! Like checkRole="['admin','editor']"`);
    return false;
  }
};
