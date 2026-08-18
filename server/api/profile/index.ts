import { useDB } from '../../utils/db';
import { getVapidKeys } from '../../utils/vapid';

export default defineEventHandler(async (event) => {
  const method = event.method;
  const user = event.context.user;
  const tenantSlug = event.context.tenantSlug;

  if (!user || !tenantSlug) {
    throw createError({ statusCode: 401, message: 'errors.unauthorized' });
  }

  const sql = useDB(tenantSlug);

  if (method === 'GET') {
    // Return profile
    const result = await sql`SELECT id, username, is_admin, role_id, profile FROM users WHERE id = ${user.id}`;
    if (!result || result.length === 0) {
      throw createError({ statusCode: 404, message: tEvent(event, 'error.notFound') });
    }
    const userData = result[0];
    if (typeof userData.profile === 'string') {
      try {
        userData.profile = JSON.parse(userData.profile);
      } catch {
        userData.profile = {};
      }
    } else if (!userData.profile) {
      userData.profile = {};
    }
    return userData;
  }

  if (method === 'PUT') {
    const body = await readBody(event);
    
    // Sadece profile alanının güncellenmesine izin verelim şimdilik, (ileride şifre de eklenebilir)
    const existing = await sql`SELECT profile FROM users WHERE id = ${user.id}`;
    if (!existing || existing.length === 0) {
      throw createError({ statusCode: 404, message: tEvent(event, 'error.notFound') });
    }
    
    let currentProfile = {};
    if (existing[0].profile) {
      if (typeof existing[0].profile === 'string') {
        try {
          currentProfile = JSON.parse(existing[0].profile);
        } catch {
          currentProfile = {};
        }
      } else {
        currentProfile = existing[0].profile;
      }
    }
    
    if (body.profile) {
      currentProfile = { ...currentProfile, ...body.profile };
    }

    if (body.password) {
      if (!body.password.old || !body.password.new) {
        throw createError({ statusCode: 400, message: 'errors.passwordFieldsRequired' });
      }
      
      const userResult = await sql`SELECT password_hash FROM users WHERE id = ${user.id}`;
      if (!userResult || userResult.length === 0) {
        throw createError({ statusCode: 404, message: tEvent(event, 'error.notFound') });
      }

      const bcrypt = await import('bcryptjs');
      const isValid = bcrypt.default.compareSync(body.password.old, userResult[0].password_hash);
      if (!isValid) {
        throw createError({ statusCode: 400, message: 'errors.oldPasswordIncorrect' });
      }
      
      const newHash = bcrypt.default.hashSync(body.password.new, 10);
      const updatedProfileStr = JSON.stringify(currentProfile);
      
      await sql`UPDATE users SET password_hash = ${newHash}, profile = ${updatedProfileStr}, updated_at = CURRENT_TIMESTAMP WHERE id = ${user.id}`;
      return { success: true, profile: currentProfile, passwordChanged: true };
    }

    const updatedProfileStr = JSON.stringify(currentProfile);
    await sql`UPDATE users SET profile = ${updatedProfileStr}, updated_at = CURRENT_TIMESTAMP WHERE id = ${user.id}`;
    
    return { success: true, profile: currentProfile };
  }
});
