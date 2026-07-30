<template>
  <RecordsManager :slug="$route.params.slug as string" />
</template>

<script setup lang="ts">
import RecordsManager from '~/components/RecordsManager.vue';
</script>
