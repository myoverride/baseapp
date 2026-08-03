import { useDB } from '../../../utils/db';
import { removeDeviceFromCache } from '../../../utils/mqtt';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  const method = getMethod(event);
  const sql = useDB(event.context.tenantSlug);

  if (!id) throw createError({ statusCode: 400, message: 'errors.validationFailed' });

  // 1. GET: Tekil Cihaz Detayı
  if (method === 'GET') {
    const device = await sql`SELECT * FROM devices WHERE id = ${id}`;
    if (!device[0]) throw createError({ statusCode: 404, message: 'errors.notFound' });
    return device[0];
  }

  // 2. PUT: Cihaz Bilgilerini Güncelle
  if (method === 'PUT') {
    const body = await readBody(event);
    if (!body.deviceId?.trim()) throw createError({ statusCode: 400, message: 'errors.deviceIdRequired' });

    try {
      // Önce eski device_id'yi bul (Cache temizliği için)
      const oldDevice = await sql`SELECT device_id FROM devices WHERE id = ${id}`;
      if (!oldDevice[0]) throw createError({ statusCode: 404, message: 'errors.notFound' });

      const existingDevice = await sql`SELECT schema FROM devices WHERE id = ${id}`;
      const existingSchemaRaw = existingDevice[0]?.schema;
      let existingSchema: any = {};
      if (existingSchemaRaw && typeof existingSchemaRaw === 'string') {
        try {
          existingSchema = JSON.parse(existingSchemaRaw);
        } catch {
          existingSchema = {};
        }
      } else if (existingSchemaRaw && typeof existingSchemaRaw === 'object') {
        existingSchema = existingSchemaRaw;
      }

      const mergedSchema = {
        ...existingSchema,
        ...(body.targetRecordId ? { target_record_id: Number(body.targetRecordId) } : {})
      };

      const updated = await sql`
        UPDATE devices SET device_id = ${body.deviceId.trim()}, secret_key = COALESCE(${body.secretKey || null}, secret_key), schema = ${sql.json(mergedSchema)}, hashtags = ${sql.json(body.hashtags || [])}, updated_at = CURRENT_TIMESTAMP, updated_by = ${event.context.user.id}
        WHERE id = ${id} RETURNING *
      `;

      // KRİTİK: Eğer ID değiştiyse eski ID'yi RAM'den sil ki yetkisiz kalsın
      if (oldDevice[0].device_id !== body.deviceId.trim()) {
        removeDeviceFromCache(event.context.tenantSlug, oldDevice[0].device_id);
      }
      removeDeviceFromCache(event.context.tenantSlug, body.deviceId.trim());

      return { success: true, data: updated[0] };
    } catch (error: any) {
      throw createError({ statusCode: 500, message: error.message });
    }
  }

  // 3. DELETE: Cihazı Sil
  if (method === 'DELETE') {
    const device = await sql`SELECT device_id FROM devices WHERE id = ${id}`;
    if (device[0]) removeDeviceFromCache(event.context.tenantSlug, device[0].device_id);
    
    await sql`DELETE FROM devices WHERE id = ${id}`;
    return { success: true, message: tEvent(event, 'message.entityDeleted', { name: 'entity.device' }) };
  }
});
