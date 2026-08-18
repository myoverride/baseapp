import { useDB } from '../../utils/db';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  const tenantSlug = event.context.tenantSlug;
  if (!user || !tenantSlug) {
    throw createError({ statusCode: 401, message: 'errors.unauthorized' });
  }

  const subscription = await readBody(event);
  if (!subscription || !subscription.endpoint) {
    throw createError({ statusCode: 400, message: 'errors.validationFailed' });
  }

  const sql = useDB(tenantSlug);
  const existing = await sql`SELECT profile FROM users WHERE id = ${user.id}`;
  if (!existing || existing.length === 0) {
    throw createError({ statusCode: 404, message: tEvent(event, 'error.notFound') });
  }

  let currentProfile: any = {};
  if (existing[0].profile) {
    if (typeof existing[0].profile === 'string') {
      try {
        currentProfile = JSON.parse(existing[0].profile);
      } catch {
        currentProfile = {};
      }
    } else {
      currentProfile = existing[0].profile;
    }
  }

  if (currentProfile.pushSubscriptions && Array.isArray(currentProfile.pushSubscriptions)) {
    currentProfile.pushSubscriptions = currentProfile.pushSubscriptions.filter((sub: any) => sub.endpoint !== subscription.endpoint);
    await sql`UPDATE users SET profile = ${JSON.stringify(currentProfile)} WHERE id = ${user.id}`;
  }

  return { success: true };
});
