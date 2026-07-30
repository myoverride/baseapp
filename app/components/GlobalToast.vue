<template>
  <v-snackbar
    v-model="toastState.show"
    :color="toastState.color"
    :timeout="toastState.timeout"
    location="bottom center"
  >
    {{ toastState.text }}
  </v-snackbar>
</template>

<script setup lang="ts">
import { useState } from '#app';
const toastState = useState('global_toast', () => ({
  show: false,
  text: '',
  color: 'success',
  timeout: 3000
}));
</script>
