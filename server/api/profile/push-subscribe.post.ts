import { useDB } from '../../utils/db';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  const tenantSlug = event.context.tenantSlug;

  if (!user || !tenantSlug) {
    throw createError({ statusCode: 401, message: tEvent(event, 'errors.unauthorized') });
  }

  const subscription = await readBody(event);
  if (!subscription || !subscription.endpoint) {
    throw createError({ statusCode: 400, message: tEvent(event, 'errors.validationFailed') });
  }

  const sql = useDB(tenantSlug);
  
  const existing = await sql`SELECT profile FROM users WHERE id = ${user.id}`;
  if (!existing || existing.length === 0) {
    throw createError({ statusCode: 404, message: tEvent(event, 'error.notFound') });
  }
  
  let currentProfile = {};
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

  const profileAny = currentProfile as any;
  if (!profileAny.pushSubscriptions) {
    profileAny.pushSubscriptions = [];
  }

  // Aynı endpoint daha önce eklenmiş mi kontrol et
  const exists = profileAny.pushSubscriptions.find((sub: any) => sub.endpoint === subscription.endpoint); 
  if (!exists) {
    profileAny.pushSubscriptions.push(subscription);
    const updatedProfileStr = JSON.stringify(currentProfile);
    await sql`UPDATE users SET profile = ${updatedProfileStr}, updated_at = CURRENT_TIMESTAMP WHERE id = ${user.id}`;
  }

  return { success: true };
});
