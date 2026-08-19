import { useDB } from '../../../utils/db';
import { type FilterGroup } from '../../../utils/filterEngine';
import { buildGenericFilter } from '../../../utils/queryBuilder';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  const method = getMethod(event);
  const sql = useDB(event.context.tenantSlug);

  if (method === 'GET') {
    const query = getQuery(event);
    const type = query.type as string | undefined;
    const search = ((query.search as string) || '').replace(/^#/, '');
    const page = Math.max(1, parseInt(query.page as string) || 1);
    const limit = Math.max(1, parseInt(query.limit as string) || 25);
    const sortBy = (query.sortBy as string) || 'priority';
    const sortOrder = (query.sortOrder as string) === 'asc' ? 'ASC' : 'DESC';
    const offset = (page - 1) * limit;

    const allowedSort = ['name', 'type', 'route_pattern', 'priority', 'active', 'is_public', 'created_at', 'updated_at'];
    const safeSort = allowedSort.includes(sortBy) ? sortBy : 'priority';

    let whereClause = 'WHERE 1 = 1';
    const params: any[] = [];

    if (type) {
      whereClause += ' AND type = ?';
      params.push(type);
    }
    if (search) {
      whereClause += ' AND (name LIKE ? OR route_pattern LIKE ? OR hashtags LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
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
      } catch(e) { }
    }

    const countRes = await sql.unsafe(`SELECT COUNT(*) as c FROM endpoints ${whereClause}`, params);
    
    const isExport = query.export === 'true';
    const selectCols = isExport 
      ? '*' 
      : 'id, name, type, route_pattern, priority, active, is_public, hashtags, created_at, updated_at';

    const records = await sql.unsafe(
      `SELECT ${selectCols} 
       FROM endpoints ${whereClause} ORDER BY ${safeSort} ${sortOrder} LIMIT ? OFFSET ?`,
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
        const { validateJS } = await import('../../../utils/codeValidator');
        for (const rec of body.records) {
          if (rec.code) {
             await validateJS(rec.code, `Endpoint: ${rec.name || 'Bilinmeyen'}`);
          }
        }
      } catch (err: any) {
        throw createError({ statusCode: 400, message: err.key || 'errors.databaseError', data: err.key ? err.params : undefined });
      }

      let importedCount = 0;
      const isSystem = user.is_super_admin ? 1 : 0;
      for (const rec of body.records) {
        if (!rec.name) continue;
        const existing = await sql.unsafe('SELECT id FROM endpoints WHERE name = ?', [rec.name]);
        const hashtagsStr = typeof rec.hashtags === 'string' ? rec.hashtags : JSON.stringify(rec.hashtags || []);

        if (existing.length > 0) {
          // Update
          await sql.unsafe(`
            UPDATE endpoints SET type = ?, route_pattern = ?, code = ?, priority = ?, active = ?, is_public = ?, hashtags = ?, updated_by = ?, system_modified = ? WHERE id = ?
          `, [
            rec.type, rec.route_pattern, rec.code, rec.priority || 0,
            rec.active ? 1 : 0, rec.is_public ? 1 : 0, hashtagsStr, user.id, isSystem, existing[0].id
          ]);
        } else {
          // Insert
          await sql.unsafe(`
            INSERT INTO endpoints (name, type, route_pattern, code, priority, active, is_public, hashtags, created_by, updated_by, system_created, system_modified)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            rec.name, rec.type, rec.route_pattern, rec.code, rec.priority || 0,
            rec.active ? 1 : 0, rec.is_public ? 1 : 0, hashtagsStr, user.id, user.id, isSystem, isSystem
          ]);
        }
        importedCount++;
      }

      import('../../../utils/history').then(m => m.saveHistory(event.context.tenantSlug, 'endpoints', 'import', { count: importedCount })).catch(console.error);
      import('../../../utils/endpointManager').then(m => m.invalidateEndpointCache(event.context.tenantSlug)).catch(console.error);
      return { success: true, message: tEvent(event, 'message.success') };
    }

    // SINGLE CREATE LOGIC
    if (body.name) {
      const existing = await sql.unsafe('SELECT id FROM endpoints WHERE name = ?', [body.name]);
      if (existing.length > 0) {
        throw createError({ statusCode: 409, message: 'errors.alreadyExists' });
      }
    }

    if (body.code) {
      try {
        const { validateJS } = await import('../../../utils/codeValidator');
        await validateJS(body.code, `Endpoint: ${body.name || 'Yeni'}`);
      } catch (err: any) {
        throw createError({ statusCode: 400, message: err.key || 'errors.databaseError', data: err.key ? err.params : undefined });
      }
    }

    const hashtagsStr = JSON.stringify(body.hashtags || []);
    const isSystem = user.is_super_admin ? 1 : 0;
    
    const insertRes = await sql.unsafe(`
      INSERT INTO endpoints (name, type, route_pattern, code, priority, active, is_public, hashtags, created_by, updated_by, system_created, system_modified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `, [
      body.name, body.type, body.route_pattern, body.code, body.priority || 0,
      body.active ? 1 : 0, body.is_public ? 1 : 0, hashtagsStr, user.id, user.id, isSystem, isSystem
    ]);

    if (insertRes.length > 0) {
      import('../../../utils/history').then(m => m.saveHistory(event.context.tenantSlug, 'endpoints', insertRes[0].id, insertRes[0])).catch(console.error);
    }
    import('../../../utils/endpointManager').then(m => m.invalidateEndpointCache(event.context.tenantSlug)).catch(console.error);
    return { success: true, message: tEvent(event, 'message.entityCreated', { name: tEvent(event, 'entity.endpoint') }) };
  }
});
