import { ref, computed } from 'vue';

export interface DynamicUtil {
  id: number;
  name: string;
  key: string;
  target: 'ui' | 'api' | 'shared';
  code: string;
  scope: string[];
  enabled: boolean;
}

const utilCache = ref<Map<string, DynamicUtil>>(new Map());

export const useUtils = () => {
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // Utilities'i yükle ve cache'e koy (client tarafında)
  const loadUtilities = async () => {
    isLoading.value = true;
    try {
      const [uiRes, sharedRes] = await Promise.all([
        $fetch('/api/admin/utils?target=ui'),
        $fetch('/api/admin/utils?target=shared')
      ]);

      const all = [
        ...((uiRes as any)?.data || []),
        ...((sharedRes as any)?.data || [])
      ];

      all.forEach((util: any) => {
        utilCache.value.set(util.key, util);
      });
    } catch (err) {
      error.value = (err as Error).message;
      console.error('[useUtils] Load error:', err);
    } finally {
      isLoading.value = false;
    }
  };

  // Utility'yi key'e göre al
  const getUtil = (key: string): DynamicUtil | undefined => {
    return utilCache.value.get(key);
  };

  const execCache = new Map<string, { value: any, ts: number }>();
  const CACHE_TTL_MS = 5000;

  // Utility'yi çalıştır (client tarafı - sadece API üzerinden, eval/new Function yasak)
  const executeUtil = async (key: string, ...args: any[]): Promise<any> => {
    const util = getUtil(key);
    if (!util) throw new Error(`Utility '${key}' not found`);

    const cacheKey = key + '::' + JSON.stringify(args);
    const cached = execCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return cached.value;
    }

    try {
      const res = await $fetch(`/api/admin/utils/${util.id}`, {
        method: 'POST',
        body: { args }
      });
      const result = (res as any)?.result || res;
      execCache.set(cacheKey, { value: result, ts: Date.now() });
      return result;
    } catch (err: any) {
      const message = err?.data?.error || err?.data?.message || err?.message || 'Error executing utility';
      console.error(`[executeUtil] ${key}:`, err);
      throw new Error(message);
    }
  };

  // Utilities listesi (reactive)
  const utilities = computed(() => Array.from(utilCache.value.values()));

  // Refresh cache
  const refreshUtilities = async () => {
    utilCache.value.clear();
    await loadUtilities();
  };

  // Proxy objesi ile fonksiyonlara dogrudan erisim
  const utils = new Proxy({} as Record<string, Function>, {
    get: (_, prop: string) => (...args: any[]) => executeUtil(prop, ...args)
  });

  return {
    isLoading,
    error,
    utilities,
    getUtil,
    loadUtilities,
    refreshUtilities,
    utils
  };
};
