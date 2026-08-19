export default defineEventHandler(async (event) => {
  const user = event.context.user;


  const { stopTestDaemon } = await import('../../../utils/workerManager');
  if(stopTestDaemon) await stopTestDaemon(event.context.tenantSlug);

  return { success: true };
});
