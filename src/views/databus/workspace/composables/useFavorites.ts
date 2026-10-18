/**
 * 用户收藏（工作区统一资源树「我的收藏」section + 叶子星标联动）。
 * 目录是团队共享归属单真相，收藏是个人化组织维度：三接口 list/add/remove，
 * userId 由后端从登录态取，前端只传 resourceType + resourceId。
 */
import { computed, ref } from 'vue';
import { addFavorite, listFavorite, removeFavorite } from '@/api/databus/favorite';
import type { FavoriteResourceType, FavoriteVo } from '@/api/databus/favorite/types';

/** 收藏身份键（type:id），叶子星标回显与去重统一用 */
function keyOf(type: FavoriteResourceType, id: string | number): string {
  return `${type}:${id}`;
}

/**
 * 收藏列表是全会话单真相：资源树星标与组件库「我的收藏」范围共读同一份，
 * 双实例会不同步（树里取消收藏、网格仍按旧列表过滤），故提到模块级。
 */
const favorites = ref<FavoriteVo[]>([]);
const loading = ref(false);
/** 收藏身份键集合（O(1) 判定叶子是否已收藏） */
const keys = computed(() => new Set(favorites.value.map((f) => keyOf(f.resourceType, f.resourceId))));

export function useFavorites() {
  async function reload(): Promise<void> {
    loading.value = true;
    try {
      const { data } = await listFavorite();
      favorites.value = data ?? [];
    } catch {
      // 无 favorite:list 权限或请求失败：该 section 置空，不炸壳（拦截器已提示）
      favorites.value = [];
    } finally {
      loading.value = false;
    }
  }

  function isFavorited(type: FavoriteResourceType, id: string | number): boolean {
    return keys.value.has(keyOf(type, id));
  }

  async function add(type: FavoriteResourceType, id: string | number): Promise<void> {
    await addFavorite({ resourceType: type, resourceId: id });
    await reload();
  }

  async function remove(type: FavoriteResourceType, id: string | number): Promise<void> {
    await removeFavorite({ resourceType: type, resourceId: id });
    await reload();
  }

  /** 一键切换收藏态（叶子星标 hover 点击） */
  async function toggle(type: FavoriteResourceType, id: string | number): Promise<boolean> {
    const next = !isFavorited(type, id);
    if (next) {
      await add(type, id);
    } else {
      await remove(type, id);
    }
    return next;
  }

  return { favorites, loading, reload, isFavorited, add, remove, toggle };
}
