import { useDB, getMasterDb } from '../../../utils/db';
import { type FilterGroup } from '../../../utils/filterEngine';
import { buildGenericFilter } from '../../../utils/queryBuilder';
import { checkUsernameUniqueness } from '../../../utils/tenantSecurity';
import bcrypt from 'bcryptjs';

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

    let whereClause = ' WHERE 1=1';
    const queryParams: any[] = [];

    if (search) {
      whereClause += ` AND u.username LIKE $1`;
      queryParams.push(`%${search}%`);
    }

    if (filtersParam) {
      try {
        const filterAst = JSON.parse(filtersParam) as FilterGroup;
        const sqlFilter = buildGenericFilter(filterAst, queryParams.length + 1);
        if (sqlFilter.fragment) {
          // Replace simple field references with 'u.field' assuming fields belong to users
          const frag = sqlFilter.fragment.replace(/\b(\w+)\b\s*(LIKE|=|!=|>|<|>=|<=|IN|NOT IN|IS NULL|IS NOT NULL|BETWEEN)/g, 'u.$1 $2');
          whereClause += ` AND ${frag}`;
          queryParams.push(...sqlFilter.params);
        }
      } catch (e) {
        console.warn('Advanced filter parse error:', e);
      }
    }

    const countRes = await sql.unsafe(`SELECT COUNT(*) as count FROM users u ${whereClause}`, queryParams);
    const totalCount = parseInt((countRes[0] as any)?.count || '0');

    const isExport = query.export === 'true';
    const selectCols = isExport
      ? 'u.*, r.name as role_name'
      : 'u.id, u.username, u.is_admin, u.role_id, u.home_page, u.menu_list, u.hashtags, r.name as role_name, u.created_at, u.updated_at';

    const pagedRes = await sql.unsafe(`
      SELECT ${selectCols}
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      ${whereClause}
      ORDER BY u.id ASC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `, [...queryParams, limit, offset]);

    for (const u of pagedRes) {
      const uRecords = await sql`SELECT record_id FROM user_records WHERE user_id = ${u.id}`;
      u.linked_record_ids = uRecords.map((x: any) => x.record_id);
    }
    return { success: true, data: pagedRes, pagination: { total: totalCount, page, limit } };
  }

  if (method === 'POST') {
    const body = await readBody(event);
    const masterSql = getMasterDb();

    const checkUniqueness = async (uname: string) => {
      await checkUsernameUniqueness(event.context.tenantSlug, uname);
    };

    if (body.records && Array.isArray(body.records)) {
      const records = body.records;

      if (records.length === 0) {
        throw createError({ statusCode: 400, message: 'errors.notFound' });
      }

      const defaultPasswordHash = await bcrypt.hash('123456', 10);

      let updatedCount = 0;
      let insertedCount = 0;
      const isSystem = user.is_super_admin ? 1 : 0;

      for (const rec of records) {
        if (!rec.username) continue;

        const existing = await sql`SELECT id FROM users WHERE username = ${rec.username}`;
        if (existing.length > 0) {
          let hashToUse = rec.password_hash || undefined;
          if (hashToUse) {
            if (!/^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hashToUse)) {
              hashToUse = await bcrypt.hash(hashToUse, 10);
            }
            await sql`
                UPDATE users 
                SET is_admin = ${rec.is_admin || false}, role_id = ${rec.role_id || null}, home_page = ${rec.home_page || null}, menu_list = ${rec.menu_list ? sql.json(rec.menu_list) : null}, hashtags = ${sql.json(rec.hashtags || [])}, updated_at = CURRENT_TIMESTAMP, updated_by = ${user.id}, system_modified = ${isSystem}, password_hash = ${hashToUse}
                WHERE username = ${rec.username}
              `;
          } else {
            await sql`
                UPDATE users 
                SET is_admin = ${rec.is_admin || false}, role_id = ${rec.role_id || null}, home_page = ${rec.home_page || null}, menu_list = ${rec.menu_list ? sql.json(rec.menu_list) : null}, hashtags = ${sql.json(rec.hashtags || [])}, updated_at = CURRENT_TIMESTAMP, updated_by = ${user.id}, system_modified = ${isSystem}
                WHERE username = ${rec.username}
              `;
          }
          updatedCount++;
        } else {
          let hashToUse = rec.password_hash || undefined;
          if (hashToUse) {
            if (!/^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hashToUse)) {
              hashToUse = await bcrypt.hash(hashToUse, 10);
            }
          } else {
            hashToUse = defaultPasswordHash;
          }

          await checkUniqueness(rec.username);

          await sql`
              INSERT INTO users (username, password_hash, is_admin, role_id, home_page, menu_list, hashtags, created_by, updated_by, system_created, system_modified) 
              VALUES (${rec.username}, ${hashToUse}, ${rec.is_admin || false}, ${rec.role_id || null}, ${rec.home_page || null}, ${rec.menu_list ? sql.json(rec.menu_list) : null}, ${sql.json(rec.hashtags || [])}, ${user.id}, ${user.id}, ${isSystem}, ${isSystem})
            `;
          insertedCount++;
        }
      }

      // Sync to global_users in master.db (if not master itself)
      if (event.context.tenantSlug !== 'master') {
        const masterSql = getMasterDb();
        for (const rec of records) {
          if (rec.username) {
            await masterSql`INSERT INTO global_users (username, tenant_slug) VALUES (${rec.username}, ${event.context.tenantSlug}) ON CONFLICT(username) DO NOTHING`;
          }
        }
      }

      return { success: true, message: 'message.success' };
    }


    if (!body.username || !body.password) throw createError({ statusCode: 400, message: 'errors.usernamePasswordRequiredAdmin' });

    await checkUniqueness(body.username);

    const hash = await bcrypt.hash(body.password, 10);
    const isSystem = user.is_super_admin ? 1 : 0;

    const res = await sql`
      INSERT INTO users (username, password_hash, is_admin, role_id, home_page, menu_list, hashtags, created_by, updated_by, system_created, system_modified)
      VALUES (${body.username}, ${hash}, ${body.is_admin || false}, ${body.role_id || null}, ${body.home_page || null}, ${body.menu_list ? sql.json(body.menu_list) : null}, ${sql.json(body.hashtags || [])}, ${user.id}, ${user.id}, ${isSystem}, ${isSystem})
      RETURNING id, username, is_admin, role_id, home_page, menu_list, hashtags, created_at, updated_at
    `;
    const newUserId = res?.[0]?.id;

    if (newUserId && Array.isArray(body.linked_record_ids)) {
      for (const recordId of body.linked_record_ids) {
        await sql`INSERT INTO user_records (user_id, record_id) VALUES (${newUserId}, ${recordId})`;
      }
    }

    // Sync to global_users in master.db (if not master itself)
    if (event.context.tenantSlug !== 'master') {
      await masterSql`INSERT INTO global_users (username, tenant_slug) VALUES (${body.username}, ${event.context.tenantSlug}) ON CONFLICT(username) DO NOTHING`;
    }

    return res?.[0];
  }
});
