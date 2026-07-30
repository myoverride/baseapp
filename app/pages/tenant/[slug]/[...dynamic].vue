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
      <p class="text-body-1 text-grey-darken-1 mb-6">{{ $t(error) }}</p>
      <v-btn :to="`/tenant/${route.params.slug}`" prepend-icon="mdi-home" size="large" rounded="pill" :color="color" elevation="0" class="px-8 text-none font-weight-bold">
        {{ $t('action.returnTenantHome') || $t('common.home') }}
      </v-btn>
    </v-card>
  </v-container>

  <v-container v-else class="d-flex justify-center align-center" style="min-height: 50vh;">
    <v-progress-circular indeterminate :color="color" size="48"></v-progress-circular>
  </v-container>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';

const route = useRoute();
const { primaryColor: color } = useSysVars();
const { t } = useI18n();
const pageData = ref<any>(null);
const error = ref<string | null>(null);

useHead({
  title: () => pageData.value?.title || (error.value ? t('common.error') || 'Hata' : t('common.loading'))
});

onMounted(async () => {
  const tenantSlug = route.params.slug as string;
  const slugSegments = route.params.dynamic;
  const slug = Array.isArray(slugSegments) ? slugSegments.join('/') : slugSegments;
  
  if (!slug) {
    error.value = t('error.invalidRoute');
    return;
  }

  const headers = { 'x-tenant-slug': tenantSlug };

  try {
    const data = await $fetch(`/api/pages/${slug}`, { headers });
    pageData.value = data;
  } catch (e: any) {
    if (e?.response?.status === 401 || e?.status === 401 || e?.statusCode === 401) {
       navigateTo(`/tenant/${tenantSlug}/login`);
       return;
    }
    error.value = e?.data?.message || e?.statusMessage || t('error.pageLoadFailed');
  }
});
</script>
