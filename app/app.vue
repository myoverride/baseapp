<template>
  <NuxtLoadingIndicator color="#1976D2" :height="4" />
  <div v-if="isOffline" style="background-color: #fb8c00; color: white; text-align: center; font-weight: bold; padding: 4px; z-index: 9999; position: relative; width: 100%;">
    ⚠️ {{ $t('common.offlineMode') || 'Çevrimdışı Çalışıyorsunuz' }}
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
}

const headers: Record<string, string> = tenantSlug ? { 'x-tenant-slug': tenantSlug } : {};

// 1. İstemci verilerini senkronize et (veya offline ise hata yakala)
const { syncData } = useSync();
await syncData(tenantSlug);

// 2. SysVars verisini IndexedDB'den al ve Nuxt'un global state'ine (useNuxtData) yaz
const sysVarsCache = (await getCachedData('sysVars') || []) as any[];
const sysVarsMap: Record<string, string> = {};
sysVarsCache.forEach((sv: any) => {
  sysVarsMap[sv.key] = sv.value;
});

// useSysVars.ts tarafında bu key bekleniyor
const globalSysVars = useState('sys-vars-global', () => sysVarsMap);
globalSysVars.value = sysVarsMap;

onMounted(() => {
  if (import.meta.client && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js?v=4').then(reg => {
      reg.update();
    }).catch((err) => {
      console.warn('Service Worker registration failed:', err);
    });

    // Service Worker'dan gelen buton tıklama mesajlarını dinle
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'NOTIFICATION_CLICK') {
        const { action, data } = event.data;
        console.log('Push Action Clicked:', action, data);
        
        // Uygulama içinde herhangi bir sayfanın (örneğin metaverse.vue) bunu dinleyebilmesi için CustomEvent fırlatıyoruz
        window.dispatchEvent(new CustomEvent('push-action', { detail: { action, data } }));
      }
    });
  }
});
</script>
