<template>
  <NuxtLoadingIndicator color="#1976D2" :height="4" />
  <div v-if="isOffline" style="background-color: #fb8c00; color: white; text-align: center; font-weight: bold; padding: 4px; z-index: 9999; position: relative; width: 100%;">
    ⚠️ {{ $t('common.offlineMode') }}
  </div>
  <NuxtLayout>
    <NuxtPage />
    <GlobalToast />
  </NuxtLayout>
</template>

<script setup lang="ts">
import { getCachedData } from './utils/offlineStore';
import { useSync, isOffline } from './composables/useSync';

const route = useRoute();
let tenantSlug = '';
if (route.path.startsWith('/tenant/')) {
  tenantSlug = route.path.split('/')[2] || '';
} else if (route.query.tenant) {
  tenantSlug = route.query.tenant as string;
}

const headers: Record<string, string> = tenantSlug ? { 'x-tenant-slug': tenantSlug } : {};

// 1. İstemci verilerini senkronize et (veya offline ise hata yakala)
const { syncData } = useSync();
await syncData(tenantSlug);

// 2. Globals verisini IndexedDB'den al ve Nuxt'un global state'ine (useNuxtData) yaz
const globalsCache = (await getCachedData('globals') || []) as any[];
const globalsMap: Record<string, string> = {};
globalsCache.forEach((sv: any) => {
  globalsMap[sv.key] = sv.value;
});

// useGlobals.ts tarafında bu key bekleniyor
const globalVarsState = useState('app-globals', () => globalsMap);
globalVarsState.value = globalsMap;

onMounted(() => {
  if (import.meta.client && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js?v=6').then(reg => {
      reg.update();
    }).catch((err) => {
      console.warn('Service Worker registration failed:', err);
    });

    // Service Worker'dan gelen buton tıklama mesajlarını dinle
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'NOTIFICATION_CLICK') {
        const { action, data } = event.data;
        
        // Uygulama içinde herhangi bir sayfanın (örneğin metaverse.vue) bunu dinleyebilmesi için CustomEvent fırlatıyoruz
        window.dispatchEvent(new CustomEvent('push-action', { detail: { action, data } }));
      }
    });
  }
});
</script>
