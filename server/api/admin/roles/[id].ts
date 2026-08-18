import { useDB } from '../../../utils/db';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  if (!user) {
    throw createError({ statusCode: 401, message: 'errors.loginRequired' });
  }
  if (!user.is_admin) {
    throw createError({ statusCode: 403, message: 'errors.forbiddenAdminOnly' });
  }

  const sql = useDB(event.context.tenantSlug);
  const method = getMethod(event);
  const id = getRouterParam(event, 'id');

  if (!id) {
    throw createError({ statusCode: 400, message: 'errors.validationFailed' });
  }

  if (method === 'GET') {
    const result = await sql`SELECT id, name, allowed_tags, hashtags, home_page, menu_list, created_at, updated_at FROM roles WHERE id = ${id}`;
    if (result.length === 0) {
      throw createError({ statusCode: 404, message: 'errors.notFound' });
    }
    return result[0];
  }

  if (method === 'PUT') {
    const body = await readBody(event);
    if (!body.name) throw createError({ statusCode: 400, message: 'errors.validationFailed' });

    const res = await sql`
      UPDATE roles
      SET name = ${body.name},
          allowed_tags = ${sql.json(body.allowed_tags || [])},
          hashtags = ${sql.json(body.hashtags || [])},
          home_page = ${body.home_page || null},
          menu_list = ${sql.json(body.menu_list || [])},
          updated_at = CURRENT_TIMESTAMP,
          updated_by = ${user.id}
      WHERE id = ${id}
      RETURNING *
    `;
    
    if (res.length === 0) {
      throw createError({ statusCode: 404, message: 'errors.notFound' });
    }
    return { success: true, message: 'message.success', data: res[0] };
  }

  if (method === 'DELETE') {
    const res = await sql`DELETE FROM roles WHERE id = ${id} RETURNING id`;
    if (res.length === 0) {
      throw createError({ statusCode: 404, message: 'errors.notFound' });
    }
    return { success: true, message: 'message.success', data: { deletedId: id } };
  }
});
