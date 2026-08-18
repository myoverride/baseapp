<template>
  <div>
    <button id="test-btn" @click="testTheme">Toggle Theme</button>
    <div id="test-output">{{ output }}</div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useNuxtApp } from '#app';

const output = ref('');
const testTheme = () => {
  try {
    const { $vuetify } = useNuxtApp();
    output.value = `Current: ${$vuetify.theme.global.name}`;
    $vuetify.theme.global.name = $vuetify.theme.global.name === 'dark' ? 'light' : 'dark';
    output.value += ` -> New: ${$vuetify.theme.global.name}`;
  } catch (e) {
    output.value = e.message;
  }
};
</script>
