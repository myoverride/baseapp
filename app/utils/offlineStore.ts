import localforage from 'localforage';

export const offlineStore = localforage.createInstance({
  name: 'iiotplatform',
  storeName: 'offline_cache'
});

const getTenantPrefix = (fallbackTenantSlug?: string) => {
  if (fallbackTenantSlug) return fallbackTenantSlug;
  if (import.meta.client) {
    const match = document.cookie.match(new RegExp('(^| )tenant_slug=([^;]+)'));
    if (match) return match[2];
  }
  return 'master';
};

export const getCachedData = async (key: string, tenantSlug?: string) => {
  const prefix = getTenantPrefix(tenantSlug);
  try {
    return await offlineStore.getItem(`${prefix}_${key}`);
  } catch (err) {
    console.error(`Error reading ${key} from offline store`, err);
    return null;
  }
};

export const setCachedData = async (key: string, value: any) => {
  const prefix = getTenantPrefix();
  try {
    await offlineStore.setItem(`${prefix}_${key}`, value);
  } catch (err) {
    console.error(`Error writing ${key} to offline store`, err);
  }
};

export const clearOfflineCache = async () => {
  const prefix = getTenantPrefix();
  try {
    const keys = await offlineStore.keys();
    for (const k of keys) {
      if (k.startsWith(`${prefix}_`)) {
        await offlineStore.removeItem(k);
      }
    }
  } catch (err) {
    console.error('Error clearing offline store', err);
  }
};
