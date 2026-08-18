import { useDB } from '../../../utils/db';
import {} from '../../../utils/globalsManager';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  if (!user) {
    throw createError({ statusCode: 401, message: 'errors.loginRequired' });
  }
  if (!user.is_admin && !user.is_super_admin) {
    throw createError({ statusCode: 403, message: 'errors.forbiddenAdminOnly' });
  }
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
    const value = isVar ? (body.value || '') : null;
    const code = isUtil ? (body.code || '') : null;
    const data_type = isVar ? (body.data_type || 'string') : null;
    const target = body.target || 'shared';
    const is_public = body.is_public ? 1 : 0;
    const is_secret = body.is_secret ? 1 : 0;
    const active = body.active !== undefined ? (body.active ? 1 : 0) : 1;
    const scope = isUtil ? (Array.isArray(body.scope) ? JSON.stringify(body.scope) : body.scope) : '[]';
    const description = body.description || '';
    const hashtags = Array.isArray(body.hashtags) ? JSON.stringify(body.hashtags) : (body.hashtags || '[]');

    await sql.unsafe(`
      UPDATE globals SET 
        key = ?, value = ?, code = ?, data_type = ?, target = ?,
        is_public = ?, is_secret = ?, active = ?, scope = ?,
        description = ?, hashtags = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      key, value, code, data_type, target,
      is_public, is_secret, active, scope,
      description, hashtags, user.id, id
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
