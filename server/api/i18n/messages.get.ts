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
        if (r.key && r.value !== undefined) {
           messages[r.key] = r.value;
        }
      }
    };

    // 1. Fetch from master first
    const masterSql = useDB('master');
    const masterTranslations = await masterSql.unsafe('SELECT key, value FROM translations WHERE language_code = $1', [locale]);
    extractMessages(masterTranslations);

    // 2. Fetch from tenant to override
    if (tenantSlug !== 'master') {
      const tenantSql = useDB(tenantSlug);
      // Ensure we don't crash if tenant hasn't fully migrated yet, but normally table exists
      try {
        const tenantTranslations = await tenantSql.unsafe('SELECT key, value FROM translations WHERE language_code = $1', [locale]);
        extractMessages(tenantTranslations);
      } catch (e) { }
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
