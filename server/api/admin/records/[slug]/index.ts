import { getRecords, createRecord, bulkImportRecords } from '../../../../utils/recordManager';

export default defineEventHandler(async (event) => {
  const method = event.node.req.method;
  const slug = event.context.params?.slug;
  const tenantSlug = event.context.tenantSlug;

  if (!slug) {
    throw createError({ statusCode: 400, message: tEvent(event, 'errors.validationFailed') });
  }

  const user = event.context.user;
  if (!user || !user.is_admin) {
    throw createError({ statusCode: 403, message: 'errors.forbiddenAdminOnly' });
  }

  if (method === 'GET') {
    try {
      const query = getQuery(event);
      const result = await getRecords(tenantSlug, slug, query);
      return result;
    } catch (e: any) {
      throw createError({ statusCode: e.statusCode || 500, message: e.message || 'Internal Error' });
    }
  }

  if (method === 'POST') {
    const body = await readBody(event);
    
    // BULK IMPORT LOGIC
    if (body.records && Array.isArray(body.records)) {
      try {
        const res = await bulkImportRecords(tenantSlug, slug, body.records, user.id);
        if (!res.success) throw createError({ statusCode: 400, message: res.message });
        return { success: true, message: 'success.importSuccessful' };
      } catch (e: any) {
        throw createError({ statusCode: e.statusCode || 500, message: e.message });
      }
    }

    // SINGLE CREATE LOGIC
    try {
      const result = await createRecord(tenantSlug, slug, body, user.id);
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
});