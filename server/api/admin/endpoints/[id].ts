import { useDB } from '../../../utils/db';
import { clearSandboxCache } from '../../../utils/sandbox';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  const method = getMethod(event);
  const sql = useDB(event.context.tenantSlug);
  const id = event.context.params?.id;
  if (!id) throw createError({ statusCode: 400, message: 'errors.idRequired' });

  if (method === 'GET') {
    const records = await sql.unsafe('SELECT * FROM endpoints WHERE id = ?', [id]);
    if (!records.length) throw createError({ statusCode: 404, message: 'errors.notFound' });
    const r = records[0];
    if (typeof r.hashtags === 'string') r.hashtags = JSON.parse(r.hashtags || '[]');
    return r;
  }

  if (method === 'PUT') {
    const body = await readBody(event);

    if (body.code) {
      try {
        const { validateJS } = await import('../../../utils/codeValidator');
        await validateJS(body.code, `Endpoint: ${body.name || 'Bilinmeyen'}`);
      } catch (err: any) {
        throw createError({ statusCode: 400, message: err.key || 'errors.databaseError', data: err.key ? err.params : undefined });
      }
    }

    if (body.name) {
      const existing = await sql.unsafe('SELECT id FROM endpoints WHERE name = ? AND id != ?', [body.name, id]);
      if (existing.length > 0) {
        throw createError({ statusCode: 409, message: 'errors.alreadyExists' });
      }
    }

    const hashtagsStr = JSON.stringify(body.hashtags || []);
    const isSystem = user.is_super_admin ? 1 : 0;
    await sql.unsafe(`
      UPDATE endpoints SET 
        name = ?, type = ?, route_pattern = ?, code = ?, priority = ?, active = ?, is_public = ?, hashtags = ?, updated_by = ?, system_modified = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      body.name, body.type, body.route_pattern, body.code, body.priority || 0,
      body.active ? 1 : 0, body.is_public ? 1 : 0, hashtagsStr, user.id, isSystem, id
    ]);
    const updatedRec = await sql.unsafe('SELECT * FROM endpoints WHERE id = ?', [id]);
    if (updatedRec.length > 0) {
      import('../../../utils/history').then(m => m.saveHistory(event.context.tenantSlug, 'endpoints', id, updatedRec[0])).catch(console.error);
    }
    import('../../../utils/endpointManager').then(m => m.invalidateEndpointCache(event.context.tenantSlug)).catch(console.error);
    clearSandboxCache(); // S4 Fix: Eski derlenmiş script cache'ini temizle
    return { success: true };
  }

  if (method === 'DELETE') {
    const recToDelete = await sql.unsafe('SELECT * FROM endpoints WHERE id = ?', [id]);
    await sql.unsafe('DELETE FROM endpoints WHERE id = ?', [id]);
    if (recToDelete.length > 0) {
      import('../../../utils/history').then(m => m.saveHistory(event.context.tenantSlug, 'endpoints', id, recToDelete[0])).catch(console.error);
    }
    import('../../../utils/endpointManager').then(m => m.invalidateEndpointCache(event.context.tenantSlug)).catch(console.error);
    clearSandboxCache(); // S4 Fix: Silinen endpoint'in cache'ini temizle
    return { success: true };
  }
});
