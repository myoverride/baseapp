import { computed } from 'vue';
import { useState, useCookie } from '#imports';

export const useGlobals = () => {
  const globals = useState<Record<string, string>>('app-globals');
  
  const themeMode = useCookie('app_theme_mode', { default: () => 'light', maxAge: 60 * 60 * 24 * 365 });
  const isDark = computed(() => themeMode.value === 'dark');

  // Legacy backward compatibility for older usages
  const primaryColor = computed(() => {
    if (isDark.value) {
      return globals.value?.DARK_PRIMARY || globals.value?.PRIMARY_COLOR || globals.value?.primary_color || 'primary';
    }
    return globals.value?.LIGHT_PRIMARY || globals.value?.PRIMARY_COLOR || globals.value?.primary_color || 'primary';
  });

  return {
    globals,
    primaryColor,
    isDark,
    themeMode
  };
};

// --- UI Utility Compiler ---
const _compiledUtilsCache = new Map<string, Function>();
const _blobUrls = new Map<string, string>();

export async function compileUIUtil(key: string, code: string): Promise<Function> {
  if (_compiledUtilsCache.has(key)) return _compiledUtilsCache.get(key)!;

  // Onceki blob varsa temizle (memory leak onlemi)
  if (_blobUrls.has(key)) {
    URL.revokeObjectURL(_blobUrls.get(key)!);
  }

  const sourceTag = `\n//# sourceURL=UIUtil_${key}.js`;
  const blob = new Blob([code + sourceTag], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  _blobUrls.set(key, url);

  try {
    // @ts-ignore - dynamic blob import
    const module = await import(/* @vite-ignore */ url);
    const fn = module.default;
    if (typeof fn !== 'function') {
      throw new Error(`UI Utility "${key}" gecerli bir fonksiyon export etmiyor.`);
    }
    _compiledUtilsCache.set(key, fn);
    return fn;
  } catch (err: any) {
    URL.revokeObjectURL(url);
    _blobUrls.delete(key);
    throw err;
  }
}

export function invalidateUIUtilCache(key?: string) {
  if (key) {
    _compiledUtilsCache.delete(key);
    if (_blobUrls.has(key)) {
      URL.revokeObjectURL(_blobUrls.get(key)!);
      _blobUrls.delete(key);
    }
  } else {
    _compiledUtilsCache.clear();
    _blobUrls.forEach(url => URL.revokeObjectURL(url));
    _blobUrls.clear();
  }
}
