import { defineNuxtPlugin } from '#app';

export default defineNuxtPlugin((nuxtApp) => {
  const originalWarnHandler = nuxtApp.vueApp.config.warnHandler;
  
  nuxtApp.vueApp.config.warnHandler = (msg, instance, trace) => {
    // Suppress Suspense experimental warning
    if (msg && msg.includes('<Suspense> is an experimental feature')) {
      return;
    }
    
    // Call original handler or default to console.warn
    if (originalWarnHandler) {
      originalWarnHandler(msg, instance, trace);
    } else {
      console.warn(`[Vue warn]: ${msg}`, trace);
    }
  };
});
