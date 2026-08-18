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

  const query = getQuery(event);
  const key = query.key as string;
  
  if (!key) {
    throw createError({ statusCode: 400, message: 'errors.validationFailed' });
  }

  const tenantSlug = event.context.tenantSlug || 'master';
  const sql = useDB(tenantSlug);

  try {
    const langs = await sql`SELECT code, translations FROM languages`;
    for (const lang of langs) {
      if (lang.translations) {
        try {
          const transObj = typeof lang.translations === 'string' ? JSON.parse(lang.translations) : lang.translations;
          if (transObj[key] !== undefined) {
            delete transObj[key];
            await sql`
              UPDATE languages 
              SET translations = ${JSON.stringify(transObj)}, updated_at = CURRENT_TIMESTAMP 
              WHERE code = ${lang.code}
            `;
          }
        } catch (e) {}
      }
    }
    bumpGlobalVersion(tenantSlug);
    return { success: true };
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message });
  }
});
