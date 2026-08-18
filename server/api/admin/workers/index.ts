import { useDB } from '../../../utils/db';
import { type FilterGroup } from '../../../utils/filterEngine';
import { buildGenericFilter } from '../../../utils/queryBuilder';
import { validateJS } from '../../../utils/codeValidator';

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

  if (method === 'GET') {
    const query = getQuery(event);
    const type = query.type as string | undefined;
    const search = ((query.search as string) || '').replace(/^#/, '');
    const page = Math.max(1, parseInt(query.page as string) || 1);
    const limit = Math.max(1, parseInt(query.limit as string) || 25);
    const sortBy = (query.sortBy as string) || 'created_at';
    const sortOrder = (query.sortOrder as string) === 'asc' ? 'ASC' : 'DESC';
    const offset = (page - 1) * limit;

    const allowedSort = ['name', 'type', 'active', 'status', 'created_at', 'updated_at', 'last_run_second'];
    const safeSort = allowedSort.includes(sortBy) ? sortBy : 'created_at';

    let whereClause = 'WHERE 1 = 1';
    const params: any[] = [];

    if (type) {
      whereClause += ' AND type = ?';
      params.push(type);
    }
    if (search) {
      whereClause += ' AND (name LIKE ? OR hashtags LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const filtersParam = (query.advancedFilters || query.filters) as string;
    if (filtersParam) {
      try {
        const filterAst = JSON.parse(filtersParam) as FilterGroup;
        const sqlFilter = buildGenericFilter(filterAst, params.length + 1);
        if (sqlFilter.fragment) {
          whereClause += ` AND ${sqlFilter.fragment}`;
          params.push(...sqlFilter.params);
        }
      } catch (e) { }
    }

    const countRes = await sql.unsafe(`SELECT COUNT(*) as c FROM workers ${whereClause}`, params);

    const isExport = query.export === 'true';
    const selectCols = isExport
      ? '*'
      : 'id, name, type, cron_expression, autostart, active, status, error_msg, last_run_second, hashtags, created_at, updated_at';

    const records = await sql.unsafe(
      `SELECT ${selectCols} 
       FROM workers ${whereClause} ORDER BY ${safeSort} ${sortOrder} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return { success: true, data: records, pagination: { total: countRes[0]?.c || 0, page, limit } };
  }

  if (method === 'POST') {
    const body = await readBody(event);

    // BULK IMPORT LOGIC
    if (body.records && Array.isArray(body.records)) {
      // PRE-SAVE VALIDATION (SHIELD)
      try {
        for (const rec of body.records) {
          if (rec.code) {
            await validateJS(rec.code, `Worker: ${rec.name || 'Bilinmeyen'}`);
          }
        }
      } catch (err: any) {
        throw createError({ statusCode: 400, message: err.key || 'errors.databaseError', data: err.key ? err.params : undefined });
      }

      let importedCount = 0;
      for (const rec of body.records) {
        if (!rec.name) continue;
        const existing = await sql.unsafe('SELECT id FROM workers WHERE name = ?', [rec.name]);
        const hashtagsStr = typeof rec.hashtags === 'string' ? rec.hashtags : JSON.stringify(rec.hashtags || []);

        if (existing.length > 0) {
          await sql.unsafe(`
            UPDATE workers SET type = ?, code = ?, cron_expression = ?, autostart = ?, active = ?, hashtags = ?, updated_by = ? WHERE id = ?
          `, [
            rec.type, rec.code, rec.cron_expression || null, rec.autostart ? 1 : 0,
            rec.active ? 1 : 0, hashtagsStr, user.id, existing[0].id
          ]);
        } else {
          await sql.unsafe(`
            INSERT INTO workers (name, type, code, cron_expression, autostart, active, status, hashtags, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, 'stopped', ?, ?, ?)
          `, [
            rec.name, rec.type, rec.code, rec.cron_expression || null, rec.autostart ? 1 : 0,
            rec.active ? 1 : 0, hashtagsStr, user.id, user.id
          ]);
        }
        importedCount++;
      }

      import('../../../utils/history').then(m => m.saveHistory(event.context.tenantSlug, 'workers', 'import', { count: importedCount })).catch(console.error);
      import('../../../utils/workerManager').then(m => m.refreshCronCache()).catch(console.error);
      return { success: true, message: 'message.success' };
    }

    if (body.name) {
      const existing = await sql.unsafe('SELECT id FROM workers WHERE name = ?', [body.name]);
      if (existing.length > 0) {
        throw createError({ statusCode: 409, message: 'errors.alreadyExists' });
      }
    }

    if (body.code) {
      try {
        await validateJS(body.code, `Worker: ${body.name || 'Yeni'}`);
      } catch (err: any) {
        throw createError({ statusCode: 400, message: err.key || 'errors.databaseError', data: err.key ? err.params : undefined });
      }
    }

    const hashtagsStr = JSON.stringify(body.hashtags || []);

    const insertRes = await sql.unsafe(`
      INSERT INTO workers (name, type, code, cron_expression, autostart, active, status, hashtags, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, 'stopped', ?, ?, ?)
      RETURNING *
    `, [
      body.name, body.type, body.code, body.cron_expression || null, body.autostart ? 1 : 0,
      body.active ? 1 : 0, hashtagsStr, user.id, user.id
    ]);

    if (insertRes.length > 0) {
      import('../../../utils/history').then(m => m.saveHistory(event.context.tenantSlug, 'workers', insertRes[0].id, insertRes[0])).catch(console.error);
    }
    import('../../../utils/workerManager').then(m => m.refreshCronCache()).catch(console.error);
    return { success: true };
  }
});
