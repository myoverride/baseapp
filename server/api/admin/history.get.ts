import { getHistoryList, getHistoryContent } from '../../utils/history';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const type = query.type as string;
  const id = query.id as string;
  const timestamp = query.timestamp as string;

  if (!type || !id) {
    throw createError({ statusCode: 400, message: 'errors.validationFailed' });
  }

  // Admin access validation is assumed to be handled by middleware on /api/admin/**
  // Or we can add an explicit check here if needed.

  if (timestamp) {
    const data = await getHistoryContent(event.context.tenantSlug, type, id, timestamp);
    if (!data) {
      throw createError({ statusCode: 404, message: 'errors.notFound' });
    }
    return { success: true, data };
  } else {
    const versions = await getHistoryList(event.context.tenantSlug, type, id);
    return { success: true, versions };
  }
});
