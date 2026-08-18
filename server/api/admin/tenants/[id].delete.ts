import { getMasterDb } from '../../../utils/db';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  if (!user) {
    throw createError({ statusCode: 401, message: 'errors.loginRequired' });
  }
  if (!user.is_super_admin) {
    throw createError({ statusCode: 403, message: 'errors.forbiddenAdminOnly' });
  }

  const id = event.context.params?.id;
  if (!id) {
    throw createError({ statusCode: 400, message: 'validation.required' });
  }

  const sql = getMasterDb();
  
  try {
    const oldData = await sql`SELECT slug FROM tenants WHERE id = ${id}`;
    const result = await sql`DELETE FROM tenants WHERE id = ${id}`;
    
    if (oldData.length > 0) {
      const slug = oldData[0].slug;
      const { invalidateTenantCache } = await import('../../../middleware/00.tenant');
      invalidateTenantCache(slug);

      const { closeTenantDb, getDbDir } = await import('../../../utils/db');
      await closeTenantDb(slug);

      const { stopAllTenantWorkers } = await import('../../../utils/workerManager');
      await stopAllTenantWorkers(slug);

      const fs = await import('node:fs');
      const path = await import('node:path');
      const dbDir = getDbDir();

      const filesToDelete = [
        `${slug}_app.db`,
        `${slug}_app.db-shm`,
        `${slug}_app.db-wal`,
        `${slug}_telemetry.duckdb`,
        `${slug}_telemetry.duckdb.wal`
      ];

      for (const file of filesToDelete) {
        const filePath = path.join(dbDir, file);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (e) {
            console.error(`Failed to delete DB file: ${filePath}`, e);
          }
        }
      }
    }

    return { success: true, message: tEvent(event, 'message.entityDeleted', { name: tEvent(event, 'entity.tenant') }) };
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message || 'errors.operationFailed' });
  }
});
