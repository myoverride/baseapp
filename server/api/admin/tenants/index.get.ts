import { getMasterDb } from '../../../utils/db';

export default defineEventHandler(async (event) => {
  // Yalnızca süper admin erişebilir
  const user = event.context.user;
  if (!user || !user.is_super_admin) {
    throw createError({ statusCode: 403, message: 'errors.unauthorized' });
  }

  const sql = getMasterDb();
  
  try {
    const tenants = await sql`SELECT * FROM tenants ORDER BY created_at DESC`;
    return tenants;
  } catch (err: any) {
    throw createError({ statusCode: 500, message: 'errors.operationFailed' });
  }
});
