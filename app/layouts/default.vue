<template>
  <div>
    <!-- SAFE MODE: Bypass everything and render a hardcoded emergency layout -->
    <v-app v-if="isSafeMode">
      <v-app-bar color="error" density="compact" elevation="2">
        <v-app-bar-title class="text-caption font-weight-bold">
          <v-icon size="small" class="mr-1">mdi-shield-alert</v-icon> ISOLATED SAFE MODE
        </v-app-bar-title>
        <v-spacer></v-spacer>
        <v-btn icon @click="toggleTheme" class="mr-2">
          <v-icon>{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
        </v-btn>
        <v-btn variant="text" size="small" to="/admin/pages">{{ $t('menu.pages') }}</v-btn>
        <v-btn variant="text" size="small" to="/admin/system-settings">{{ $t('menu.settings') }}</v-btn>
        <v-btn variant="text" size="small" to="/admin/users">{{ $t('menu.users') }}</v-btn>
        <v-btn variant="outlined" size="small" @click="exitSafeMode" class="ml-2 bg-white text-error">{{
          $t('menu.exitSafeMode') }}</v-btn>
      </v-app-bar>
      <v-main class="bg-background">
        <v-container fluid class="bg-error text-white pa-2 text-center text-caption font-weight-bold">
          {{ $t('message.safeModeWarning') }}
        </v-container>
        <slot />
      </v-main>
    </v-app>

    <!-- NORMAL MODE -->
    <template v-else>
      <DynamicRenderer v-if="finalLayout && !layoutError" :template-string="finalLayout.template_string"
        :script-content="finalLayout.script_content" :style-content="finalLayout.style_content"
        :route-params="finalLayout.routeParams" :locale="$i18n.locale">
        <slot />
      </DynamicRenderer>
      <v-app v-else>
        <v-btn icon elevation="4" style="position: fixed; bottom: 20px; right: 20px; z-index: 9999" @click="toggleTheme"
          :color="isDark ? 'grey-darken-3' : 'white'">
          <v-icon>{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
        </v-btn>
        <v-main class="bg-background">
          <slot />
        </v-main>
      </v-app>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useFetch, useNuxtApp, useCookie } from '#app';
import { useRoute } from 'vue-router';
import { watchEffect, watch, computed } from 'vue';
import { useTheme } from 'vuetify';

const { $i18n, $vuetify, $toggleTheme } = useNuxtApp() as any;

const safeModeCookie = useCookie('safe_mode');
const isSafeMode = safeModeCookie.value === '1';

const theme = useTheme();
const isDark = computed(() => theme.global.current.value.dark);
const toggleTheme = () => {
  if (typeof $toggleTheme === 'function') {
    $toggleTheme();
  } else {
    //theme.global.name.value = theme.global.current.value.dark ? 'light' : 'dark';
    theme.change(theme.global.current.value.dark ? 'light' : 'dark');
  }
};

const exitSafeMode = () => {
  safeModeCookie.value = null;
  window.location.href = '/'; // Anasayfaya dön ve sayfayı yenile
};

const resolveUiLocale = (code: string) => {
  const normalized = String(code || '').toLowerCase();
  return normalized.split(/[-_]/)[0] || 'en';
};
const isRtlLocale = (code: string) => {
  const normalized = String(code || '').toLowerCase();
  const base = normalized.split(/[-_]/)[0] || '';
  const locales = useState<any[]>('app_locales', () => []).value;
  const locObj = locales.find(l => String(l?.code || '').toLowerCase() === normalized || String(l?.code || '').toLowerCase() === base);
  const dirValue = String(locObj?.dir || '').toLowerCase();
  return dirValue === 'rtl' || ['ar', 'fa', 'he', 'ur', 'ckb'].includes(base);
};

// Global DOM dir ve vuetify locale senkronizasyonu
watchEffect(() => {
  if ($i18n && $i18n.locale) {
    const code = $i18n.locale.value || $i18n.locale;
    const baseLocale = resolveUiLocale(code);
    if (import.meta.client) {
      document.documentElement.dir = isRtlLocale(code) ? 'rtl' : 'ltr';
      document.documentElement.lang = code;
    }
    if ($vuetify?.locale?.current) {
      const available = Object.keys($vuetify.locale.messages?.value || {});
      $vuetify.locale.current.value = available.includes(baseLocale) ? baseLocale : (available.includes('en') ? 'en' : available[0]);
    }
  }
});

// Layout Fetch (Only fetch if NOT in safe mode)
const route = useRoute();
let tenantSlug = '';
if (route.path.startsWith('/tenant/')) {
  tenantSlug = route.path.split('/')[2] || '';
}
const headers: Record<string, string> = tenantSlug ? { 'x-tenant-slug': tenantSlug } : {};

import { getCachedData } from '../utils/offlineStore';
import { isOffline } from '../composables/useSync';

// Fetch layout data ONLY if we are in normal mode, otherwise bypass entirely
let { data: systemLayout, error: systemLayoutError } = !isSafeMode
  ? await useFetch(() => `/api/pages/resolve-layout?path=${encodeURIComponent(route.path)}`, { headers })
  : { data: ref(null), error: ref(null) };

const finalLayout = ref<any>(systemLayout.value);
const layoutError = ref<any>(systemLayoutError.value);

watch(systemLayout, (newVal) => {
  if (newVal) {
    finalLayout.value = newVal;
    layoutError.value = null;
  }
});

// Çevrimdışıysak veya sunucudan layout çekilemediyse hafızadan (IndexedDB) kurtar
if ((systemLayoutError.value || isOffline.value) && import.meta.client) {
  try {
    const cachedPages = (await getCachedData('pages', tenantSlug) || []) as any[];

    // 1. Önce sayfayı bul ve özel layout'u var mı kontrol et
    const reqPath = route.path || '/';
    let matchedPage = null;

    for (const p of cachedPages) {
      if (p.page_type === 'layout' || p.page_type === 'component') continue;
      const pattern = p.route_pattern || '';
      // Regex yerine basit exact match veya pattern match yapılabilir (offline'da regex için utils gerekebilir)
      // Ancak offline mode genellikle kısıtlıdır. En azından direct path eşleşmesi yapalım.
      if (pattern === reqPath || `/${pattern}` === reqPath) {
        matchedPage = p;
        break;
      }
    }

    let layoutPage = null;
    const layoutPages = cachedPages.filter((p: any) => p.page_type === 'layout');

    if (matchedPage && matchedPage.layout_id) {
      layoutPage = layoutPages.find((l: any) => l.id === matchedPage.layout_id);
    }

    if (!layoutPage) {
      layoutPage = layoutPages.find((l: any) => l.is_default_layout === 1 || l.is_default_layout === true);
    }

    if (!layoutPage) {
      layoutPage = layoutPages.find((l: any) => l.route_pattern === 'system/layout' || l.route_pattern === '/system/layout');
    }

    if (layoutPage) {
      finalLayout.value = layoutPage;
      layoutError.value = null; // Hatayı sıfırla ki normal düzende çizilsin
    }
  } catch (err) {
    console.error('Offline layout okunamadı:', err);
  }
}
</script>
