import { useDB } from '../../../utils/db';

export default defineEventHandler(async (event) => {
  const method = getMethod(event);
  if (method !== 'GET') {
    throw createError({ statusCode: 405, message: 'errors.methodNotAllowed' });
  }

  const sql = useDB(event.context.tenantSlug);
  const slug = getRouterParam(event, 'slug');

  if (!slug) {
    throw createError({ statusCode: 400, message: 'errors.slugRequired' });
  }

  try {
    const pagesRes = await sql`
      SELECT id, title, route_pattern, page_type, template_string, script_content, style_content
      FROM pages 
      WHERE active = true AND page_type = 'component' AND route_pattern = ${slug}
      LIMIT 1
    `;

    if (!pagesRes || pagesRes.length === 0) {
      throw createError({ statusCode: 404, message: 'errors.componentNotFound' });
    }

    const rec = pagesRes[0];
    return {
      ...rec,
      script_content: rec.script_content
    };
  } catch (e: any) {
    throw createError({ statusCode: e.statusCode || 500, message: e.message || 'Internal Server Error' });
  }
});
