import { useDB } from '../../../utils/db';
import { migrateRecordsToNewSchema } from '../../../utils/schemaMigration';
import { validateRelationSchemaPolicies, deleteEntityWithRelationPolicy } from '../../../utils/relationDeletePolicy';
import { checkRequiredFieldsOnSchemaUpdate, checkUniqueFieldsOnSchemaUpdate } from '../../../utils/schemaValidator';
import { isValidSlug } from '../../../utils/validator';

export default defineEventHandler(async (event) => {
  const method = getMethod(event);
  const id = getRouterParam(event, 'id');
  const sql = useDB(event.context.tenantSlug);
  if (!id) {
    throw createError({ statusCode: 400, message: 'errors.validationFailed' });
  }

  if (method === 'GET') {
    try {
      const result = await sql`
        SELECT id, name, slug, schema, hashtags, created_at, updated_at 
        FROM entities 
        WHERE id = ${id}
      `;
      if (result.length === 0) {
        throw createError({ statusCode: 404, message: 'errors.notFound' });
      }
      return { success: true, message: 'message.success', data: result[0] };
    } catch (e: any) {
      if (e.statusCode) throw e;
      throw createError({ statusCode: 500, message: 'errors.internalError' });
    }
  }

  if (method === 'PUT') {
    const body = await readBody(event);
    if (!body.name || !body.schema || !body.slug) {
      throw createError({ statusCode: 400, message: 'errors.validationFailed' });
    }

    const existingEntity = await sql`SELECT slug FROM entities WHERE id = ${id}`;
    if (existingEntity.length === 0) {
      throw createError({ statusCode: 404, message: 'errors.notFound' });
    }
    if (existingEntity[0].slug !== body.slug) {
      throw createError({ statusCode: 400, message: 'error.entitySlugImmutable' });
    }

    for (const key of Object.keys(body.schema)) {
      if (!isValidSlug(key)) {
        throw createError({ statusCode: 400, message: 'error.invalidFieldSlug|' + key });
      }
    }

    try {
      validateRelationSchemaPolicies(body.schema);
      await checkRequiredFieldsOnSchemaUpdate(sql, Number(id), body.schema);
      await checkUniqueFieldsOnSchemaUpdate(sql, Number(id), body.schema);
    } catch (e: any) {
      throw createError({ statusCode: e?.statusCode || 400, message: e?.message || 'errors.validationFailed' });
    }

    const isSystem = event.context.user?.is_super_admin ? 1 : 0;
    const userId = event.context.user?.id || null;

    try {
      const result = await sql`
        UPDATE entities 
        SET name = ${body.name}, slug = ${body.slug}, schema = ${sql.json(body.schema)}, hashtags = ${sql.json(body.hashtags || [])}, updated_at = CURRENT_TIMESTAMP, updated_by = ${userId}, system_modified = ${isSystem} 
        WHERE id = ${id} 
        RETURNING *
      `;
      if (result.length === 0) {
        throw createError({ statusCode: 404, message: 'errors.notFound' });
      }

      // Şema değişmişse eski kayıtları yeni şemaya uyduracak migration sürecini arka planda başlat
      const entityData = result[0] as any;
      migrateRecordsToNewSchema(event.context.tenantSlug, entityData.id, null, body.schema).catch((err: any) => {
        console.error(`Migration failed for entity ${entityData.id}:`, err);
      });

      return entityData;
    } catch (e: any) {
      if (e.code === '23505' || (e.message && e.message.includes('UNIQUE constraint failed'))) {
        throw createError({ statusCode: 409, message: 'errors.duplicateSlug' });
      }
      throw createError({ statusCode: 500, message: 'errors.internalError' });
    }
  }

  if (method === 'DELETE') {
    try {
      const entityExists = await sql`SELECT id FROM entities WHERE id = ${id}`;
      if (entityExists.length === 0) {
        throw createError({ statusCode: 404, message: 'errors.notFound' });
      }

      await sql.begin(async (tx: any) => {
        await deleteEntityWithRelationPolicy(tx, Number(id));
      });

      return { success: true, message: 'message.success', data: { deletedId: id } };
    } catch (e: any) {
      if (e?.statusCode) {
        throw createError({ statusCode: e.statusCode, message: e.message });
      }
      throw createError({ statusCode: 500, message: 'errors.internalError' });
    }
  }
});
