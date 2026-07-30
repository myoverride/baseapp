import { getRecord, updateRecord, deleteRecord } from '../../../../utils/recordManager';

export default defineEventHandler(async (event) => {
  const method = event.node.req.method;
  const slug = event.context.params?.slug;
  const id = event.context.params?.id;
  const tenantSlug = event.context.tenantSlug;

  if (!slug || !id) {
    throw createError({ statusCode: 400, message: tEvent(event, 'errors.validationFailed') });
  }

  const user = event.context.user;
  if (!user || !user.is_admin) {
    throw createError({ statusCode: 403, message: 'errors.forbiddenAdminOnly' });
  }

  if (method === 'PUT') {
    const body = await readBody(event);
    try {
      const result = await updateRecord(tenantSlug, slug, id, body, user.id);
      return result;
    } catch (e: any) {
      if (e.statusCode) {
        throw createError({
          statusCode: e.statusCode,
          statusMessage: e.statusMessage || e.message,
          message: e.message,
          data: e.data
        });
      }
      throw createError({ statusCode: 500, message: e.message || 'Internal Error' });
    }
  }

  if (method === 'DELETE') {
    try {
      const result = await deleteRecord(tenantSlug, slug, id);
      return result;
    } catch (e: any) {
      throw createError({ statusCode: e.statusCode || 500, message: e.message || 'Internal Error' });
    }
  }

  if (method === 'GET') {
    try {
      const result = await getRecord(tenantSlug, slug, id);
      return result;
    } catch (e: any) {
      throw createError({ statusCode: e.statusCode || 500, message: e.message || 'Internal Error' });
    }
  }
});