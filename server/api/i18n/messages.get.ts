import { useDB } from '../../utils/db';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const locale = query.locale as string;
  
  if (!locale) {
    throw createError({ statusCode: 400, message: tEvent(event, 'errors.validationFailed') });
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
    const result: any = {};
    
    for (const [key, value] of Object.entries(messages)) {
      const parts = key.split('.');
      let current = result;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i] as string;
        if (i === parts.length - 1) {
          current[part] = value;
        } else {
          if (!current[part]) current[part] = {};
          current = current[part];
        }
      }
    }

    return result;
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message });
  }
});
