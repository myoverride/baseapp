import { useDB, getMasterDb } from './db';
import { createError } from 'h3';

/**
 * Validates if a username is globally unique across the platform.
 * Ensures strict tenancy isolation between master and sub-tenants.
 */
export const checkUsernameUniqueness = async (tenantSlug: string, username: string) => {
  const globalDb = getMasterDb();
  const masterAppDb = useDB('master');

  if (tenantSlug !== 'master') {
    const masterCheck = await masterAppDb`SELECT id FROM users WHERE username = ${username}`;
    if (masterCheck.length > 0) throw createError({ statusCode: 400, message: 'errors.usernameAlreadyTaken' });

    const globalCheck = await globalDb`SELECT tenant_slug FROM global_users WHERE username = ${username}`;
    if (globalCheck.length > 0 && globalCheck[0].tenant_slug !== tenantSlug) {
      throw createError({ statusCode: 400, message: 'errors.usernameAlreadyTaken' });
    }
  } else {
    const globalCheck = await globalDb`SELECT tenant_slug FROM global_users WHERE username = ${username}`;
    if (globalCheck.length > 0) throw createError({ statusCode: 400, message: 'errors.usernameAlreadyTaken' });
  }
};
