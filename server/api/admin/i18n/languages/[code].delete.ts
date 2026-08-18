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

  const code = getRouterParam(event, 'code');
  if (!code) {
    throw createError({ statusCode: 400, message: 'errors.validationFailed' });
  }

  const tenantSlug = event.context.tenantSlug || 'master';
  const sql = useDB(tenantSlug);

  try {
    // (translations are now part of languages JSON, so we just delete the language)
    await sql`DELETE FROM languages WHERE code = ${code}`;
    bumpGlobalVersion(tenantSlug);
    return { success: true, message: 'message.success' };
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message });
  }
});
