<template>
  <div v-if="pageData" class="w-100 h-100">
    <DynamicRenderer 
      :template-string="pageData.template_string" 
      :script-content="pageData.script_content"
      :style-content="pageData.style_content"
      :route-params="pageData.routeParams"
    />
  </div>

  <v-container v-else-if="error" class="d-flex align-center justify-center py-12" style="min-height: 50vh;">
    <v-card class="pa-8 text-center rounded-xl" elevation="0" border max-width="500" width="100%">
      <v-icon size="72" color="error" class="mb-4">mdi-alert-circle-outline</v-icon>
      <h2 class="text-h5 font-weight-bold mb-2">{{ $t('error.notFound') }}</h2>
      <p class="text-body-1 text-medium-emphasis mb-6">{{ $t(error) }}</p>
      <v-btn to="/" prepend-icon="mdi-home" size="large" rounded="pill" :color="color" elevation="0" class="px-8 text-none font-weight-bold">
        {{ $t('common.home') }}
      </v-btn>
    </v-card>
  </v-container>

  <v-container v-else class="d-flex justify-center align-center" style="min-height: 50vh;">
    <v-progress-circular indeterminate :color="color" size="48"></v-progress-circular>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { getCachedData } from '../utils/offlineStore';
import { compileRoutePattern, matchRoute } from '../utils/routeMatcher';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const { $localize } = useNuxtApp();
const { primaryColor: color } = useGlobals();
const route = useRoute();
const pageData = ref<any>(null);
const error = ref<string | null>(null);

useHead({
  title: () => (pageData.value?.title ? $localize(pageData.value.title) : (error.value ? t('common.error') : t('common.loading')))
});

onMounted(async () => {
  const slugSegments = route.params.dynamic;
  const slug = Array.isArray(slugSegments) ? slugSegments.join('/') : slugSegments;
  
  if (!slug) {
    error.value = t('errors.invalidPath');
    return;
  }

  try {
    const pagesCache = (await getCachedData('pages') || []) as any[];
    let matchedPage = null;
    let routeParams = {};
    const testPath = slug.startsWith('/') ? slug : `/${slug}`;
    
    // First try from cache
    if (pagesCache.length > 0) {
      for (const p of pagesCache) {
        const pattern = p.route_pattern || '';
        const compiled = compileRoutePattern(pattern);
        const matchRes = matchRoute(testPath, compiled.regex, compiled.paramNames);
        if (matchRes.isMatch) {
          matchedPage = p;
          routeParams = matchRes.params;
          break;
        }
      }
    }

    if (matchedPage) {
      pageData.value = { ...matchedPage, routeParams };
    } else {
      // If not in cache or cache is empty, fallback to server fetch just in case
      const queryParams = route.query.tenant ? `?tenant=${route.query.tenant}` : '';
      const data = await $fetch(`/api/pages/${slug}${queryParams}`);
      pageData.value = data;
    }
  } catch (e: any) {
    if (e?.response?.status === 401 || e?.status === 401 || e?.statusCode === 401) {
       const r = useRouter();
       r.push({ path: '/login', query: { redirect: route.fullPath } });
       return;
    }
    error.value = e?.data?.message || e?.statusMessage || t('errors.pageLoadError');
  }
});
</script>
