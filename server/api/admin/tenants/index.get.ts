import { getMasterDb, useDB, getDbDir } from '../../../utils/db';

import fs from 'node:fs';
import path from 'node:path';

export default defineEventHandler(async (event) => {
  // Yalnızca süper admin erişebilir
  const user = event.context.user;


  const sql = getMasterDb();
  
  try {
    const tenants = await sql`SELECT * FROM tenants ORDER BY created_at DESC`;
    const dbDir = getDbDir();

    for (const t of tenants) {
      let sqliteSize = 0;
      let duckdbSize = 0;

      try {
        const sqliteStats = fs.statSync(path.join(dbDir, `${t.slug}_app.db`));
        sqliteSize = sqliteStats.size;
      } catch (e) {
        // file might not exist yet
      }

      try {
        const duckStats = fs.statSync(path.join(dbDir, `${t.slug}_telemetry.duckdb`));
        duckdbSize = duckStats.size;
      } catch (e) {
        // file might not exist yet
      }

      let endpointsCount = 0;
      let entitiesCount = 0;
      let recordsCount = 0;
      let pagesCount = 0;
      let workersCount = 0;
      let devicesCount = 0;
      let usersCount = 0;
      let rolesCount = 0;
      let languagesCount = 0;

      try {
        const tSql = useDB(t.slug);
        endpointsCount = (await tSql`SELECT COUNT(*) as c FROM endpoints`)[0]?.c || 0;
        entitiesCount = (await tSql`SELECT COUNT(*) as c FROM entities`)[0]?.c || 0;
        recordsCount = (await tSql`SELECT COUNT(*) as c FROM records`)[0]?.c || 0;
        pagesCount = (await tSql`SELECT COUNT(*) as c FROM pages`)[0]?.c || 0;
        workersCount = (await tSql`SELECT COUNT(*) as c FROM workers`)[0]?.c || 0;
        devicesCount = (await tSql`SELECT COUNT(*) as c FROM devices`)[0]?.c || 0;
        usersCount = (await tSql`SELECT COUNT(*) as c FROM users`)[0]?.c || 0;
        rolesCount = (await tSql`SELECT COUNT(*) as c FROM roles`)[0]?.c || 0;
        languagesCount = (await tSql`SELECT COUNT(*) as c FROM languages`)[0]?.c || 0;
      } catch(e) {
        // tables might not exist
      }

      (t as any).info = {
        sqliteSize,
        duckdbSize,
        totalSize: sqliteSize + duckdbSize,
        endpointsCount,
        entitiesCount,
        recordsCount,
        pagesCount,
        workersCount,
        devicesCount,
        usersCount,
        rolesCount,
        languagesCount
      };
    }

    return tenants;
  } catch (err: any) {
    throw createError({ statusCode: 500, message: 'errors.operationFailed' });
  }
});
