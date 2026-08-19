export default defineNuxtPlugin(async (_nuxtApp) => {
  const user = useState<any>('user', () => null);
  
  if (import.meta.client) {
    const { getCachedData, setCachedData } = await import('../utils/offlineStore');
    
    try {
      const { data, error } = await useFetch('/api/auth/me', { headers: useRequestHeaders(['cookie']) });
      
      if (error.value) {
        if (error.value.statusCode === 401 || error.value.status === 401) {
          // Explicitly unauthorized, clear everything
          user.value = null;
          await setCachedData('user', null);
        } else {
          // Network error or 500 error, safe to fallback to offline cache
          const cachedUser = await getCachedData('user');
          if (cachedUser) {
            user.value = cachedUser;
          } else {
            user.value = null;
          }
        }
      } else if (data.value && (data.value as any).success) {
        user.value = (data.value as any).user;
        const plainUser = JSON.parse(JSON.stringify(user.value));
        await setCachedData('user', plainUser);
      } else {
        // 401 or not logged in
        user.value = null;
        await setCachedData('user', null);
      }
    } catch {
      // Complete fetch failure (e.g., DNS error, completely offline)
      const cachedUser = await getCachedData('user');
      user.value = cachedUser || null;
    }
  } else {
    // Server-side
    try {
      const { data } = await useFetch('/api/auth/me', { headers: useRequestHeaders(['cookie']) });
      if (data.value && (data.value as any).success) {
        user.value = (data.value as any).user;
      }
    } catch {
      user.value = null;
    }
  }
});
