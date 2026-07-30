import { defineNuxtPlugin } from '#app';

export default defineNuxtPlugin((nuxtApp) => {
  const localize = (val: any): string => {
    if (val === null || val === undefined) return '';
    
    let parsed: any = val;
    
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          parsed = JSON.parse(trimmed);
        } catch (e) {
          return val;
        }
      } else {
        return val;
      }
    }
    
    if (typeof parsed === 'object' && parsed !== null) {
      const i18n = (nuxtApp as any).$i18n;
      const current = i18n ? i18n.global.locale.value : 'en';

      if (parsed[current]) {
        return parsed[current];
      }
      
      const fallback = i18n ? (i18n.global.fallbackLocale.value || 'en') : 'en';
      if (typeof fallback === 'string' && parsed[fallback]) {
        return parsed[fallback];
      }
      
      const keys = Object.keys(parsed);
      if (keys.length > 0 && keys[0] !== undefined) {
        return parsed[keys[0]];
      }
    }
    
    return String(val);
  };

  return {
    provide: {
      localize
    }
  };
});
