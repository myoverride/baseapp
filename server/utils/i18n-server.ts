import { useDB, getMasterDb } from './db';

import { LRUCache } from 'lru-cache';
// Cache structure: tenantSlug -> locale -> key -> value
const i18nCache = new LRUCache<string, Map<string, Record<string, string>>>({ max: 1000 });
let isInitialized = false;

export async function initI18nCache(force = false) {
  if (isInitialized && !force) return;

  if (force) {
    i18nCache.clear();
    isInitialized = false;
  }
  try {
    // 1. Load Master Translations
    const masterSql = useDB('master');
    const masterTrans = await masterSql`SELECT language_code as locale, key, value FROM translations`;
    
    const masterMap = new Map<string, Record<string, string>>();
    for (const row of masterTrans) {
      if (!masterMap.has(row.locale)) {
        masterMap.set(row.locale, {});
      }
      masterMap.get(row.locale)![row.key] = row.value;
    }
    i18nCache.set('master', masterMap);

    // 2. Load Tenant Translations
    const sysDb = getMasterDb();
    const tenants = await sysDb`SELECT slug FROM tenants`;
    for (const tenant of tenants) {
      const slug = tenant.slug;
      if (slug === 'master') continue;
      
      try {
        const tenantSql = useDB(slug);
        const tenantTrans = await tenantSql`SELECT language_code as locale, key, value FROM translations`;
        
        const tenantMap = new Map<string, Record<string, string>>();
        for (const row of tenantTrans) {
          if (!tenantMap.has(row.locale)) {
            tenantMap.set(row.locale, {});
          }
          tenantMap.get(row.locale)![row.key] = row.value;
        }
        i18nCache.set(slug, tenantMap);
      } catch (e) {
        // tenant db might not exist yet, ignore
      }
    }
    
    isInitialized = true;
    console.log('[i18n-server] In-memory translation cache initialized from languages table.');
  } catch (err) {
    console.error('[i18n-server] Failed to initialize cache:', err);
  }
}

export function invalidateI18nCache(tenantSlug: string) {
  i18nCache.delete(tenantSlug);
}

export function getServerTranslation(tenantSlug: string, locale: string, key: string, params?: Record<string, any>): string {
  // Fallbacks: locale -> 'en', tenantSlug -> 'master'
  const targetLocale = locale || 'en';
  const targetTenant = tenantSlug || 'master';

  // Find in tenant's overrides
  let result: string | undefined;
  if (targetTenant !== 'master' && i18nCache.has(targetTenant)) {
    const tenantLocales = i18nCache.get(targetTenant);
    if (tenantLocales && tenantLocales.has(targetLocale)) {
      result = tenantLocales.get(targetLocale)![key];
    }
  }

  // Fallback to master
  if (!result && i18nCache.has('master')) {
    const masterLocales = i18nCache.get('master');
    if (masterLocales && masterLocales.has(targetLocale)) {
      result = masterLocales.get(targetLocale)![key];
    }
  }

  // If still not found, return key
  let text = result || key;

  // Replace params e.g., { name: 'Murat' } in "Hello {name}"
  if (params && typeof text === 'string') {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }

  return text;
}


