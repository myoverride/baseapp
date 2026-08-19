import { useDB } from '../../../utils/db';
import {} from '../../../utils/globalsManager';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  const method = getMethod(event);
  const sql = useDB(event.context.tenantSlug);
  const id = event.context.params?.id;
  if (!id) throw createError({ statusCode: 400, message: 'errors.idRequired' });

  if (method === 'GET') {
    const records = await sql.unsafe('SELECT * FROM globals WHERE id = ?', [id]);
    if (!records.length) throw createError({ statusCode: 404, message: 'errors.notFound' });
    const r = records[0];
    if (typeof r.hashtags === 'string') r.hashtags = JSON.parse(r.hashtags || '[]');
    if (typeof r.scope === 'string') r.scope = JSON.parse(r.scope || '[]');
    
    // Maske: Hash'li şifreleri arayüze gönderme
    if (r.data_type === 'password' && r.hash_algorithm !== 'plain') {
      r.value = ''; 
    }
    
    return r;
  }

  if (method === 'PUT') {
    const body = await readBody(event);
    const oldRec = await sql.unsafe('SELECT type FROM globals WHERE id = ?', [id]);
    if (!oldRec.length) throw createError({ statusCode: 404, message: 'errors.notFound' });
    const globalType = oldRec[0].type;

    if (globalType === 'util' && body.code) {
      try {
        const { validateJS } = await import('../../../utils/codeValidator');
        await validateJS(body.code, `Util: ${body.name || 'Bilinmeyen'}`);
      } catch (err: any) {
        throw createError({ statusCode: 400, message: err.key || 'errors.databaseError', data: err.key ? err.params : undefined });
      }
    }

    if (body.key) {
      const existing = await sql.unsafe('SELECT id FROM globals WHERE key = ? AND id != ?', [body.key, id]);
      if (existing.length > 0) {
        throw createError({ statusCode: 409, message: 'errors.alreadyExists' });
      }
    }

    const isVar = globalType === 'variable';
    const isUtil = globalType === 'util';

    const key = body.key;
    let value = isVar ? (body.value || '') : null;
    const code = isUtil ? (body.code || '') : null;
    const data_type = isVar ? (body.data_type || 'string') : null;
    
    const hashAlgo = data_type === 'password' ? (body.hash_algorithm || 'plain') : 'plain';
    
    // Eğer şifre alanıysa ve yeni değer girilmemişse (boş gelmişse veya *** ise), eski değeri koru
    if (data_type === 'password' && (!value || value === '***')) {
      const existingVal = await sql.unsafe('SELECT value FROM globals WHERE id = ?', [id]);
      if (existingVal.length > 0) value = existingVal[0].value;
    } else if (data_type === 'password' && value) {
      // Yeni şifre girilmiş, hash algoritmasına göre şifrele
      if (hashAlgo === 'bcrypt') {
        const bcrypt = await import('bcryptjs');
        value = await bcrypt.default.hash(value, 10);
      } else if (hashAlgo === 'sha256') {
        const crypto = await import('crypto');
        value = crypto.createHash('sha256').update(value).digest('hex');
      }
    }

    const target = body.target || 'shared';
    const active = body.active !== undefined ? (body.active ? 1 : 0) : 1;
    const scope = isUtil ? (Array.isArray(body.scope) ? JSON.stringify(body.scope) : body.scope) : '[]';
    const hashtags = Array.isArray(body.hashtags) ? JSON.stringify(body.hashtags) : (body.hashtags || '[]');
    const description = body.description || '';
    const isSystem = user.is_super_admin ? 1 : 0;

    await sql.unsafe(`
      UPDATE globals SET 
        key = ?, value = ?, code = ?, data_type = ?, hash_algorithm = ?, target = ?,
        active = ?, scope = ?,
        description = ?, hashtags = ?, updated_by = ?, system_modified = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      key, value, code, data_type, hashAlgo, target,
      active, scope,
      description, hashtags, user.id, isSystem, id
    ]);

    const updatedRec = await sql.unsafe('SELECT * FROM globals WHERE id = ?', [id]);
    if (updatedRec.length > 0) {
      import('../../../utils/history').then(m => m.saveHistory(event.context.tenantSlug, 'globals', id, updatedRec[0])).catch(console.error);
    }

    globals.invalidate(event.context.tenantSlug);
    import('../../../utils/versionManager').then(m => m.bumpGlobalVersion(event.context.tenantSlug));
    if (isUtil) {
      const { clearSandboxCache } = await import('../../../utils/sandbox');
      clearSandboxCache();
    }
    return { success: true, message: 'message.success' };
  }

  if (method === 'DELETE') {
    const oldRec = await sql.unsafe('SELECT type, protected FROM globals WHERE id = ?', [id]);
    if (!oldRec.length) throw createError({ statusCode: 404, message: 'errors.notFound' });
    if (oldRec[0].protected === 1 || oldRec[0].protected === true) {
      throw createError({ statusCode: 403, message: 'errors.forbidden' });
    }

    const globalType = oldRec[0].type;
    const recToDelete = await sql.unsafe('SELECT * FROM globals WHERE id = ?', [id]);
    await sql.unsafe('DELETE FROM globals WHERE id = ?', [id]);

    if (recToDelete.length > 0) {
      import('../../../utils/history').then(m => m.saveHistory(event.context.tenantSlug, 'globals', id, recToDelete[0])).catch(console.error);
    }

    globals.invalidate(event.context.tenantSlug);
    import('../../../utils/versionManager').then(m => m.bumpGlobalVersion(event.context.tenantSlug));
    if (globalType === 'util') {
      const { clearSandboxCache } = await import('../../../utils/sandbox');
      clearSandboxCache();
    }
    return { success: true, message: 'message.success', data: { deletedId: id } };
  }
});
