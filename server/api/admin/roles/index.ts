import { useDB } from '../../../utils/db';
import { type FilterGroup } from '../../../utils/filterEngine';
import { buildGenericFilter } from '../../../utils/queryBuilder';

export default defineEventHandler(async (event) => {
  const user = event.context.user;


  const sql = useDB(event.context.tenantSlug);
  const method = getMethod(event);

  if (method === 'GET') {
    const query = getQuery(event);
    const page = Math.max(1, parseInt(query.page as string) || 1);
    const limit = Math.max(1, parseInt(query.limit as string) || 10);
    const search = ((query.search as string) || '').replace(/^#/, '');
    const offset = (page - 1) * limit;

    const filtersParam = (query.advancedFilters || query.filters) as string;

    let baseQuery = 'FROM roles WHERE 1=1';
    const queryParams: any[] = [];

    if (search) {
      baseQuery += ` AND name LIKE $1`;
      queryParams.push(`%${search}%`);
    }

    if (filtersParam) {
      try {
        const filterAst = JSON.parse(filtersParam) as FilterGroup;
        const sqlFilter = buildGenericFilter(filterAst, queryParams.length + 1);
        if (sqlFilter.fragment) {
          baseQuery += ` AND ${sqlFilter.fragment}`;
          queryParams.push(...sqlFilter.params);
        }
      } catch (e) {
        console.warn('Advanced filter parse error:', e);
      }
    }

    const countRes = await sql.unsafe(`SELECT COUNT(*) as count ${baseQuery}`, queryParams);
    const totalCount = parseInt((countRes[0] as any)?.count || '0');

    const isExport = query.export === 'true';
    const selectCols = isExport ? '*' : 'id, name, allowed_tags, hashtags, home_page, menu_list, created_at, updated_at';

    const pagedRes = await sql.unsafe(`
      SELECT ${selectCols} ${baseQuery}
      ORDER BY id ASC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `, [...queryParams, limit, offset]);
    return { success: true, data: pagedRes, pagination: { total: totalCount, page, limit } };
  }

  if (method === 'POST') {
    const body = await readBody(event);

    if (body.records && Array.isArray(body.records)) {
      const records = body.records;

      if (records.length === 0) {
        throw createError({ statusCode: 400, message: 'errors.notFound' });
      }

      let updatedCount = 0;
      let insertedCount = 0;
      const isSystem = user.is_super_admin ? 1 : 0;

      for (const rec of records) {
        if (!rec.name) continue;

        const existing = await sql`SELECT id FROM roles WHERE name = ${rec.name}`;
        if (existing.length > 0) {
          await sql`
              UPDATE roles 
              SET allowed_tags = ${sql.json(rec.allowed_tags || [])}, 
                  home_page = ${rec.home_page || null}, 
                  menu_list = ${sql.json(rec.menu_list || [])}, 
                  hashtags = ${sql.json(rec.hashtags || [])},
                  updated_at = CURRENT_TIMESTAMP,
                  updated_by = ${user.id},
                  system_modified = ${isSystem}
              WHERE name = ${rec.name}
            `;
          updatedCount++;
        } else {
          await sql`
              INSERT INTO roles (name, allowed_tags, home_page, menu_list, hashtags, created_by, updated_by, system_created, system_modified) 
              VALUES (${rec.name}, ${sql.json(rec.allowed_tags || [])}, ${rec.home_page || null}, ${sql.json(rec.menu_list || [])}, ${sql.json(rec.hashtags || [])}, ${user.id}, ${user.id}, ${isSystem}, ${isSystem})
            `;
          insertedCount++;
        }
      }

      return { success: true };
    }

    if (!body.name) throw createError({ statusCode: 400, message: 'errors.validationFailed' });

    const isSystem = user.is_super_admin ? 1 : 0;
    const res = await sql`
      INSERT INTO roles (name, allowed_tags, home_page, menu_list, hashtags, created_by, updated_by, system_created, system_modified)
      VALUES (${body.name}, ${sql.json(body.allowed_tags || [])}, ${body.home_page || null}, ${sql.json(body.menu_list || [])}, ${sql.json(body.hashtags || [])}, ${user.id}, ${user.id}, ${isSystem}, ${isSystem})
      RETURNING *
    `;
    return res[0];
  }
});
