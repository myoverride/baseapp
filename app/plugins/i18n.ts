import { createI18n } from 'vue-i18n';
import { tr, en, de, fr, es, ar, ru, zhHans, ja } from 'vuetify/locale';
import { getCachedData } from '../utils/offlineStore';

const vuetifyLocalesMap: Record<string, any> = { tr, en, de, fr, es, ar, ru, 'zh-hans': zhHans, ja };

export default defineNuxtPlugin(async (nuxtApp) => {
  const localesState = useState<any[]>('app_locales', () => []);
  let locales: any[] = [];
  try {
    const cached = await getCachedData('locales');
    if (cached && Array.isArray(cached) && cached.length > 0) {
      locales = cached;
    } else {
      const res = await $fetch<any[]>('/api/i18n/locales');
      locales = Array.isArray(res) ? res : [];
    }
    localesState.value = locales;
  } catch (e) {
    console.error('Failed to load locales', e);
  }

  // DO NOT mutate locales array with a fake language if it's empty.
  // We want the UI to accurately reflect what is in the database.
  const fallbackCode = locales.find(l => l.code === 'en')?.code || (locales.length > 0 ? locales[0].code : 'en');
  const knownRtlBases = new Set(['ar', 'fa', 'he', 'ur', 'ckb']);

  const resolveAppLocaleCode = (code: string): string => {
    const normalized = String(code || '').toLowerCase();
    const normalizedFallback = String(fallbackCode || 'en').toLowerCase();
    const localeCodes = locales.map(l => String(l?.code || '').toLowerCase()).filter(Boolean);

    if (localeCodes.includes(normalized)) return normalized;

    const base = normalized.split(/[-_]/)[0] || '';
    if (localeCodes.includes(base)) return base;

    if (localeCodes.includes(normalizedFallback)) return normalizedFallback;

    const fallbackBase = normalizedFallback.split(/[-_]/)[0] || '';
    if (localeCodes.includes(fallbackBase)) return fallbackBase;

    return normalizedFallback;
  };

  // Detect user locale or fallback to first locale
  let currentLocale = resolveAppLocaleCode(fallbackCode);
  if (import.meta.client && locales.length > 0) {
    const savedLocale = localStorage.getItem('app_locale');
    if (savedLocale) {
      currentLocale = resolveAppLocaleCode(savedLocale);
    } else {
      const browserLang = (navigator.language || '').split('-')[0] || '';
      currentLocale = resolveAppLocaleCode(browserLang);
    }
  }

  const fetchMessages = async (code: string) => {
    try {
      if (locales && locales.length > 0) {
        const found = locales.find(l => l.code === code);
        if (found && found.translation_json) {
          try {
            return typeof found.translation_json === 'string' ? JSON.parse(found.translation_json) : found.translation_json;
          } catch(e) {}
        }
      }
      return await $fetch<Record<string, any>>(`/api/i18n/messages?locale=${code}`);
    } catch (e) {
      console.error(`Failed to load messages for locale: ${code}`, e);
      return {} as Record<string, any>;
    }
  };

  // Load current + fallback messages so fallback always works.
  const [currentMessages, fallbackMessages] = await Promise.all([
    fetchMessages(currentLocale),
    currentLocale === fallbackCode ? Promise.resolve({} as Record<string, any>) : fetchMessages(fallbackCode)
  ]);

  const i18n = createI18n({
    legacy: false,
    globalInjection: true,
    locale: currentLocale,
    fallbackLocale: fallbackCode,
    missingWarn: false,
    fallbackWarn: false,
    messages: {
      [fallbackCode]: fallbackMessages,
      [currentLocale]: currentMessages
    }
  });

  nuxtApp.vueApp.use(i18n);

  const resolveVuetifyLocaleCode = (code: string): string => {
    const vuetify: any = nuxtApp.$vuetify;
    const available = Object.keys(vuetify?.locale?.messages?.value || {});
    const normalizedCode = String(code || '').toLowerCase();
    if (available.includes(normalizedCode)) return normalizedCode;

    const baseCode = normalizedCode.split(/[-_]/)[0] || '';
    if (available.includes(baseCode)) return baseCode;

    const normalizedFallback = String(fallbackCode || '').toLowerCase();
    if (available.includes(normalizedFallback)) return normalizedFallback;
    const fallbackBase = normalizedFallback.split(/[-_]/)[0] || '';
    if (available.includes(fallbackBase)) return fallbackBase;

    return available[0] || 'en';
  };

  const applyDocumentLocale = (code: string) => {
    const resolvedCode = resolveAppLocaleCode(code);
    const baseCode = (resolvedCode || '').split(/[-_]/)[0] || '';
    const locObj = locales.find(l => String(l?.code || '').toLowerCase() === resolvedCode);
    const dirValue = String(locObj?.dir || '').toLowerCase();
    const isRtl = dirValue === 'rtl' || knownRtlBases.has(baseCode);
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = resolvedCode;
  };

  const syncVuetify = (localeCode: string) => {
    const vuetify: any = nuxtApp.$vuetify;
    if (vuetify) {
      if (fallbackMessages['$vuetify'] || fallbackCode) {
        vuetify.locale.messages.value[fallbackCode] = {
          ...vuetify.locale.messages.value[fallbackCode],
          ...((vuetifyLocalesMap as any)[fallbackCode] || {}),
          ...(fallbackMessages['$vuetify'] || {})
        };
      }
      vuetify.locale.messages.value[localeCode] = {
        ...vuetify.locale.messages.value[localeCode],
        ...((vuetifyLocalesMap as any)[localeCode] || {}),
        ...(currentMessages['$vuetify'] || {})
      };
      vuetify.locale.messages.value = { ...vuetify.locale.messages.value };
      
      const vLocCode = resolveVuetifyLocaleCode(localeCode);
      
      const resolvedCode = resolveAppLocaleCode(localeCode);
      const baseCode = (resolvedCode || '').split(/[-_]/)[0] || '';
      const locObj = locales.find(l => String(l?.code || '').toLowerCase() === resolvedCode);
      const dirValue = String(locObj?.dir || '').toLowerCase();
      const isRtl = dirValue === 'rtl' || knownRtlBases.has(baseCode);

      if (vuetify.locale && vuetify.locale.rtl) {
        vuetify.locale.rtl.value = {
          ...(vuetify.locale.rtl.value || {}),
          [vLocCode]: isRtl
        };
      }
      
      vuetify.locale.current.value = vLocCode;
    }
  };

  // Sync immediately if available
  if (nuxtApp.$vuetify) syncVuetify(currentLocale);

  // Sync Vuetify locale after app is created (plugins loaded)
  nuxtApp.hook('app:created', () => syncVuetify(currentLocale));
  
  applyDocumentLocale(currentLocale);

  // Global helper to change language
  const setLanguage = async (code: string) => {
    const resolvedCode = resolveAppLocaleCode(code);
    if (!i18n.global.availableLocales.includes(resolvedCode)) {
      const msgs = await fetchMessages(resolvedCode);
      i18n.global.setLocaleMessage(resolvedCode, msgs);
    }

    // Ensure fallback messages are loaded too.
    if (!i18n.global.availableLocales.includes(fallbackCode)) {
      const fbMsgs = await fetchMessages(fallbackCode);
      i18n.global.setLocaleMessage(fallbackCode, fbMsgs);
    }

    i18n.global.locale.value = resolvedCode;
    localStorage.setItem('app_locale', resolvedCode);

    // Update Vuetify and HTML dir
    syncVuetify(resolvedCode);
    applyDocumentLocale(resolvedCode);
  };

  return {
    provide: {
      i18n,
      availableLocales: localesState,
      setLanguage
    }
  };
});
