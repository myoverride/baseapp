import { useDB } from '../../../utils/db';
import { invalidateSysVarCache } from '../../../utils/sysvars';
import { clearSandboxCache } from '../../../utils/sandbox';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  if (!user || !user.is_admin) throw createError({ statusCode: 403, message: 'errors.unauthorized' });

  const method = getMethod(event);
  const id = getRouterParam(event, 'id');
  const sql = useDB(event.context.tenantSlug);

  if (!id) {
    throw createError({ statusCode: 400, message: 'errors.validationFailed' });
  }

  if (method === 'GET') {
    const existingArr = await sql`SELECT * FROM system_variables WHERE id = ${id}`;
    if (!existingArr || existingArr.length === 0) {
       throw createError({ statusCode: 404, message: 'errors.notFound' });
    }
    return existingArr[0];
  }

  if (method === 'PUT') {
    const body = await readBody(event);
    if (!body.key) {
      throw createError({ statusCode: 400, message: 'errors.validationFailed' });
    }

    try {
      if (!/^[a-zA-Z0-9_]+$/.test(body.key)) {
        throw createError({ statusCode: 400, message: 'errors.invalidKeyFormat' });
      }

      const existingArr = await sql`SELECT * FROM system_variables WHERE id = ${id}`;
      if (!existingArr || existingArr.length === 0) {
         throw createError({ statusCode: 404, message: 'errors.notFound' });
      }
      const existing = existingArr[0];

      let target = body.target || 'shared';
      let isPublic = target === 'api' ? 0 : (body.is_public === true ? 1 : 0);
      let isSecret = body.is_secret === true ? 1 : 0;
      let type = body.type || 'string';
      let key = body.key;

      if (existing.protected === 1 || existing.protected === true) {
        key = existing.key;
        target = existing.target;
        isPublic = existing.is_public;
        isSecret = existing.is_secret;
        type = existing.type;
      }

      let value = body.value;
      if (value === '********') {
         // Do not update the value if it's masked
         value = existing.value;
      } else if (!value) {
         value = '';
      }

      await sql`
        UPDATE system_variables 
        SET key = ${key}, value = ${value}, description = ${body.description || null}, 
            target = ${target}, is_public = ${isPublic}, is_secret = ${isSecret}, type = ${type}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
      `;
      invalidateSysVarCache(event.context.tenantSlug);
      clearSandboxCache('mqtt_sandbox');
      return { success: true, message: tEvent(event, 'message.entityUpdated', { name: 'entity.var' }) };
    } catch (err: any) {
      if (err.message?.includes('UNIQUE')) {
        throw createError({ statusCode: 400, message: 'errors.duplicateKey' });
      }
      throw createError({ statusCode: 500, message: err.message });
    }
  }

  if (method === 'DELETE') {
    try {
      const existingArr = await sql`SELECT key, protected FROM system_variables WHERE id = ${id}`;
      if (existingArr && existingArr.length > 0) {
        const existing = existingArr[0];
        if (existing.protected === 1 || existing.protected === true) {
          throw createError({ statusCode: 403, message: 'Bu bir sistem değişkenidir, silinemez!' });
        }
      }

      await sql`DELETE FROM system_variables WHERE id = ${id}`;
      invalidateSysVarCache(event.context.tenantSlug);
      clearSandboxCache('mqtt_sandbox');
      return { success: true, message: tEvent(event, 'message.entityDeleted', { name: 'entity.var' }) };
    } catch (err: any) {
      throw createError({ statusCode: 500, message: err.message });
    }
  }
});
