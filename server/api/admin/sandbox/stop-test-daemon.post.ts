export default defineEventHandler(async (event) => {
  const user = event.context.user;
  if (!user) {
    throw createError({ statusCode: 401, message: 'errors.loginRequired' });
  }
  if (!user.is_admin && !user.is_super_admin) {
    throw createError({ statusCode: 403, message: 'errors.forbiddenAdminOnly' });
  }

  const { stopTestDaemon } = await import('../../../utils/workerManager');
  if(stopTestDaemon) await stopTestDaemon(event.context.tenantSlug);

  return { success: true };
});
