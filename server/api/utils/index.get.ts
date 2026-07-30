import { useDB } from '../../utils/db';

export default defineEventHandler(async (event) => {
  // Güvenlik: Sadece admin kullanıcılar utility listesini görebilir
  const user = event.context.user;
  if (!user?.is_admin) {
    throw createError({ statusCode: 403, message: tEvent(event, 'errors.unauthorized') });
  }

  const sql = useDB(event.context.tenantSlug);

  const query = getQuery(event);
  const target = query.target as string | undefined;

  if (target && !['ui', 'shared'].includes(target)) {
    throw createError({ statusCode: 400, message: tEvent(event, 'errors.invalidTarget') });
  }

  let whereClause = 'WHERE active = true';
  const params: any[] = [];

  if (target) {
    whereClause += ' AND target = ?';
    params.push(target);
  } else {
    whereClause += " AND target IN ('ui','shared')";
  }

  try {
    const rows = await sql.unsafe(
      `SELECT id, key, target FROM utils ${whereClause} ORDER BY updated_at DESC`,
      params
    );

    return {
      success: true,
      data: rows
    };
  } catch (err) {
    throw createError({
      statusCode: 500,
      message: tEvent(event, 'errors.internalError') + ': ' + ((err as any)?.message || '')
    });
  }
});
