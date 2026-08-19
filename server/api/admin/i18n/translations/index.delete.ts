import { useDB } from '../../../../utils/db';
import { bumpGlobalVersion } from '../../../../utils/versionManager';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const key = query.key as string;

  if (!key) {
    throw createError({ statusCode: 400, message: 'errors.validationFailed' });
  }

  const tenantSlug = event.context.tenantSlug || 'master';
  const sql = useDB(tenantSlug);

  try {
    // With ON DELETE CASCADE this might be enough, but explicitly deleting translations is safer
    await sql.unsafe('DELETE FROM translations WHERE key = $1', [key]);
    await sql.unsafe('DELETE FROM translation_keys WHERE key = $1', [key]);

    bumpGlobalVersion(tenantSlug);
    return { success: true };
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message });
  }
});
