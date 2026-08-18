import { useDB } from '../../../utils/db';
import { type FilterGroup } from '../../../utils/filterEngine';
import { buildGenericFilter } from '../../../utils/queryBuilder';

export default defineEventHandler(async (event) => {
  const method = getMethod(event);
  const sql = useDB(event.context.tenantSlug);

  if (method === 'GET') {
    const query = getQuery(event);
    const page = Math.max(1, parseInt(query.page as string) || 1);
    const limit = Math.max(1, parseInt(query.limit as string) || 10);
    const search = ((query.search as string) || '').replace(/^#/, '');
    const offset = (page - 1) * limit;

    const filtersParam = (query.advancedFilters || query.filters) as string;

    let baseQuery = 'FROM pages WHERE 1=1';
    const queryParams: any[] = [];

    if (search) {
      baseQuery += ` AND (route_pattern LIKE $1 OR title LIKE $1 OR hashtags LIKE $1)`;
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
    const selectCols = isExport 
      ? 'id, route_pattern, priority, title, page_type, template_string, script_content, style_content, active, is_public, hashtags, is_default_layout, layout_id, created_at, updated_at' 
      : 'id, route_pattern, priority, title, page_type, active, is_public, hashtags, is_default_layout, layout_id, created_at, updated_at';

    const pagedRes = await sql.unsafe(`
      SELECT ${selectCols} ${baseQuery} ORDER BY priority ASC, created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `, [...queryParams, limit, offset]);

    const unwrappedRecords = pagedRes.map((rec: any) => ({
      ...rec,
      script_content: rec.script_content
    }));
    return { success: true, data: unwrappedRecords, pagination: { total: totalCount, page, limit } };
  }

  if (method === 'POST') {
    const body = await readBody(event);
    if (body.records && Array.isArray(body.records)) {
      const records = body.records;
      const user = event.context.user;

      if (!user) throw createError({ statusCode: 401, message: 'errors.loginRequired' });
  if (!user.is_admin) throw createError({ statusCode: 403, message: 'errors.forbiddenAdminOnly' });

      // PRE-SAVE VALIDATION (SHIELD)
      try {
        const { validateJS, validateTemplate } = await import('../../../utils/codeValidator');
        for (const rec of records) {
          if (rec.script_content) {
            await validateJS(rec.script_content, `Page Script: ${rec.title || 'Bilinmeyen'}`);
          }
          if (rec.template_string) {
            await validateTemplate(rec.template_string, rec.script_content, `Page Template: ${rec.title || 'Bilinmeyen'}`);
          }
        }
      } catch (err: any) {
        throw createError({ statusCode: 400, message: err.key || 'errors.databaseError', data: err.key ? err.params : undefined });
      }

      const isDelete = body.isDelete === true;

      if (!Array.isArray(records) || records.length === 0) {
        throw createError({ statusCode: 400, message: 'errors.badRequest' });
      }

      let updatedCount = 0;
      let insertedCount = 0;

      for (const rec of records) {
        if (!rec.title || (rec.page_type !== 'layout' && !rec.route_pattern)) continue;

        let pType = rec.page_type;
        if (!['landing', 'regular', 'system', 'layout', 'login', 'component'].includes(pType)) {
          pType = 'regular';
        }

        let existing = [];
        if (rec.route_pattern) {
          const isPub = rec.is_public === true ? 1 : 0;
          existing = await sql`SELECT id FROM pages WHERE route_pattern = ${rec.route_pattern} AND is_public = ${isPub}`;
        }

        if (existing.length > 0) {
          const result = await sql`
            UPDATE pages 
            SET title = ${rec.title}, 
                page_type = ${pType}, 
                priority = ${rec.priority || 0},
                template_string = ${rec.template_string || ''}, 
                script_content = ${rec.script_content}, 
                style_content = ${rec.style_content || ''}, 
                active = ${rec.active ?? true}, 
                is_public = ${rec.is_public ?? false}, 
                hashtags = ${sql.json(rec.hashtags || [])},
                is_default_layout = ${rec.is_default_layout ? 1 : 0},
                layout_id = ${rec.layout_id || null},
                updated_by = ${user.id}, 
                updated_at = CURRENT_TIMESTAMP
            WHERE route_pattern = ${rec.route_pattern} AND is_public = ${rec.is_public ?? false ? 1 : 0}
            RETURNING *
            `;
          if (result.length > 0) {
            import('../../../utils/history').then(m => m.saveHistory(event.context.tenantSlug, 'page', result[0].id, result[0])).catch(console.error);
          }
          updatedCount++;
        } else {
          const result = await sql`
            INSERT INTO pages (route_pattern, title, page_type, priority, template_string, script_content, style_content, active, is_public, hashtags, is_default_layout, layout_id, created_by, updated_by) 
            VALUES (${rec.route_pattern}, ${rec.title}, ${pType}, ${rec.priority || 0}, ${rec.template_string || ''}, ${rec.script_content}, ${rec.style_content || ''}, ${rec.active ?? true}, ${rec.is_public ?? false}, ${sql.json(rec.hashtags || [])}, ${rec.is_default_layout ? 1 : 0}, ${rec.layout_id || null}, ${user.id}, ${user.id})
            RETURNING *
            `;
          if (result.length > 0) {
            import('../../../utils/history').then(m => m.saveHistory(event.context.tenantSlug, 'page', result[0].id, result[0])).catch(console.error);
          }
          insertedCount++;
        }
      }

      return { success: true, message: 'message.success', data: { updatedCount, insertedCount } };

    }


    const pType = body.page_type || 'regular';
    if (!body.title || (pType !== 'layout' && !body.route_pattern)) {
      throw createError({ statusCode: 400, message: 'errors.validationFailed' });
    }

    try {
      const { validateJS, validateTemplate } = await import('../../../utils/codeValidator');
      if (body.script_content) {
        await validateJS(body.script_content, `Page Script: ${body.title || 'Yeni'}`);
      }
      if (body.template_string) {
        await validateTemplate(body.template_string, body.script_content, `Page Template: ${body.title || 'Yeni'}`);
      }
    } catch (err: any) {
      throw createError({ statusCode: 400, message: err.key || 'errors.databaseError', data: err.key ? err.params : undefined });
    }

    try {
      if (['login', 'landing'].includes(pType)) {
        await sql`UPDATE pages SET page_type = 'regular' WHERE page_type = ${pType}`;
      }

      if (pType === 'layout' && body.is_default_layout) {
        await sql`UPDATE pages SET is_default_layout = 0 WHERE page_type = 'layout'`;
      }

      const existingTitle = await sql`SELECT id FROM pages WHERE title = ${body.title}`;
      if (existingTitle.length > 0) throw createError({ statusCode: 409, message: 'errors.alreadyExists' });

      if (body.route_pattern) {
        const isPub = body.is_public === true ? 1 : 0;
        const existingRoute = await sql`SELECT id FROM pages WHERE route_pattern = ${body.route_pattern} AND is_public = ${isPub}`;
        if (existingRoute.length > 0) throw createError({ statusCode: 409, message: 'errors.duplicateSlug' });
      }

      const result = await sql`
        INSERT INTO pages (route_pattern, priority, title, page_type, template_string, script_content, style_content, active, is_public, hashtags, is_default_layout, layout_id, created_by, updated_by)
        VALUES (${body.route_pattern || null}, ${body.priority || 0}, ${body.title}, ${pType}, ${body.template_string || ''}, ${body.script_content || ''}, ${body.style_content || ''}, ${body.active !== false ? 1 : 0}, ${body.is_public === true ? 1 : 0}, ${sql.json(body.hashtags || [])}, ${body.is_default_layout ? 1 : 0}, ${body.layout_id || null}, ${event.context.user.id}, ${event.context.user.id})
        RETURNING *
      `;
      result[0].script_content = result[0].script_content;
      import('../../../utils/history').then(m => m.saveHistory(event.context.tenantSlug, 'page', result[0].id, result[0])).catch(console.error);
      import('../../../utils/versionManager').then(m => m.bumpGlobalVersion(event.context.tenantSlug));
      return result[0];
    } catch (e: any) {
      if (e.code === '23505' || (e.message && e.message.includes('UNIQUE constraint failed'))) throw createError({ statusCode: 409, message: 'errors.duplicateSlug' });
      throw createError({ statusCode: 500, message: 'errors.internalError' });
    }
  }
});
