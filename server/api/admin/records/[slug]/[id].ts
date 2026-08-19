import { getRecord, updateRecord, deleteRecord } from '../../../../utils/recordManager';

export default defineEventHandler(async (event) => {
  const method = event.node.req.method;
  const slug = event.context.params?.slug;
  const id = event.context.params?.id;
  const tenantSlug = event.context.tenantSlug;

  if (!slug || !id) {
    throw createError({ statusCode: 400, message: 'errors.validationFailed' });
  }

  const user = event.context.user;

  if (method === 'PUT') {
    const body = await readBody(event);
    try {
      const isSystem = user.is_super_admin ? 1 : 0;
      const result = await updateRecord(tenantSlug, slug, id, body, user.id, isSystem);
      return result;
    } catch (e: any) {
      if (e.statusCode) {
        throw createError({
          statusCode: e.statusCode,
          statusMessage: e.statusMessage || e.message,
          message: (e.statusCode && e.statusCode < 500) ? e.message : 'errors.internalError',
          data: e.data
        });
      }
      throw createError({ statusCode: 500, message: 'errors.internalError' });
    }
  }

  if (method === 'DELETE') {
    try {
      const result = await deleteRecord(tenantSlug, slug, id);
      return result;
    } catch (e: any) {
      throw createError({ statusCode: e.statusCode || 500, message: (e.statusCode && e.statusCode < 500) ? (e.message || 'errors.internalError') : 'errors.internalError' });
    }
  }

  if (method === 'GET') {
    try {
      const result = await getRecord(tenantSlug, slug, id);
      return result;
    } catch (e: any) {
      throw createError({ statusCode: e.statusCode || 500, message: (e.statusCode && e.statusCode < 500) ? (e.message || 'errors.internalError') : 'errors.internalError' });
    }
  }
});