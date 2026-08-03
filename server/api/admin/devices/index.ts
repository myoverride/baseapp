import crypto from 'node:crypto';
import { useDB } from '../../../utils/db';
import { removeDeviceFromCache } from '../../../utils/mqtt';
import { type FilterGroup } from '../../../utils/filterEngine';
import { buildGenericFilter } from '../../../utils/queryBuilder';

export default defineEventHandler(async (event) => {
  const method = getMethod(event);
  const sql = useDB(event.context.tenantSlug);

  if (method === 'GET') {
    try {
      const query = getQuery(event);
      const page = Math.max(1, parseInt(query.page as string) || 1);
      const limit = Math.max(1, parseInt(query.limit as string) || 10);
      const search = ((query.search as string) || '').replace(/^#/, '');
      const offset = (page - 1) * limit;

      const filtersParam = (query.advancedFilters || query.filters) as string;

      let baseQuery = `
        FROM devices d 
        LEFT JOIN records r ON r.id = (CASE WHEN json_valid(d.schema) THEN CAST(json_extract(d.schema, '$.target_record_id') AS INTEGER) END)
        LEFT JOIN entities e ON e.id = r.entity_id
        WHERE 1=1
      `;
      const queryParams: any[] = [];

      if (search) {
        baseQuery += ` AND d.device_id LIKE $1`;
        queryParams.push(`%${search}%`);
      }

      if (filtersParam) {
        try {
          const filterAst = JSON.parse(filtersParam) as FilterGroup;
          const sqlFilter = buildGenericFilter(filterAst, queryParams.length + 1);
          if (sqlFilter.fragment) {
            const frag = sqlFilter.fragment.replace(/\b(\w+)\b\s*(LIKE|=|!=|>|<|>=|<=|IN|NOT IN|IS NULL|IS NOT NULL|BETWEEN)/g, 'd.$1 $2');
            baseQuery += ` AND ${frag}`;
            queryParams.push(...sqlFilter.params);
          }
        } catch (e) {
          console.warn('Advanced filter parse error:', e);
        }
      }

      const countRes = await sql.unsafe(`SELECT COUNT(*) as count ${baseQuery}`, queryParams);
      const totalCount = parseInt((countRes[0] as any)?.count || '0');

      const pagedRes = await sql.unsafe(`
        SELECT d.id, d.device_id, d.secret_key, d.schema, d.hashtags, d.created_at, d.updated_at, 
          (
            SELECT json_group_object(
                rf.key, 
                CASE 
                  WHEN rf.val_str IS NOT NULL THEN rf.val_str 
                  WHEN rf.val_num IS NOT NULL THEN rf.val_num 
                  WHEN rf.val_bool IS NOT NULL THEN json(CASE WHEN rf.val_bool = 1 THEN 'true' ELSE 'false' END) 
                END
            )
            FROM record_fields rf WHERE rf.record_id = r.id
          ) as target_record_data, 
          e.schema as entity_schema
        ${baseQuery} 
        ORDER BY d.created_at DESC 
        LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
      `, [...queryParams, limit, offset]);

      return {
        records: pagedRes,
        total: totalCount,
        page: page,
        limit: limit
      };
    } catch (error: any) {
      throw createError({ statusCode: 500, message: 'errors.internalError' });
    }
  }

  // 2. POST: Yeni Cihaz ve Anahtar Oluştur
  if (method === 'POST') {
    const body = await readBody(event);
    if (body.records && Array.isArray(body.records)) {
      const records = body.records;
      const user = event.context.user;

      if (!user || !user.is_admin) throw createError({ statusCode: 403, message: 'errors.unauthorized' });

      if (!Array.isArray(records) || records.length === 0) {
        throw createError({ statusCode: 400, message: 'errors.notFound' });
      }

      let updatedCount = 0;
      let insertedCount = 0;

      for (const rec of records) {
        if (!rec.device_id || !rec.secret_key) continue;

        const existing = await sql`SELECT id FROM devices WHERE device_id = ${rec.device_id}`;
        if (existing.length > 0) {
          await sql`
              UPDATE devices 
              SET secret_key = ${rec.secret_key},
                  schema = ${sql.json(rec.schema || {})},
                  hashtags = ${sql.json(rec.hashtags || [])},
                  updated_at = CURRENT_TIMESTAMP,
                  updated_by = ${user.id}
              WHERE device_id = ${rec.device_id}
            `;
          removeDeviceFromCache(event.context.tenantSlug, rec.device_id);
          updatedCount++;
        } else {
          await sql`
              INSERT INTO devices (device_id, secret_key, schema, hashtags, created_by, updated_by) 
              VALUES (${rec.device_id}, ${rec.secret_key}, ${sql.json(rec.schema || {})}, ${sql.json(rec.hashtags || [])}, ${user.id}, ${user.id})
            `;
          removeDeviceFromCache(event.context.tenantSlug, rec.device_id);
          insertedCount++;
        }
      }

      return { success: true };

    }


    if (!body.deviceId?.trim()) {
      throw createError({ statusCode: 400, message: 'errors.validationFailed' });
    }

    try {
      const generatedSecret = crypto.randomBytes(32).toString('hex');
      const schema = body.targetRecordId ? { target_record_id: Number(body.targetRecordId) } : {};
      const result = await sql`
        INSERT INTO devices (device_id, secret_key, schema, hashtags, created_by, updated_by)
        VALUES (${body.deviceId.trim()}, ${generatedSecret}, ${sql.json(schema)}, ${sql.json(body.hashtags || [])}, ${event.context.user.id}, ${event.context.user.id})
        RETURNING id, device_id, secret_key, schema, hashtags, created_at, updated_at, created_by, updated_by
      `;
      removeDeviceFromCache(event.context.tenantSlug, body.deviceId.trim());
      return { success: true, data: result[0] };
    } catch (error: any) {
      if (error.code === '23505') throw createError({ statusCode: 400, message: 'errors.deviceDuplicate' });
      throw createError({ statusCode: 500, message: error.message });
    }
  }
});
