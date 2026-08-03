<template>
  <DynamicRenderer 
    v-if="componentData && !error"
    :template-string="componentData.template_string"
    :script-content="componentData.script_content"
    :style-content="componentData.style_content"
    v-bind="$attrs"
  />
  <div v-else-if="error" class="text-error text-caption">
    Failed to load component {{ slug }}: {{ error.message || error }}
  </div>
  <div v-else class="d-flex justify-center align-center">
    <v-progress-circular indeterminate :color="color" size="24"></v-progress-circular>
  </div>
</template>

<script setup lang="ts">
const { primaryColor: color } = useSysVars();
import { ref, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import DynamicRenderer from './DynamicRenderer.vue';
import { getCachedData } from '../utils/offlineStore';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  slug: string;
}>();

const componentData = ref<any>(null);
const error = ref<any>(null);

const route = useRoute();
let tenantSlug = '';
if (route.path.startsWith('/tenant/')) {
  tenantSlug = route.path.split('/')[2] || '';
}

// In-memory global cache for dynamic components
const cache = new Map<string, Promise<any>>();

const fetchComponent = async () => {
  if (!props.slug) return;
  
  const cacheKey = `${tenantSlug}_${props.slug}`;
  
  if (cache.has(cacheKey)) {
    try {
      componentData.value = await cache.get(cacheKey);
      error.value = null;
    } catch (err) {
      error.value = err;
    }
    return;
  }

  const fetchPromise = (async () => {
    // 1. Try IndexedDB (Offline First)
    if (import.meta.client) {
      try {
        const cachedPages = (await getCachedData('pages', tenantSlug) || []) as any[];
        const matchedPage = cachedPages.find((p: any) => 
          p.page_type === 'component' && p.route_pattern === props.slug
        );
        if (matchedPage) {
          return matchedPage;
        }
      } catch (err) {
        console.warn('Failed to read component from IndexedDB', err);
      }
    }

    // 2. Fallback to API if not found in offline store
    return $fetch(`/api/pages/components/${props.slug}`, {
      headers: tenantSlug ? { 'x-tenant-slug': tenantSlug } : {}
    });
  })();
  
  cache.set(cacheKey, fetchPromise);
  
  try {
    componentData.value = await fetchPromise;
    error.value = null;
  } catch (err) {
    error.value = err;
    cache.delete(cacheKey); // allow retry on next mount
  }
};

watch(() => props.slug, () => {
  fetchComponent();
});

onMounted(() => {
  fetchComponent();
});
</script>
