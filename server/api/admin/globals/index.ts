import { useDB } from '../../../utils/db';
import { type FilterGroup } from '../../../utils/filterEngine';
import { buildGenericFilter } from '../../../utils/queryBuilder';
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

  if (method === 'GET') {
    const query = getQuery(event);
    const type = query.type as string | undefined;
    const search = ((query.search as string) || '').replace(/^#/, '');
    const page = Math.max(1, parseInt(query.page as string) || 1);
    const limit = Math.max(1, parseInt(query.limit as string) || 25);
    const sortBy = (query.sortBy as string) || 'key';
    const sortOrder = (query.sortOrder as string) === 'asc' ? 'ASC' : 'DESC';
    const offset = (page - 1) * limit;

    const allowedSort = ['key', 'type', 'target', 'active', 'is_public', 'protected', 'created_at', 'updated_at'];
    const safeSort = allowedSort.includes(sortBy) ? sortBy : 'key';

    let whereClause = 'WHERE 1 = 1';
    const params: any[] = [];

    if (type) {
      whereClause += ' AND type = ?';
      params.push(type);
    }
    if (search) {
      whereClause += ' AND (key LIKE ? OR hashtags LIKE ?)';
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
      } catch(e) { }
    }

    const countRes = await sql.unsafe(`SELECT COUNT(*) as c FROM globals ${whereClause}`, params);
    
    const isExport = query.export === 'true';
    const selectCols = isExport 
      ? '*' 
      : 'id, type, key, value, data_type, target, active, is_public, is_secret, protected, hashtags, description, created_at, updated_at';

    const records = await sql.unsafe(
      `SELECT ${selectCols} 
       FROM globals ${whereClause} ORDER BY ${safeSort} ${sortOrder} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return { success: true, data: records, pagination: { total: countRes[0]?.c || 0, page, limit } };
  }

  if (method === 'POST') {
    const body = await readBody(event);
    
    const isVar = body.type === 'variable';
    const isUtil = body.type === 'util';
    
    if (!body.key) throw createError({ statusCode: 400, message: 'errors.validationFailed' });

    try {
      const sqlParams = [
        body.type, body.key, body.value || '', body.code || '', body.data_type || 'string',
        body.target || 'shared', body.is_public ? 1 : 0, body.is_secret ? 1 : 0,
        0, body.active !== false ? 1 : 0,
        JSON.stringify(body.scope || []), body.description || '', JSON.stringify(body.hashtags || []),
        user.id, user.id
      ];

      const res = await sql.unsafe(`
        INSERT INTO globals (
          type, key, value, code, data_type, target, 
          is_public, is_secret, protected, active, scope, 
          description, hashtags, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `, sqlParams);

      if (res.length > 0) {
        import('../../../utils/history').then(m => m.saveHistory(event.context.tenantSlug, 'globals', res[0].id, res[0])).catch(console.error);
      }

      globals.invalidate(event.context.tenantSlug);
      import('../../../utils/versionManager').then(m => m.bumpGlobalVersion(event.context.tenantSlug));

      return { success: true, data: { id: res[0].id } };
    } catch (err: any) {
      if (err.message.includes('UNIQUE constraint failed')) {
        throw createError({ statusCode: 400, message: 'errors.duplicateKey' });
      }
      throw createError({ statusCode: 500, message: err.message });
    }
  }
});
