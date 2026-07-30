import { bulkImportRecords } from '../../../../utils/recordManager';

export default defineEventHandler(async (event) => {
  const method = event.node.req.method;
  const slug = event.context.params?.slug;
  const tenantSlug = event.context.tenantSlug;

  if (method !== 'POST') {
    throw createError({ statusCode: 405, message: tEvent(event, 'errors.methodNotAllowed') });
  }

  if (!slug) {
    throw createError({ statusCode: 400, message: tEvent(event, 'errors.validationFailed') });
  }

  const user = event.context.user;
  if (!user || !user.is_admin) {
    throw createError({ statusCode: 403, message: 'errors.forbiddenAdminOnly' });
  }

  const body = await readBody(event);
  const records = body.records;

  if (!Array.isArray(records) || records.length === 0) {
    throw createError({ statusCode: 400, message: tEvent(event, 'error.notFound') });
  }

  if (records.length > 5000) {
    throw createError({ statusCode: 400, message: tEvent(event, 'errors.importLimitExceeded') });
  }

  try {
    const res = await bulkImportRecords(tenantSlug, slug, records, user.id);
    if (!res.success) {
      throw createError({ statusCode: 400, message: res.message });
    }
    return {
      success: true,
      message: tEvent(event, 'message.success'),
      inserted: res.count
    };
  } catch (e: any) {
    throw createError({ statusCode: 500, message: tEvent(event, 'errors.internalError') + ': ' + e.message });
  }
});