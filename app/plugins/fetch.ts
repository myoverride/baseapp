export default defineNuxtPlugin((nuxtApp) => {
  const originalFetch = globalThis.$fetch;
  
  globalThis.$fetch = async function (request, options) {
    const url = typeof request === 'string' ? request : (request as Request).url;
    
    // Intercept logout to clear offline cache
    if (url.includes('/api/auth/logout')) {
      if (import.meta.client) {
        try {
          const { clearOfflineCache } = await import('../utils/offlineStore');
          await clearOfflineCache();
        } catch (e) {
          console.error('Failed to clear offline cache on logout', e);
        }
      }
    }
    
    try {
      // @ts-ignore
      return await originalFetch(request, options);
    } catch (err: any) {
      if (import.meta.client && (err?.response?.status === 401 || err?.status === 401 || err?.statusCode === 401)) {
        console.warn('Global 401 Unauthorized detected. Redirecting to login...');
        const router = nuxtApp.$router as any;
        if (router) {
          router.push({ path: '/login', query: { redirect: window.location.pathname } });
        } else {
          window.location.href = '/login';
        }
      }
      throw err;
    }
  } as typeof $fetch;
});
