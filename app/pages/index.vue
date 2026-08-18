<template>
  <div v-if="pageData" class="w-100 h-100">
    <DynamicRenderer 
      :template-string="pageData.template_string" 
      :script-content="pageData.script_content"
      :style-content="pageData.style_content"
      :route-params="pageData.routeParams"
    />
  </div>

  <div v-else class="w-100 h-100 bg-background d-flex align-center justify-center">
    <div class="text-center text-grey">
      <v-progress-circular indeterminate :color="color" class="mb-4"></v-progress-circular>
      <div class="mt-4 text-h6 text-medium-emphasis">{{ $t('message.loading') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import { useFetch, useState } from '#app';
import { useI18n } from 'vue-i18n';
import { ref, onMounted } from 'vue';
import { getCachedData } from '../utils/offlineStore';
import { compileRoutePattern, matchRoute } from '../utils/routeMatcher';

const { t } = useI18n();
useHead({ title: () => t('common.home') });
const { primaryColor: color } = useGlobals();

const user = useState<any>('user');
const route = useRoute();
let tenantSlug = '';
if (route.path.startsWith('/tenant/')) {
  tenantSlug = route.path.split('/')[2] || '';
}
const headers: Record<string, string> = tenantSlug ? { 'x-tenant-slug': tenantSlug } : {};

const pageData = ref<any>(null);

onMounted(async () => {
  if (user.value && user.value.home_page && user.value.home_page !== '/') {
    return navigateTo(user.value.home_page);
  }

  try {
    const endpoint = '/api/pages/index';
    const data = await $fetch<any>(endpoint, { headers });
    if (data) {
      pageData.value = data;
    }
  } catch (e: any) {
    console.warn('Network request failed, attempting to load from IndexedDB offline store...');
    try {
      const cachedPages = (await getCachedData('pages') || []) as any[];
      let matchedPage = null;
      let routeParams = {};
      
      for (const p of cachedPages) {
        const pattern = p.route_pattern || '';
        const compiled = compileRoutePattern(pattern);
        const matchRes = matchRoute('/', compiled.regex, compiled.paramNames);
        if (matchRes.isMatch) {
          matchedPage = p;
          routeParams = matchRes.params;
          break;
        }
      }
      
      if (matchedPage) {
        pageData.value = { ...matchedPage, routeParams };
        return; // Successfully loaded from offline store
      }
    } catch(err) {
      console.error('Failed to load offline data', err);
    }

    if (!user.value) {
      navigateTo({ path: '/login', query: { redirect: route.fullPath } });
    }
  }
});
</script>
