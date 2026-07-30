import { getMasterDb } from '../../../utils/db';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  if (!user || !user.is_super_admin) {
    throw createError({ statusCode: 403, message: 'errors.unauthorized' });
  }

  const body = await readBody(event);
  const sql = getMasterDb();
  
  // BULK IMPORT LOGIC
  if (body.records && Array.isArray(body.records)) {
    let updatedCount = 0;
    let insertedCount = 0;
    const slugFormat = /^[a-z0-9-]+$/;

    for (const rec of body.records) {
      const slug = String(rec.slug || '').trim();
      const name = String(rec.name || '').trim();
      if (!slug || !name || !slugFormat.test(slug)) continue;

      const status = rec.status || 'active';
      
      let customDomain = rec.custom_domain ? String(rec.custom_domain).trim().toLowerCase() : null;
      if (customDomain) {
         customDomain = customDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      }
      
      const hashtagsStr = typeof rec.hashtags === 'string' ? rec.hashtags : JSON.stringify(rec.hashtags || []);

      const existing = await sql.unsafe('SELECT id FROM tenants WHERE slug = ?', [slug]);
      if (existing.length > 0) {
        await sql.unsafe('UPDATE tenants SET name = ?, status = ?, custom_domain = ?, hashtags = ? WHERE slug = ?', [name, status, customDomain, hashtagsStr, slug]);
        const { invalidateTenantCache } = await import('../../../middleware/00.tenant');
        invalidateTenantCache(slug);
        updatedCount++;
      } else {
        await sql.unsafe('INSERT INTO tenants (name, slug, status, custom_domain, hashtags) VALUES (?, ?, ?, ?, ?)', [name, slug, status, customDomain, hashtagsStr]);
        insertedCount++;
      }
    }
    return { success: true, message: 'success.importSuccessful' };
  }

  // SINGLE CREATE LOGIC
  if (!body.name || !body.slug) {
    throw createError({ statusCode: 400, message: 'validation.required' });
  }
  
  try {
    const slugFormat = /^[a-z0-9-]+$/;
    if (!slugFormat.test(body.slug)) {
       throw createError({ statusCode: 400, message: 'validation.tenantSlugPattern' });
    }
    
    let customDomain = body.custom_domain ? String(body.custom_domain).trim().toLowerCase() : null;
    if (customDomain) {
       customDomain = customDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    }

    const exists = await sql.unsafe('SELECT id FROM tenants WHERE slug = ?', [body.slug]);
    if (exists.length > 0) {
      throw createError({ statusCode: 409, message: 'errors.duplicateSlug' });
    }

    const hashtagsStr = JSON.stringify(body.hashtags || []);

    await sql.unsafe(`
      INSERT INTO tenants (name, slug, status, custom_domain, hashtags)
      VALUES (?, ?, ?, ?, ?)
    `, [body.name, body.slug, body.status || 'active', customDomain, hashtagsStr]);

    return { success: true, message: tEvent(event, 'message.entityCreated', { name: tEvent(event, 'entity.tenant') }) };
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message || 'errors.operationFailed' });
  }
});
