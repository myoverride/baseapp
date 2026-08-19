import { getMasterDb } from '../../../utils/db';

export default defineEventHandler(async (event) => {
  const user = event.context.user;


  const id = event.context.params?.id;
  if (!id) {
    throw createError({ statusCode: 400, message: 'validation.required' });
  }

  const body = await readBody(event);
  const sql = getMasterDb();
  
  try {
    if (body.slug) {
      const slugFormat = /^[a-z0-9-]+$/;
      if (!slugFormat.test(body.slug)) {
         throw createError({ statusCode: 400, message: 'validation.tenantSlugPattern' });
      }
      const exists = await sql`SELECT id FROM tenants WHERE slug = ${body.slug} AND id != ${id}`;
      if (exists.length > 0) {
        throw createError({ statusCode: 409, message: 'errors.duplicateSlug' });
      }
    }

    const updates: any[] = [];
    const values: any[] = [];
    if (body.name !== undefined) {
      updates.push('name = ?');
      values.push(body.name);
    }
    if (body.slug !== undefined) {
      updates.push('slug = ?');
      values.push(body.slug);
    }
    if (body.status !== undefined) {
      updates.push('status = ?');
      values.push(body.status);
    }
    if (body.custom_domain !== undefined) {
      let customDomain = body.custom_domain ? String(body.custom_domain).trim().toLowerCase() : null;
      if (customDomain) {
         customDomain = customDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      }
      updates.push('custom_domain = ?');
      values.push(customDomain);
    }
    if (body.hashtags !== undefined) {
      const hashtagsStr = typeof body.hashtags === 'string' ? body.hashtags : JSON.stringify(body.hashtags || []);
      updates.push('hashtags = ?');
      values.push(hashtagsStr);
    }

    if (updates.length > 0) {
      const oldData = await sql`SELECT slug FROM tenants WHERE id = ${id}`;
      values.push(id);
      await sql.unsafe(`UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`, values);
      
      const { invalidateTenantCache } = await import('../../../middleware/00.tenant');
      if (oldData.length > 0) invalidateTenantCache(oldData[0].slug);
      if (body.slug) invalidateTenantCache(body.slug);
    }

    return { success: true, message: tEvent(event, 'message.entityUpdated', { name: tEvent(event, 'entity.tenant') }) };
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message || 'errors.operationFailed' });
  }
});
