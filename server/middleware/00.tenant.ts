import { resolveTenant, invalidateTenantCache } from '../utils/tenantResolver';

export { invalidateTenantCache };

export default defineEventHandler(async (event) => {
  const reqUrl = event.node.req.url || '/';
  
  // Skip statics (ONLY Nuxt internals, do not skip dots to prevent asset DoS)
  if (reqUrl.startsWith('/_nuxt') || reqUrl.startsWith('/__nuxt')) {
    return;
  }

  const req = {
    url: event.node.req.url || '/',
    headers: event.node.req.headers as Record<string, string>,
    host: getRequestHost(event) || '',
    cookies: parseCookies(event),
    queryTenant: getQuery(event).tenant?.toString()
  };

  const tenantSlug = await resolveTenant(req);
  event.context.tenantSlug = tenantSlug;
});
