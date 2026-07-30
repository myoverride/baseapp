import { useDB } from '../../../utils/db';
import { validateRelationSchemaPolicies } from '../../../utils/relationDeletePolicy';
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
      const isExport = query.export === 'true';

      const filtersParam = (query.advancedFilters || query.filters) as string;

      let baseQuery = `FROM entities WHERE 1=1`;
      const queryParams: any[] = [];

      if (search) {
        baseQuery += ` AND (name LIKE $1 OR slug LIKE $1)`;
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

      const selectCols = 'id, name, slug, schema, hashtags, created_at, updated_at';

      const pagedRes = await sql.unsafe(`
        SELECT ${selectCols} 
        ${baseQuery} 
        ORDER BY created_at DESC 
        LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
      `, [...queryParams, limit, offset]);

      return {
        records: pagedRes,
        total: totalCount,
        page: page,
        limit: limit
      };
    } catch (e: any) {
      throw createError({ statusCode: 500, message: e.message });
    }
  }

  if (method === 'POST') {
    const body = await readBody(event);
    if (body.records && Array.isArray(body.records)) {
      const records = body.records;
      const user = event.context.user;

      if (!Array.isArray(records) || records.length === 0) {
        throw createError({ statusCode: 400, message: 'errors.notFound' });
      }

      if (records.length > 100) {
        throw createError({ statusCode: 400, message: 'errors.importDataRequired' });
      }

      const errors = [];
      const validRecords = [];

      for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        if (!rec.name || !rec.slug || !rec.schema) {
          errors.push(`Satır ${i + 1}: Varlık name, slug ve schema alanlarına sahip olmalıdır.`);
        } else {
          try {
            validateRelationSchemaPolicies(rec.schema);
          } catch (e: any) {
            errors.push(`Satır ${i + 1}: ${e?.message || 'Geçersiz relation onDelete kuralı.'}`);
          }
          validRecords.push(rec);
        }
      }

      if (errors.length > 0) {
        throw createError({ statusCode: 400, message: 'errors.importValidationErrors: ' + errors.join('\n') });
      }

      if (validRecords.length === 0) {
        return { success: true, inserted: 0, updated: 0 };
      }

      try {
        let updatedCount = 0;
        let insertedCount = 0;

        for (const rec of validRecords) {
          const existing = await sql`SELECT id FROM entities WHERE slug = ${rec.slug}`;
          if (existing.length > 0) {
            // Update
            await sql`
                UPDATE entities 
                SET name = ${rec.name}, schema = ${sql.json(rec.schema)}, hashtags = ${sql.json(rec.hashtags || [])}, updated_at = CURRENT_TIMESTAMP 
                WHERE slug = ${rec.slug}
              `;
            updatedCount++;
          } else {
            // Insert
            await sql`
                INSERT INTO entities (name, slug, schema, hashtags) 
                VALUES (${rec.name}, ${rec.slug}, ${sql.json(rec.schema)}, ${sql.json(rec.hashtags || [])})
              `;
            insertedCount++;
          }
        }

        return {
          success: true,
          message: 'message.success',
          inserted: insertedCount,
          updated: updatedCount
        };
      } catch (e: any) {
        throw createError({ statusCode: 500, message: 'errors.internalError: ' + e.message });
      }

    }


    if (!body.name || !body.schema || !body.slug) {
      throw createError({ statusCode: 400, message: 'errors.validationFailed' });
    }

    try {
      validateRelationSchemaPolicies(body.schema);
    } catch (e: any) {
      throw createError({ statusCode: e?.statusCode || 400, message: e?.message || 'errors.validationFailed' });
    }

    try {
      const result = await sql`
        INSERT INTO entities (name, slug, schema, hashtags) 
        VALUES (${body.name}, ${body.slug}, ${sql.json(body.schema)}, ${sql.json(body.hashtags || [])}) 
        RETURNING *
      `;
      return result[0];
    } catch (e: any) {
      if (e.code === '23505') { // unique violation
        throw createError({ statusCode: 409, message: 'errors.duplicateSlug' });
      }
      throw createError({ statusCode: 500, message: e.message });
    }
  }
});
