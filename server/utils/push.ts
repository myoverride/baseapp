import webpush from 'web-push';
import { useDB } from './db';

export async function sendPushToUser(tenantSlug: string, userId: number, payload: any) {
  const sql = useDB(tenantSlug);
  const result = await sql`SELECT profile FROM users WHERE id = ${userId}`;
  
  if (result && result.length > 0 && result[0].profile) {
    let profile: any = {};
    if (typeof result[0].profile === 'string') {
      try {
        profile = JSON.parse(result[0].profile);
      } catch {}
    } else {
      profile = result[0].profile;
    }

    if (profile.pushSubscriptions && Array.isArray(profile.pushSubscriptions)) {
      let expiredFound = false;

      const promises = profile.pushSubscriptions.map(async (sub: any) => {
        try {
          await webpush.sendNotification(sub, JSON.stringify(payload));
        } catch (err: any) {
          if (err.statusCode === 410) {
            // Subscription has expired or is no longer valid
            console.log('Push subscription expired for user', userId);
            sub._expired = true;
            expiredFound = true;
          } else {
            console.error('Push error for user', userId, err.message);
          }
        }
      });
      await Promise.allSettled(promises);

      if (expiredFound) {
        profile.pushSubscriptions = profile.pushSubscriptions.filter((s: any) => !s._expired);
        await sql`UPDATE users SET profile = ${typeof result[0].profile === 'string' ? JSON.stringify(profile) : profile} WHERE id = ${userId}`;
      }
    }
  }
}

export async function broadcastPush(tenantSlug: string, payload: any) {
  const sql = useDB(tenantSlug);
  // Get all users who have at least one push subscription in their profile (Optimized away from LIKE)
  const users = await sql`SELECT id, profile FROM users WHERE json_type(profile, '$.pushSubscriptions') = 'array'`;
  
  const promises = users.map(async (user: any) => {
    if (user.profile) {
      let profile: any = {};
      if (typeof user.profile === 'string') {
        try {
          profile = JSON.parse(user.profile);
        } catch {}
      } else {
        profile = user.profile;
      }
      
      if (profile.pushSubscriptions && Array.isArray(profile.pushSubscriptions)) {
        let expiredFound = false;

        const subPromises = profile.pushSubscriptions.map(async (sub: any) => {
          try {
            await webpush.sendNotification(sub, JSON.stringify(payload));
          } catch (err: any) {
            if (err.statusCode === 410) {
              sub._expired = true;
              expiredFound = true;
            }
          }
        });

        await Promise.allSettled(subPromises);

        if (expiredFound) {
          profile.pushSubscriptions = profile.pushSubscriptions.filter((s: any) => !s._expired);
          await sql`UPDATE users SET profile = ${typeof user.profile === 'string' ? JSON.stringify(profile) : profile} WHERE id = ${user.id}`;
        }
      }
    }
  });

  await Promise.allSettled(promises);
}
