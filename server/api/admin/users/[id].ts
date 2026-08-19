import { useDB, getMasterDb } from '../../../utils/db';
import { checkUsernameUniqueness } from '../../../utils/tenantSecurity';
import bcrypt from 'bcryptjs';

export default defineEventHandler(async (event) => {
  const user = event.context.user;


  const sql = useDB(event.context.tenantSlug);
  const method = getMethod(event);
  const id = getRouterParam(event, 'id');

  if (!id) {
    throw createError({ statusCode: 400, message: 'errors.validationFailed' });
  }

  if (method === 'GET') {
    const result = await sql`
      SELECT u.id, u.username, u.is_admin, u.role_id, u.home_page, u.menu_list, u.hashtags, r.name as role_name, u.created_at, u.updated_at
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = ${id}
    `;
    if (result.length === 0) {
      throw createError({ statusCode: 404, message: 'errors.notFound' });
    }
    const u = result[0];
    const uRecords = await sql`SELECT record_id FROM user_records WHERE user_id = ${u.id}`;
    u.linked_record_ids = uRecords.map((x: any) => x.record_id);
    return u;
  }

  if (method === 'PUT') {
    const body = await readBody(event);
    if (!body.username) throw createError({ statusCode: 400, message: 'errors.validationFailed' });

    const oldUserCheck = await sql`SELECT username FROM users WHERE id = ${id}`;
    if (oldUserCheck.length === 0) throw createError({ statusCode: 404, message: 'errors.notFound' });
    const oldUsername = oldUserCheck[0].username;

    if (body.username !== oldUsername) {
      await checkUsernameUniqueness(event.context.tenantSlug, body.username);
    }

    let res;
    const isSystem = user.is_super_admin ? 1 : 0;
    if (body.password) {
      const hash = await bcrypt.hash(body.password, 10);
      res = await sql`
        UPDATE users
        SET username = ${body.username},
            password_hash = ${hash},
            is_admin = ${body.is_admin || false},
            role_id = ${body.role_id || null},
            home_page = ${body.home_page || null},
            menu_list = ${body.menu_list ? sql.json(body.menu_list) : null},
            hashtags = ${sql.json(body.hashtags || [])},
            updated_at = CURRENT_TIMESTAMP,
            updated_by = ${user.id},
            system_modified = ${isSystem}
        WHERE id = ${id}
        RETURNING id, username, is_admin, role_id, home_page, menu_list, hashtags, created_at, updated_at
      `;
      await sql`UPDATE users SET current_token = NULL WHERE id = ${id}`;
    } else {
      res = await sql`
        UPDATE users
        SET username = ${body.username},
            is_admin = ${body.is_admin || false},
            role_id = ${body.role_id || null},
            home_page = ${body.home_page || null},
            menu_list = ${body.menu_list ? sql.json(body.menu_list) : null},
            hashtags = ${sql.json(body.hashtags || [])},
            updated_at = CURRENT_TIMESTAMP,
            updated_by = ${user.id},
            system_modified = ${isSystem}
        WHERE id = ${id}
        RETURNING id, username, is_admin, role_id, home_page, menu_list, hashtags, created_at, updated_at
      `;
    }

    if (res.length === 0) {
      throw createError({ statusCode: 404, message: 'errors.notFound' });
    }

    if (Array.isArray(body.linked_record_ids)) {
      await sql`DELETE FROM user_records WHERE user_id = ${id}`;
      for (const recordId of body.linked_record_ids) {
        await sql`INSERT INTO user_records (user_id, record_id) VALUES (${id}, ${recordId})`;
      }
    }

    // Update global_users if username changed
    if (event.context.tenantSlug !== 'master' && body.username !== oldUsername) {
      const masterSql = getMasterDb();
      await masterSql`DELETE FROM global_users WHERE username = ${oldUsername} AND tenant_slug = ${event.context.tenantSlug}`;
      await masterSql`INSERT INTO global_users (username, tenant_slug) VALUES (${body.username}, ${event.context.tenantSlug}) ON CONFLICT(username) DO NOTHING`;
    }

    return { success: true, message: 'message.success', data: res?.[0] };
  }

  if (method === 'DELETE') {
    const isSameDatabase = user.is_super_admin ? (event.context.tenantSlug === 'master') : true;
    if (Number(id) === user.id && isSameDatabase) {
      throw createError({ statusCode: 400, message: 'errors.cannotDeleteSelf' });
    }

    const deletedUser = await sql`SELECT username FROM users WHERE id = ${id}`;
    if (deletedUser.length === 0) {
      throw createError({ statusCode: 404, message: 'errors.notFound' });
    }
    
    if (event.context.tenantSlug !== 'master') {
      const masterSql = getMasterDb();
      await masterSql`DELETE FROM global_users WHERE username = ${deletedUser[0].username} AND tenant_slug = ${event.context.tenantSlug}`;
    }

    await sql`DELETE FROM users WHERE id = ${id}`;
    return { success: true, message: 'message.success', data: { deletedId: id } };
  }
});
