import { useDB } from '../../../../utils/db';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  if (!user || (!user.is_admin && !user.is_super_admin)) {
    throw createError({ statusCode: 403, message: 'errors.unauthorized' });
  }

  const tenantSlug = event.context.tenantSlug || 'master';
  const sql = useDB(tenantSlug);
  const body = await readBody(event);

  // BULK IMPORT LOGIC
  if (body.records && Array.isArray(body.records)) {
    let updatedCount = 0;
    let insertedCount = 0;

    for (const rec of body.records) {
      const code = String(rec.code || '').trim();
      const name = String(rec.name || '').trim();
      if (!code || !name) continue;

      const dir = rec.dir === 'rtl' ? 'rtl' : 'ltr';
      const isActive = rec.is_active !== false && rec.is_active !== 0 ? 1 : 0;
      const hashtags = Array.isArray(rec.hashtags) ? JSON.stringify(rec.hashtags) : (typeof rec.hashtags === 'string' ? rec.hashtags : '[]');

      const existing = await sql.unsafe('SELECT code FROM languages WHERE code = ?', [code]);
      
      if (existing.length > 0) {
        await sql.unsafe('UPDATE languages SET name = ?, dir = ?, is_active = ?, hashtags = ? WHERE code = ?', [name, dir, isActive, hashtags, code]);
        updatedCount++;
      } else {
        await sql.unsafe('INSERT INTO languages (code, name, dir, is_active, hashtags) VALUES (?, ?, ?, ?, ?)', [code, name, dir, isActive, hashtags]);
        insertedCount++;
      }
    }
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

    await sql.unsafe(`
      INSERT INTO languages (code, name, dir, is_active, hashtags)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET 
        name = excluded.name, 
        dir = excluded.dir, 
        is_active = excluded.is_active,
        hashtags = excluded.hashtags
    `, [body.code, body.name, dir, isActive, hashtags]);

    return { success: true, message: 'message.success' };
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message });
  }
});
