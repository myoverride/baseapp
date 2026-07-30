import { useDB } from '../../../utils/db';
import { type FilterGroup } from '../../../utils/filterEngine';
import { buildGenericFilter } from '../../../utils/queryBuilder';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  if (!user) throw createError({ statusCode: 401, message: 'errors.loginRequired' });
  const method = getMethod(event);

  if (method !== 'GET' && !user.is_admin) {
    throw createError({ statusCode: 403, message: 'errors.unauthorized' });
  }

  const sql = useDB(event.context.tenantSlug);

  if (method === 'GET') {
    const query = getQuery(event);
    const target = query.target as string | undefined;
    const search = ((query.search as string) || '').replace(/^#/, '');
    const page = parseInt(query.page as string) || 1;
    const limit = parseInt(query.limit as string) || 25;
    const sortBy = (query.sortBy as string) || 'created_at';
    const sortOrder = (query.sortOrder as string) === 'asc' ? 'ASC' : 'DESC';
    const offset = (page - 1) * limit;

    const allowedSort = ['key', 'target', 'created_at', 'updated_at'];
    const safeSort = allowedSort.includes(sortBy) ? sortBy : 'created_at';

    let whereClause = 'WHERE 1 = 1';
    const params: any[] = [];

    if (target) {
      whereClause += ' AND target = ?';
      params.push(target);
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
      } catch (e) {
        console.warn('Advanced filter parse error:', e);
      }
    }

    try {
      const [{ count }] = await sql.unsafe(
        `SELECT COUNT(*) as count FROM utils ${whereClause}`,
        params
      );

      const utils = await sql.unsafe(
        `SELECT id, name, key, target, code, hashtags, active, created_at, updated_at FROM utils ${whereClause} ORDER BY ${safeSort} ${sortOrder} LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      let filteredUtils = utils;
      if (!user.is_admin) {
        const allowedTags = Array.isArray(user.allowed_tags) ? user.allowed_tags : [];
        filteredUtils = utils.filter((u: any) => {
          if (!['ui', 'shared'].includes(u.target)) return false;
          let utilTags: string[] = [];
          try { utilTags = typeof u.hashtags === 'string' ? JSON.parse(u.hashtags) : (u.hashtags || []); } catch {}
          return utilTags.some((tag: string) => allowedTags.includes(tag));
        });
      }

      return {
        success: true,
        data: filteredUtils,
        total: !user.is_admin ? filteredUtils.length : Number(count)
      };
    } catch (err) {
      throw createError({
        statusCode: 500,
        message: 'errors.internalError' + ': ' + ((err as any)?.message || '')
      });
    }
  }

  if (method === 'POST') {
    const userId = event.context.user?.id;
    const body = await readBody(event);
    
    // BULK IMPORT LOGIC
    if (body.records && Array.isArray(body.records)) {
      // PRE-SAVE VALIDATION (SHIELD)
      try {
        const { validateJS } = await import('../../../utils/codeValidator');
        for (const rec of body.records) {
          if (rec.code && ['api', 'shared'].includes(rec.target)) { // utils are just JS. UI target might contain HTML or JS but for now, we'll validate JS
             await validateJS(rec.code, `Util: ${rec.key || 'Bilinmeyen'}`);
          }
        }
      } catch (err: any) {
        throw createError({ statusCode: 400, message: err.key || err.message, data: err.params });
      }

      let updatedCount = 0;
      let insertedCount = 0;

      for (const rec of body.records) {
        const name = String(rec?.name || '').trim();
        const key = String(rec?.key || '').trim();
        const target = String(rec?.target || '').trim();
        const code = String(rec?.code || '');

        
        if (!key || !target || !code || !['ui', 'api', 'shared'].includes(target)) {
          continue;
        }

        const existing = await sql.unsafe('SELECT id FROM utils WHERE key = ?', [key]);
        
        const hashtags = Array.isArray(rec.hashtags) ? JSON.stringify(rec.hashtags) : (typeof rec.hashtags === 'string' ? rec.hashtags : '[]');

        if (existing.length > 0) {
          await sql.unsafe(`
            UPDATE utils 
            SET name = ?, target = ?, code = ?, hashtags = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
            WHERE key = ?
          `, [name, target, code, hashtags, userId, key]);
          updatedCount++;
        } else {
          await sql.unsafe(`
            INSERT INTO utils (name, key, target, code, active, hashtags, created_by, updated_by)
            VALUES (?, ?, ?, ?, 1, ?, ?, ?)
          `, [name, key, target, code, hashtags, userId, userId]);
          insertedCount++;
        }
      }

      return { success: true, updated: updatedCount, inserted: insertedCount };
    }

    // SINGLE RECORD CREATE LOGIC
    if (!body.key || !body.target || !body.code) {
      throw createError({
        statusCode: 400,
        message: 'errors.validationFailed'
      });
    }

    if (!['ui', 'api', 'shared'].includes(body.target)) {
      throw createError({
        statusCode: 400,
        message: 'errors.validationFailed'
      });
    }

    if (body.code && ['api', 'shared'].includes(body.target)) {
      try {
        const { validateJS } = await import('../../../utils/codeValidator');
        await validateJS(body.code, `Util: ${body.key || 'Yeni'}`);
      } catch (err: any) {
        throw createError({ statusCode: 400, message: err.key || err.message, data: err.params });
      }
    }

    try {
      const existing = await sql.unsafe(
        'SELECT id FROM utils WHERE key = ? OR name = ?',
        [body.key, body.name || '']
      );

      if (existing.length > 0) {
        throw createError({
          statusCode: 409,
          message: 'errors.duplicateKey'
        });
      }

      const hashtags = Array.isArray(body.hashtags) ? JSON.stringify(body.hashtags) : '[]';
      const isActive = typeof body.active === 'boolean' ? (body.active ? 1 : 0) : 1;

      const result = await sql.unsafe(`
        INSERT INTO utils 
        (name, key, target, code, active, created_by, updated_by, hashtags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        body.name || '',
        body.key,
        body.target,
        body.code,
        body.active !== false ? 1 : 0,
        userId,
        userId,
        hashtags
      ]);

      const newId = result[0]?.id;
      const [created] = await sql.unsafe('SELECT * FROM utils WHERE id = ?', [newId]);
      import('../../../utils/history').then(m => m.saveHistory(event.context.tenantSlug, 'utils', newId, created)).catch(console.error);

      const { invalidateUtilsCache } = await import('../../../utils/utilsCache');
      invalidateUtilsCache(event.context.tenantSlug);

      return {
        success: true,
        message: 'message.success',
        id: newId
      };
    } catch (err: any) {
      if (err.statusCode) throw err;
      throw createError({
        statusCode: 500,
        message: 'errors.internalError' + ': ' + (err?.message || '')
      });
    }
  }

  throw createError({ statusCode: 405, message: 'errors.methodNotAllowed' });
});
