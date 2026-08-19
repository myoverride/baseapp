import { useDB } from '../../../../utils/db';
import { bumpGlobalVersion } from '../../../../utils/versionManager';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  const tenantSlug = event.context.tenantSlug || 'master';
  const sql = useDB(tenantSlug);

  const body = await readBody(event);
  const isSystem = user.is_super_admin ? 1 : 0;
  
  const updateLanguageTranslations = async (locale: string, key: string, val: string | null) => {
    if (val === null || val === '') {
      await sql.unsafe('DELETE FROM translations WHERE language_code = $1 AND key = $2', [locale, key]);
    } else {
      await sql.unsafe(`
        INSERT INTO translations (key, language_code, value, created_by, updated_by, system_created, system_modified) 
        VALUES ($1, $2, $3, $4, $4, $5, $5) 
        ON CONFLICT(language_code, key) DO UPDATE 
        SET value = excluded.value, updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by, system_modified = excluded.system_modified
      `, [key, locale, val, user.id, isSystem]);
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
      await sql.unsafe('INSERT INTO translation_keys (key, hashtags, created_by, updated_by, system_created, system_modified) VALUES ($1, $2, $3, $3, $4, $4) ON CONFLICT(key) DO UPDATE SET hashtags = excluded.hashtags, updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by, system_modified = excluded.system_modified', [key, hashtagsStr, user.id, isSystem]);
      
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
    await sql.unsafe('INSERT INTO translation_keys (key, hashtags, created_by, updated_by, system_created, system_modified) VALUES ($1, $2, $3, $3, $4, $4) ON CONFLICT(key) DO UPDATE SET hashtags = excluded.hashtags, updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by, system_modified = excluded.system_modified', [key, hashtagsStr, user.id, isSystem]);

    bumpGlobalVersion(tenantSlug);
    return { success: true };
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message });
  }
});
