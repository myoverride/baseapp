import { useDB } from '../../utils/db';
import { compileRoutePattern, matchRoute } from '../../utils/endpointManager';
import { tEvent } from '../../utils/i18n-api';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const reqPath = (query.path as string) || '/';
  const testPath = reqPath.startsWith('/') ? reqPath : `/${reqPath}`;

  const tenantSlug = event.context.tenantSlug || 'master';
  const sql = useDB(tenantSlug);
  const user = event.context.user;

  // Fetch all active pages and layouts
  const allPages = await sql`
    SELECT id, title, page_type, route_pattern, layout_id, priority, template_string, script_content, style_content, is_public, hashtags, is_default_layout
    FROM pages 
    WHERE active = true
    ORDER BY priority ASC, is_public ASC
  `.catch(() => []);

  let matchedPage = null;
  let unauthorizedError: any = null;

  // 1. Find the page matching the requested path
  for (const p of allPages) {
    if (p.page_type === 'layout' || p.page_type === 'component') continue;
    
    const pattern = p.route_pattern || '';
    const compiled = compileRoutePattern(pattern);
    const matchRes = matchRoute(testPath, compiled.regex, compiled.paramNames);

    if (matchRes.isMatch) {
      // Check permissions for the page
      if (!p.is_public) {
        if (!user) {
          unauthorizedError = createError({ statusCode: 401, message: tEvent(event, 'errors.loginRequired') });
          continue;
        }
        if (!user.is_admin) {
          let pageTags: string[] = [];
          try { pageTags = typeof p.hashtags === 'string' ? JSON.parse(p.hashtags) : (p.hashtags || []); } catch { }
          const allowedTags = Array.isArray(user.allowed_tags) ? user.allowed_tags : [];
          const allowed = pageTags.some((tag: string) => allowedTags.includes(tag));

          if (!allowed) {
            unauthorizedError = createError({ statusCode: 403, message: tEvent(event, 'errors.unauthorized') });
            continue;
          }
        }
      }
      
      matchedPage = p;
      unauthorizedError = null;
      break;
    }
  }

  // 2. Find the layout for the matched page
  let targetLayout = null;
  const layoutPages = allPages.filter((p: any) => p.page_type === 'layout');

  if (matchedPage && matchedPage.layout_id) {
    targetLayout = layoutPages.find((l: any) => l.id === matchedPage.layout_id);
  }

  // 3. Fallback to default layout
  if (!targetLayout) {
    targetLayout = layoutPages.find((l: any) => l.is_default_layout === 1 || l.is_default_layout === true);
    
    if (!targetLayout) {
      targetLayout = layoutPages.find((l: any) => l.route_pattern === 'system/layout' || l.route_pattern === '/system/layout');
    }
  }

  // 4. Return layout or throw
  if (!targetLayout) {
    if (unauthorizedError) throw unauthorizedError;
    throw createError({ statusCode: 404, message: tEvent(event, 'error.notFound') });
  }

  return { ...targetLayout, routeParams: {} };
});
