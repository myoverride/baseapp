import { useDB, useTelemetryDB } from '../../../../utils/db';

export default defineEventHandler(async (event) => {
  const method = event.node.req.method;
  const deviceId = event.context.params?.device_id;
  const sql = useDB(event.context.tenantSlug);
  const telemetrySql = useTelemetryDB(event.context.tenantSlug);

  if (!deviceId) {
    throw createError({ statusCode: 400, message: tEvent(event, 'errors.validationFailed') });
  }

  // Cihazın var olup olmadığını kontrol edelim
  const deviceResult = await sql`SELECT id, device_id, schema FROM devices WHERE device_id = ${deviceId}`;
  if (deviceResult.length === 0) {
    throw createError({ statusCode: 404, message: tEvent(event, 'error.notFound') });
  }
  const device = deviceResult[0];

  if (method === 'GET') {
    try {
      const query = getQuery(event);
      const page = Math.max(1, parseInt(query.page as string) || 1);
      const limit = Math.max(1, parseInt(query.limit as string) || 10);
      const offset = (page - 1) * limit;

      let baseQuery = `FROM telemetry WHERE device_id = $1`;
      const queryParams: any[] = [deviceId];
      
      const search = query.search as string;
      if (search) {
        queryParams.push(`%${search}%`);
        baseQuery += ` AND CAST(payload AS VARCHAR) LIKE $${queryParams.length}`;
      }

      let sortBy = query.sortBy as string || 'timestamp';
      if (sortBy === 'created_at') sortBy = 'timestamp';
      const sortOrder = (query.sortOrder as string || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      const safeSortBy = /^[\p{L}0-9_ \.\-]+$/u.test(sortBy) ? sortBy : 'timestamp';

      // COUNT ve SELECT'i tek sorguda birleştiriyoruz (iki ayrı tablo taraması yerine bir tane)
      const pagedRes = await telemetrySql.unsafe(`
        SELECT 
            rowid as id,
            payload,
            timestamp,
            COUNT(*) OVER() as _total_count
        ${baseQuery} 
        ORDER BY ${safeSortBy} ${sortOrder}, rowid ${sortOrder}
        LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
      `, [...queryParams, limit, offset]);

      const totalCount = pagedRes.length > 0 ? parseInt((pagedRes[0] as any)?._total_count || '0') : 0;

      const finalRecords = pagedRes.map((r: any) => ({
        id: r.id,
        payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
        timestamp: r.timestamp
      }));

      return {
        device: device,
        records: finalRecords,
        total: totalCount,
        page: page,
        limit: limit
      };
    } catch (e: any) {
      throw createError({ statusCode: 500, message: e.message });
    }
  }
});
