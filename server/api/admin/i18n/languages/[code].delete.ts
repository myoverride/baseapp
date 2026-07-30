import { useDB } from '../../../../utils/db';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  if (!user || (!user.is_admin && !user.is_super_admin)) {
    throw createError({ statusCode: 403, message: 'errors.unauthorized' });
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

    return { success: true, message: 'message.success' };
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message });
  }
});
