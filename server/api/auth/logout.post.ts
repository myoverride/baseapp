import { useDB } from '../../utils/db';

export default defineEventHandler(async (event) => {
  const token = getCookie(event, 'auth_token');

  if (token) {
    let sql;
    if (event.context.user && event.context.user.is_super_admin) {
      sql = useDB('master');
    } else {
      const tenantSlug = event.context.tenantSlug || 'master';
      sql = useDB(tenantSlug);
    }
    
    // Invalidate the token in database
    await sql`
      UPDATE users 
      SET current_token = NULL, updated_at = CURRENT_TIMESTAMP 
      WHERE current_token = ${token}
    `.catch(() => {});
  }

  // Clear cookie
  deleteCookie(event, 'auth_token', {
    path: '/'
  });

  return { success: true };
});
