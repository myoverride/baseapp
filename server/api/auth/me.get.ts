export default defineEventHandler((event) => {
  const user = event.context.user;
  if (!user) {
    throw createError({ statusCode: 401, message: tEvent(event, 'error.notFound') });
  }
  return { success: true, user };
});
