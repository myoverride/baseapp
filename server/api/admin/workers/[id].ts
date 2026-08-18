import { useDB } from '../../../utils/db';
import { clearSandboxCache } from '../../../utils/sandbox';

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
    const records = await sql.unsafe('SELECT * FROM workers WHERE id = ?', [id]);
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
        await validateJS(body.code, `Worker: ${body.name || 'Bilinmeyen'}`);
      } catch (err: any) {
        throw createError({ statusCode: 400, message: err.key || 'errors.databaseError', data: err.key ? err.params : undefined });
      }
    }

    if (body.name) {
      const existing = await sql.unsafe('SELECT id FROM workers WHERE name = ? AND id != ?', [body.name, id]);
      if (existing.length > 0) {
        throw createError({ statusCode: 409, message: 'errors.alreadyExists' });
      }
    }

    const hashtagsStr = JSON.stringify(body.hashtags || []);
    await sql.unsafe(`
      UPDATE workers SET 
        name = ?, type = ?, code = ?, cron_expression = ?, autostart = ?, active = ?, hashtags = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      body.name, body.type, body.code, body.cron_expression || null, body.autostart ? 1 : 0,
      body.active ? 1 : 0, hashtagsStr, user.id, id
    ]);
    const updatedRec = await sql.unsafe('SELECT * FROM workers WHERE id = ?', [id]);
    if (updatedRec.length > 0) {
      import('../../../utils/history').then(m => m.saveHistory(event.context.tenantSlug, 'workers', id, updatedRec[0])).catch(console.error);
    }
    import('../../../utils/workerManager').then(m => m.refreshCronCache()).catch(console.error);
    clearSandboxCache(); // S4 Fix: Eski derlenmiş script cache'ini temizle
    return { success: true, message: 'message.success' };
  }

  if (method === 'DELETE') {
    const recToDelete = await sql.unsafe('SELECT * FROM workers WHERE id = ?', [id]);
    await sql.unsafe('DELETE FROM workers WHERE id = ?', [id]);
    if (recToDelete.length > 0) {
      import('../../../utils/history').then(m => m.saveHistory(event.context.tenantSlug, 'workers', id, recToDelete[0])).catch(console.error);
    }
    import('../../../utils/workerManager').then(m => m.refreshCronCache()).catch(console.error);
    clearSandboxCache(); // S4 Fix: Silinen worker'ın cache'ini temizle
    return { success: true, message: 'message.success' };
  }
  
  if (method === 'POST') {
    const body = await readBody(event);
    if (body.action === 'start') {
      import('../../../utils/workerManager').then(m => m.startDaemonWorker(event.context.tenantSlug, parseInt(id)));
    } else if (body.action === 'stop') {
      import('../../../utils/workerManager').then(m => m.stopDaemonWorker(event.context.tenantSlug, parseInt(id)));
    }
    return { success: true, message: 'message.success' };
  }
});
