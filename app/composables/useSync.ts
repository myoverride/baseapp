import { ref } from 'vue';
import { getCachedData, setCachedData, clearOfflineCache } from '../utils/offlineStore';

export const isOffline = ref(false);

export const useSync = () => {
  const syncData = async (tenantSlug: string) => {
    try {
      // 1. Get local version
      const localVersion = await getCachedData('app_version');
      
      const headers: Record<string, string> = tenantSlug ? { 'x-tenant-slug': tenantSlug } : {};
      
      // 2. Fetch sync-status
      const url = localVersion ? `/api/sync-data?version=${localVersion}` : '/api/sync-data';
      const response = await $fetch<any>(url, { headers });
      
      isOffline.value = false;

      if (!response.upToDate && response.data) {
        // We have new data, save it to IndexedDB
        await setCachedData('app_version', response.version);
        await setCachedData('globals', response.data.globals);
        await setCachedData('locales', response.data.locales);
        await setCachedData('pages', response.data.pages);
        await setCachedData('uiUtils', response.data.uiUtils || []);
      }
      
      return true;
    } catch (err) {
      console.warn('Sync failed, falling back to offline mode', err);
      isOffline.value = true;
      return false;
    }
  };

  return {
    syncData
  };
};
