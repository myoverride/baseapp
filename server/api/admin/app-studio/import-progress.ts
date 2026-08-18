import { importProgressMap } from '../../../utils/importProgressManager';

export default defineEventHandler((event) => {
  const query = getQuery(event);
  const importId = query.importId as string;

  if (!importId) {
    throw createError({ statusCode: 400, message: 'Missing importId parameter' });
  }

  const progress = importProgressMap.get(importId);
  if (!progress) {
    return {
      success: false,
      message: 'No progress found for this importId',
      data: null
    };
  }

  return {
    success: true,
    data: {
      total: progress.total,
      processed: progress.processed,
      percentage: progress.total > 0 ? Math.floor((progress.processed / progress.total) * 100) : 0,
      errors: progress.errors,
      status: progress.status
    }
  };
});
