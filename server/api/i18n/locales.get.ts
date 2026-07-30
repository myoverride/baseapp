import { useDB } from '../../utils/db';

export default defineEventHandler(async (event) => {
  const tenantSlug = event.context.tenantSlug || 'master';

  try {
    const localesMap = new Map<string, any>();

    // 1. Fetch from master first
    const masterSql = useDB('master');
    const masterLocales = await masterSql`SELECT * FROM languages WHERE is_active = 1`;
    
    for (const loc of masterLocales) {
      delete loc.translations;
      localesMap.set(loc.code, loc);
    }

    // 2. Fetch from tenant to override
    if (tenantSlug !== 'master') {
      const tenantSql = useDB(tenantSlug);
      // Only get active ones or ones explicitly set
      const tenantLocales = await tenantSql`SELECT * FROM languages`;
      
      for (const loc of tenantLocales) {
        delete loc.translations;
        if (loc.is_active) {
          localesMap.set(loc.code, loc);
        } else {
          // If a tenant explicitly disabled a master language, remove it
          localesMap.delete(loc.code);
        }
      }
    }

    return Array.from(localesMap.values());
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message });
  }
});
