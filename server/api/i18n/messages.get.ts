import { useDB } from '../../utils/db';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const locale = query.locale as string;
  
  if (!locale) {
    throw createError({ statusCode: 400, message: 'errors.validationFailed' });
  }

  const tenantSlug = event.context.tenantSlug || 'master';

  try {
    const messages: Record<string, string> = {};

    const extractMessages = (rows: any[]) => {
      for (const r of rows) {
        if (!r.translations) continue;
        try {
          const transObj = typeof r.translations === 'string' ? JSON.parse(r.translations) : r.translations;
          for (const [key, value] of Object.entries(transObj)) {
            messages[key] = value as string;
          }

        } catch (e) {
          console.error(`Error parsing JSON:`, e);
        }
      }
    };

    // 1. Fetch from master first
    const masterSql = useDB('master');
    const masterTranslations = await masterSql`SELECT translations FROM languages WHERE code = ${locale}`;
    extractMessages(masterTranslations);

    // 2. Fetch from tenant to override
    if (tenantSlug !== 'master') {
      const tenantSql = useDB(tenantSlug);
      const tenantTranslations = await tenantSql`SELECT translations FROM languages WHERE code = ${locale}`;
      extractMessages(tenantTranslations);
    }

    // Construct nested object from flat keys (e.g. 'login.button.submit' -> { login: { button: { submit: '...' } } })
    const finalMessages: Record<string, any> = {};
    const processKey = (k: string, v: any) => {
      const parts = k.split('.');
      let current = finalMessages;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i] as string;
        if (i === parts.length - 1) {
          if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
            if (!current[part] || typeof current[part] !== 'object') current[part] = {};
            for (const [subK, subV] of Object.entries(v)) {
              processKey(`${k}.${subK}`, subV);
            }
          } else {
            current[part] = v;
          }
        } else {
          if (!current[part] || typeof current[part] !== 'object') current[part] = {};
          current = current[part];
        }
      }
    };
    for (const [key, value] of Object.entries(messages)) {
      processKey(key, value);
    }
    return finalMessages;
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message });
  }
});
