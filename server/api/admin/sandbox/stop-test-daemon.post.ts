export default defineEventHandler(async (event) => {
  const user = event.context.user;
  if (!user || (!user.is_admin && !user.is_super_admin)) {
    throw createError({ statusCode: 403, message: 'Yetkisiz' });
  }

  const { stopTestDaemon } = await import('../../../utils/workerManager');
  await stopTestDaemon(event.context.tenantSlug);

  return { success: true };
});
