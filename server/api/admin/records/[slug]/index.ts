import { getRecords, createRecord, bulkImportRecords } from '../../../../utils/recordManager';

export default defineEventHandler(async (event) => {
  const method = event.node.req.method;
  const slug = event.context.params?.slug;
  const tenantSlug = event.context.tenantSlug;

  if (!slug) {
    throw createError({ statusCode: 400, message: 'errors.validationFailed' });
  }

  const user = event.context.user;

  if (method === 'GET') {
    try {
      const query = getQuery(event);
      const result = await getRecords(tenantSlug, slug, query);
      return result;
    } catch (e: any) {
      throw createError({ statusCode: e.statusCode || 500, message: (e.statusCode && e.statusCode < 500) ? (e.message || 'errors.internalError') : 'errors.internalError' });
    }
  }

  if (method === 'POST') {
    const body = await readBody(event);
    
    // BULK IMPORT LOGIC
    if (body.records && Array.isArray(body.records)) {
      try {
        const isSystem = user.is_super_admin ? 1 : 0;
        const res = await bulkImportRecords(tenantSlug, slug, body.records, user.id, isSystem);
        if (!res.success) throw createError({ statusCode: 400, message: res.message });
        return { success: true, message: 'success.importSuccessful' };
      } catch (e: any) {
        throw createError({ statusCode: e.statusCode || 500, message: (e.statusCode && e.statusCode < 500) ? (e.message || 'errors.internalError') : 'errors.internalError' });
      }
    }

    // SINGLE CREATE LOGIC
    try {
      const isSystem = user.is_super_admin ? 1 : 0;
      const result = await createRecord(tenantSlug, slug, body, user.id, isSystem);
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
});