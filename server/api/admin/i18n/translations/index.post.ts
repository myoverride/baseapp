import { useDB } from '../../../../utils/db';
import { bumpGlobalVersion } from '../../../../utils/versionManager';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  if (!user) {
    throw createError({ statusCode: 401, message: 'errors.loginRequired' });
  }
  if (!user.is_admin && !user.is_super_admin) {
    throw createError({ statusCode: 403, message: 'errors.forbiddenAdminOnly' });
  }

  const tenantSlug = event.context.tenantSlug || 'master';
  const sql = useDB(tenantSlug);

  const body = await readBody(event);
  
  const updateLanguageTranslations = async (locale: string, key: string, val: string | null) => {
    const langs = await sql.unsafe('SELECT translations FROM languages WHERE code = ?', [locale]);
    if (langs.length > 0) {
      let transObj: Record<string, string> = {};
      if (langs[0].translations) {
        try {
          transObj = typeof langs[0].translations === 'string' ? JSON.parse(langs[0].translations) : langs[0].translations;
        } catch (e) {
          console.error('Failed to parse translations in post API', e);
        }
      }
      
      if (val === null || val === '') {
        delete transObj[key];
      } else {
        transObj[key] = val;
      }

      await sql.unsafe('UPDATE languages SET translations = ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?', [JSON.stringify(transObj), locale]);
    }
  };

  // BULK IMPORT LOGIC
  if (body.records && Array.isArray(body.records)) {
    let updatedCount = 0;

    for (const rec of body.records) {
      const key = String(rec?.key || '').trim();
      const values = rec.values || {};
      if (!key) continue;

      let hasUpdate = false;

      for (const [locale, val] of Object.entries(values)) {
        if (typeof val !== 'string' || val.trim() === '') {
           await updateLanguageTranslations(locale, key, null);
           hasUpdate = true;
           continue;
        }

        await updateLanguageTranslations(locale, key, val);
        hasUpdate = true;
      }
      
      // Update hashtags
      const hashtagsArr = rec.hashtags || [];
      const hashtagsStr = Array.isArray(hashtagsArr) ? JSON.stringify(hashtagsArr) : (typeof hashtagsArr === 'string' ? hashtagsArr : '[]');
      await sql.unsafe('INSERT INTO translation_keys (key, hashtags) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET hashtags = excluded.hashtags, updated_at = CURRENT_TIMESTAMP', [key, hashtagsStr]);
      
      if (hasUpdate) updatedCount++;
    }
    bumpGlobalVersion(tenantSlug);
    return { success: true, message: 'success.importSuccessful' };
  }

  // SINGLE CREATE LOGIC
  const { key, values, hashtags } = body;

  if (!key || typeof key !== 'string') {
    throw createError({ statusCode: 400, message: 'errors.validationFailed' });
  }

  if (!values || typeof values !== 'object') {
    throw createError({ statusCode: 400, message: 'errors.validationFailed' });
  }

  try {
    for (const [locale, value] of Object.entries(values)) {
      if (typeof value !== 'string' || value.trim() === '') {
        if (value === '') {
          await updateLanguageTranslations(locale, key, null);
        }
        continue;
      }

      await updateLanguageTranslations(locale, key, value);
    }

    const hashtagsArr = hashtags || [];
    const hashtagsStr = Array.isArray(hashtagsArr) ? JSON.stringify(hashtagsArr) : (typeof hashtagsArr === 'string' ? hashtagsArr : '[]');
    await sql.unsafe('INSERT INTO translation_keys (key, hashtags) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET hashtags = excluded.hashtags, updated_at = CURRENT_TIMESTAMP', [key, hashtagsStr]);

    bumpGlobalVersion(tenantSlug);
    return { success: true };
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message });
  }
});
