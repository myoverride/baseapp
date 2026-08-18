<template>
  <RecordsManager :slug="$route.params.slug as string" />
</template>

<script setup lang="ts">
import { ref, defineAsyncComponent } from 'vue';
const RecordsManager = defineAsyncComponent(() => import('~/components/RecordsManager.vue'));
</script>
