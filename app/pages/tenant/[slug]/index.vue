<template>
  <div v-if="pageData" class="w-100 h-100">
    <DynamicRenderer 
      :template-string="pageData.template_string" 
      :script-content="pageData.script_content"
      :style-content="pageData.style_content"
    />
  </div>

  <v-container v-else-if="user?.is_admin || user?.is_super_admin" class="py-8">
      <div class="text-center mb-8">
        <v-icon size="64" :color="color" class="mb-2">mdi-domain</v-icon>
        <h1 class="text-h4 font-weight-bold text-medium-emphasis">{{ route.params.slug }} {{ $t('page.workspace') }}</h1>
        <p class="text-subtitle-1 text-medium-emphasis mt-1">
          {{ $t('page.noLandingPage') }}
        </p>
      </div>
  </v-container>

  <v-container v-else-if="user" class="py-8">
    <div class="text-center" style="max-width: 500px; margin: 0 auto;">
      <v-icon size="64" :color="color" class="mb-4">mdi-hand-wave</v-icon>
      <h1 class="text-h5 font-weight-bold text-medium-emphasis mb-2">{{ $t('page.welcome') }}, {{ user.username }}</h1>
      <p class="text-body-1 text-medium-emphasis">
        {{ $t('common.useTheLinksInTheMenuToAccessYourPages') }}
      </p>
    </div>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useState, useFetch } from '#app';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const { primaryColor: color } = useGlobals();
const route = useRoute();
const tenantSlug = route.params.slug as string;

useHead({ title: () => `${tenantSlug.toUpperCase()} - ${t('common.home')}` });

const user = useState<any>('user');
const headers = { 'x-tenant-slug': tenantSlug };
const { data, error } = await useFetch<any>('/api/pages/', { headers });

const pageData = computed(() => {
  if (data.value) {
    return data.value;
  }
  return null;
});

// Hata durumunda login sayfasına yönlendir
if (error.value && (error.value.statusCode === 401 || (error.value.data && error.value.data.statusCode === 401))) {
  navigateTo(`/tenant/${tenantSlug}/login`);
}
</script>
