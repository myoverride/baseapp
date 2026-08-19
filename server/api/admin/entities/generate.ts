import { useDB } from '../../../utils/db';
import { invalidateEndpointCache } from '../../../utils/endpointManager';

export default defineEventHandler(async (event) => {
  const method = event.node.req.method;
  const sql = useDB(event.context.tenantSlug);
  const user = event.context.user;

  if (!user || !user.is_admin) {
    throw createError({ statusCode: 403, message: 'errors.forbidden' });
  }

  if (method !== 'POST') {
    throw createError({ statusCode: 405, message: 'errors.methodNotAllowed' });
  }

  const body = await readBody(event);
  const { entityId, options, hashtags } = body;

  if (!entityId) {
    throw createError({ statusCode: 400, message: 'errors.entityIdRequired' });
  }

  const entityResult = await sql`SELECT slug, name, schema FROM entities WHERE id = ${entityId}`;
  if (entityResult.length === 0) {
    throw createError({ statusCode: 404, message: 'errors.entityNotFound' });
  }
  
  const entity = entityResult[0] as any;
  const slug = entity.slug;
  const hashtagsJson = JSON.stringify(Array.isArray(hashtags) ? hashtags : []);
  const isSystem = user.is_super_admin ? 1 : 0;

  let insertedMiddlewares = 0;
  let insertedPages = 0;

  // Middleware Şablonları
  const getListCode = `
const reqMethod = payload.method;
if (reqMethod !== 'GET') return;
const reqId = payload.params?.id;
if (reqId) return;

try {
  const result = await recordManager.getRecords('${slug}', payload.query || {});
  return { respond: true, status: 200, headers: { 'Content-Type': 'application/json' }, body: result };
} catch(e) {
  return { respond: true, status: e.statusCode || 500, headers: { 'Content-Type': 'application/json' }, body: { message: (e.statusCode && e.statusCode < 500) ? (e.message || e) : 'errors.internalError' } };
}
`.trim();

  const getSingleCode = `
const reqMethod = payload.method;
if (reqMethod !== 'GET') return;
const reqId = payload.params?.id;
if (!reqId || reqId === 'bulk') return;

try {
  const result = await recordManager.getRecord('${slug}', reqId);
  return { respond: true, status: 200, headers: { 'Content-Type': 'application/json' }, body: result };
} catch(e) {
  return { respond: true, status: e.statusCode || 500, headers: { 'Content-Type': 'application/json' }, body: { message: (e.statusCode && e.statusCode < 500) ? (e.message || e) : 'errors.internalError' } };
}
`.trim();

  const postCreateCode = `
const reqMethod = payload.method;
if (reqMethod !== 'POST') return;
const body = payload.body || {};
const reqUser = context.user;
const isSystem = reqUser?.is_super_admin ? 1 : 0;

try {
  const result = await recordManager.createRecord('${slug}', body, reqUser?.id, isSystem);
  return { respond: true, status: 200, headers: { 'Content-Type': 'application/json' }, body: result };
} catch(e) {
  return { respond: true, status: e.statusCode || 500, headers: { 'Content-Type': 'application/json' }, body: { message: (e.statusCode && e.statusCode < 500) ? (e.message || e) : 'errors.internalError', errors: e.data } };
}
`.trim();

  const putUpdateCode = `
const reqMethod = payload.method;
if (reqMethod !== 'PUT') return;
const reqId = payload.params?.id;
if (!reqId || reqId === 'bulk') return;
const body = payload.body || {};
const reqUser = context.user;
const isSystem = reqUser?.is_super_admin ? 1 : 0;

try {
  const result = await recordManager.updateRecord('${slug}', reqId, body, reqUser?.id, isSystem);
  return { respond: true, status: 200, headers: { 'Content-Type': 'application/json' }, body: result };
} catch(e) {
  return { respond: true, status: e.statusCode || 500, headers: { 'Content-Type': 'application/json' }, body: { message: (e.statusCode && e.statusCode < 500) ? (e.message || e) : 'errors.internalError', errors: e.data } };
}
`.trim();

  const deleteCode = `
const reqMethod = payload.method;
if (reqMethod !== 'DELETE') return;
const reqId = payload.params?.id;
if (!reqId || reqId === 'bulk') return;

try {
  const result = await recordManager.deleteRecord('${slug}', reqId);
  return { respond: true, status: 200, headers: { 'Content-Type': 'application/json' }, body: result };
} catch(e) {
  return { respond: true, status: e.statusCode || 500, headers: { 'Content-Type': 'application/json' }, body: { message: (e.statusCode && e.statusCode < 500) ? (e.message || e) : 'errors.internalError' } };
}
`.trim();

  const bulkCode = `
const reqMethod = payload.method;
const body = payload.body || {};
const reqUser = context.user;

if (reqMethod === 'DELETE') {
  try {
    const ids = body.ids;
    if (!Array.isArray(ids) || ids.length === 0) throw createError({ statusCode: 400, message: 'validation.required', data: { field: 'ids' } });
    const result = await recordManager.bulkDeleteRecords('${slug}', ids);
    return { respond: true, status: 200, headers: { 'Content-Type': 'application/json' }, body: result };
  } catch(e) {
    return { respond: true, status: e.statusCode || 500, headers: { 'Content-Type': 'application/json' }, body: { message: (e.statusCode && e.statusCode < 500) ? (e.message || e) : 'errors.internalError' } };
  }
}

if (reqMethod === 'POST') {
  try {
    const records = body.records;
    if (!Array.isArray(records) || records.length === 0) throw createError({ statusCode: 400, message: 'validation.required', data: { field: 'records' } });
    const result = await recordManager.bulkImportRecords('${slug}', records, reqUser?.id);
    if (!result.success) return { respond: true, status: 400, headers: { 'Content-Type': 'application/json' }, body: { message: result.message } };
    return { respond: true, status: 200, headers: { 'Content-Type': 'application/json' }, body: result };
  } catch(e) {
    return { respond: true, status: e.statusCode || 500, headers: { 'Content-Type': 'application/json' }, body: { message: (e.statusCode && e.statusCode < 500) ? (e.message || e) : 'errors.internalError' } };
  }
}
`.trim();


  // Helper to insert middleware
  const insertMw = async (name: string, route: string, code: string, actionTag: string) => {
    const customHashtags = Array.isArray(hashtags) ? hashtags : [];
    const specificTags = [...new Set([...customHashtags, slug, slug + actionTag])];
    const tagsJson = JSON.stringify(specificTags);
    const existing = await sql`SELECT id FROM endpoints WHERE name = ${name} AND type = 'http'`;
    if (existing.length > 0) {
      await sql`UPDATE endpoints SET route_pattern=${route}, code=${code}, hashtags=${tagsJson}, active=true, updated_at=CURRENT_TIMESTAMP, updated_by=${user.id}, system_modified=${isSystem} WHERE name=${name} AND type='http'`;
    } else {
      await sql`INSERT INTO endpoints (name, type, route_pattern, code, hashtags, active, is_public, created_by, updated_by, system_created, system_modified) VALUES (${name}, 'http', ${route}, ${code}, ${tagsJson}, true, false, ${user.id}, ${user.id}, ${isSystem}, ${isSystem})`;
    }
    insertedMiddlewares++;
  };

  const locale = getCookie(event, 'app_locale') || 'tr';
  let entityNameStr = entity.name;
  try {
    const parsed = typeof entity.name === 'string' ? JSON.parse(entity.name) : entity.name;
    if (typeof parsed === 'object' && parsed !== null) {
      entityNameStr = parsed[locale] || Object.values(parsed)[0] || slug;
    }
  } catch(e) {
    // ignore
  }
  if (typeof entityNameStr !== 'string') entityNameStr = slug;

  // CREATE MIDDLEWARES
  if (options.apiList) await insertMw(`${entityNameStr} - GET List`, `/api/custom/${slug}`, getListCode, 'get');
  if (options.apiSingle) await insertMw(`${entityNameStr} - GET Single`, `/api/custom/${slug}/:id`, getSingleCode, 'get');
  if (options.apiCreate) await insertMw(`${entityNameStr} - POST`, `/api/custom/${slug}`, postCreateCode, 'post');
  if (options.apiUpdate) await insertMw(`${entityNameStr} - PUT`, `/api/custom/${slug}/:id`, putUpdateCode, 'put');
  if (options.apiDelete) await insertMw(`${entityNameStr} - DELETE`, `/api/custom/${slug}/:id`, deleteCode, 'delete');
  
  // Bulk operations
  if (options.apiBulk !== false) {
    await insertMw(`${entityNameStr} - Bulk Operations`, `/api/custom/${slug}/bulk`, bulkCode, 'post');
  }

  // CREATE PAGES
  
  const listPageTemplate = `
<RecordsManager slug='${slug}' api-endpoint='/api/custom/${slug}' />
`.trim();

  const listPageScript = `
return {};
`.trim();

  const insertPage = async (title: string, route: string, template: string, script: string, type: string) => {
    const customHashtags = Array.isArray(hashtags) ? hashtags : [];
    const pageTags = [...new Set([...customHashtags, slug, slug + 'page'])];
    const pageTagsJson = JSON.stringify(pageTags);
    const existing = await sql`SELECT id FROM pages WHERE route_pattern = ${route}`;
    if (existing.length > 0) {
      await sql`UPDATE pages SET title=${title}, template_string=${template}, script_content=${script}, page_type=${type}, hashtags=${pageTagsJson}, updated_at=CURRENT_TIMESTAMP, updated_by=${user.id}, system_modified=${isSystem} WHERE route_pattern=${route}`;
    } else {
      await sql`INSERT INTO pages (title, route_pattern, template_string, script_content, page_type, hashtags, active, is_public, created_by, updated_by, system_created, system_modified) VALUES (${title}, ${route}, ${template}, ${script}, ${type}, ${pageTagsJson}, true, false, ${user.id}, ${user.id}, ${isSystem}, ${isSystem})`;
    }
    insertedPages++;
  };

  if (options.pageList) {
    const pageTitle = entityNameStr;
    await insertPage(pageTitle, `/generated/${slug}`, listPageTemplate, listPageScript, 'regular');
  }

  // Cache temizleme
  await import('../../../utils/endpointManager').then(m => m.invalidateEndpointCache(event.context.tenantSlug)).catch(console.error);

  return { success: true, insertedMiddlewares, insertedPages };
});
