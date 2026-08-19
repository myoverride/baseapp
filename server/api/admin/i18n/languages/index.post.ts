import { useDB } from '../../../../utils/db';
import { bumpGlobalVersion } from '../../../../utils/versionManager';

export default defineEventHandler(async (event) => {


  const tenantSlug = event.context.tenantSlug || 'master';
  const sql = useDB(tenantSlug);
  const body = await readBody(event);

  // BULK IMPORT LOGIC
  if (body.records && Array.isArray(body.records)) {
    let updatedCount = 0;
    let insertedCount = 0;
    const isSystem = event.context.user?.is_super_admin ? 1 : 0;
    const userId = event.context.user?.id || null;

    for (const rec of body.records) {
      const code = String(rec.code || '').trim();
      const name = String(rec.name || '').trim();
      if (!code || !name) continue;

      const dir = rec.dir === 'rtl' ? 'rtl' : 'ltr';
      const isActive = rec.is_active !== false && rec.is_active !== 0 ? 1 : 0;
      const hashtags = Array.isArray(rec.hashtags) ? JSON.stringify(rec.hashtags) : (typeof rec.hashtags === 'string' ? rec.hashtags : '[]');

      const existing = await sql.unsafe('SELECT code FROM languages WHERE code = ?', [code]);

      if (existing.length > 0) {
        await sql.unsafe('UPDATE languages SET name = ?, dir = ?, is_active = ?, hashtags = ?, updated_by = ?, system_modified = ? WHERE code = ?', [name, dir, isActive, hashtags, userId, isSystem, code]);
        updatedCount++;
      } else {
        await sql.unsafe('INSERT INTO languages (code, name, dir, is_active, hashtags, created_by, updated_by, system_created, system_modified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [code, name, dir, isActive, hashtags, userId, userId, isSystem, isSystem]);
        insertedCount++;
      }
    }
    bumpGlobalVersion(tenantSlug);
    return { success: true, message: 'success.importSuccessful' };
  }

  // SINGLE CREATE LOGIC
  if (!body.code || !body.name) {
    throw createError({ statusCode: 400, message: 'errors.validationFailed' });
  }

  try {
    const isActive = body.is_active !== false ? 1 : 0;
    const dir = body.dir === 'rtl' ? 'rtl' : 'ltr';
    const hashtags = Array.isArray(body.hashtags) ? JSON.stringify(body.hashtags) : (typeof body.hashtags === 'string' ? body.hashtags : '[]');
    const isSystem = event.context.user?.is_super_admin ? 1 : 0;
    const userId = event.context.user?.id || null;

    await sql.unsafe(`
      INSERT INTO languages (code, name, dir, is_active, hashtags, created_by, updated_by, system_created, system_modified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET 
        name = excluded.name, 
        dir = excluded.dir, 
        is_active = excluded.is_active,
        hashtags = excluded.hashtags,
        updated_by = excluded.updated_by,
        system_modified = excluded.system_modified
    `, [body.code, body.name, dir, isActive, hashtags, userId, userId, isSystem, isSystem]);

    bumpGlobalVersion(tenantSlug);
    return { success: true, message: 'message.success' };
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message });
  }
});
