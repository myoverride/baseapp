import { useDB } from '../../../utils/db';



export default defineEventHandler(async (event) => {
  const method = getMethod(event);
  const id = getRouterParam(event, 'id');
  const sql = useDB(event.context.tenantSlug);

  if (!id) throw createError({ statusCode: 400, message: 'errors.validationFailed' });

  if (method === 'GET') {
    const result = await sql`SELECT * FROM pages WHERE id = ${id}`;
    if (result.length === 0) {
      throw createError({ statusCode: 404, message: 'errors.notFound' });
    }
    const rec = result[0];
    rec.script_content = rec.script_content;
    return rec;
  }

  if (method === 'PUT') {
    const body = await readBody(event);

    try {
      const { validateJS, validateTemplate } = await import('../../../utils/codeValidator');
      if (body.script_content) {
        await validateJS(body.script_content, `Page Script: ${body.title || 'Bilinmeyen'}`);
      }
      if (body.template_string) {
        await validateTemplate(body.template_string, body.script_content, `Page Template: ${body.title || 'Bilinmeyen'}`);
      }
    } catch (err: any) {
      throw createError({ statusCode: 400, message: err.key || 'errors.databaseError', data: err.key ? err.params : undefined });
    }

    try {
      const existingArr = await sql`SELECT * FROM pages WHERE id = ${id}`;
      if (existingArr.length === 0) throw createError({ statusCode: 404, message: 'errors.notFound' });
      const existing = existingArr[0];

      let newRoutePattern = body.route_pattern;
      let newPageType = body.page_type || 'regular';
      if (!['regular', 'layout', 'component'].includes(newPageType)) {
        newPageType = 'regular';
      }

      if (existing.protected === 1 || existing.protected === true) {
        newRoutePattern = existing.route_pattern;
        newPageType = existing.page_type;
      }

      const existingTitle = await sql`SELECT id FROM pages WHERE title = ${body.title} AND id != ${id}`;
      if (existingTitle.length > 0) throw createError({ statusCode: 409, message: 'errors.alreadyExists' });

      if (newRoutePattern && newRoutePattern !== existing.route_pattern) {
        const isPub = body.is_public === true ? 1 : 0;
        const existingRoute = await sql`SELECT id FROM pages WHERE route_pattern = ${newRoutePattern} AND is_public = ${isPub} AND id != ${id}`;
        if (existingRoute.length > 0) throw createError({ statusCode: 409, message: 'errors.duplicateSlug' });
      }

      if (newPageType === 'layout' && body.is_default_layout) {
        await sql`UPDATE pages SET is_default_layout = 0 WHERE page_type = 'layout' AND id != ${id}`;
      }

      const isSystem = event.context.user?.is_super_admin ? 1 : 0;
      const result = await sql`
        UPDATE pages
        SET route_pattern = ${newRoutePattern || null}, priority = ${body.priority || 0}, title = ${body.title}, page_type = ${newPageType}, template_string = ${body.template_string || ''}, script_content = ${body.script_content || ''}, style_content = ${body.style_content || ''}, active = ${body.active !== false}, is_public = ${body.is_public || false}, hashtags = ${sql.json(body.hashtags || [])}, is_default_layout = ${body.is_default_layout ? 1 : 0}, layout_id = ${body.layout_id || null}, updated_by = ${event.context.user?.id || null}, system_modified = ${isSystem}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING *
      `;
      if (result.length === 0) throw createError({ statusCode: 404, message: 'errors.notFound' });
      result[0].script_content = result[0].script_content;
      import('../../../utils/history').then(m => m.saveHistory(event.context.tenantSlug, 'page', id as string, result[0])).catch(console.error);
      import('../../../utils/versionManager').then(m => m.bumpGlobalVersion(event.context.tenantSlug));
    return { success: true, message: 'message.success', data: result[0] };
    } catch (e) {
      throw e;
    }
  }

  if (method === 'DELETE') {
    const checkSys = await sql`SELECT protected FROM pages WHERE id = ${id}`;
    if (checkSys.length > 0 && checkSys[0].protected) {
      throw createError({ statusCode: 403, message: 'errors.systemPageCannotBeDeleted' });
    }

    const result = await sql`DELETE FROM pages WHERE id = ${id} RETURNING id`;
    if (result.length === 0) throw createError({ statusCode: 404, message: 'errors.notFound' });

    import('../../../utils/versionManager').then(m => m.bumpGlobalVersion(event.context.tenantSlug));
    return { success: true, message: 'message.success', data: { deletedId: id } };
  }
});
