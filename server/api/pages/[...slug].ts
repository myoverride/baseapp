import { useDB } from '../../utils/db';
import { compileRoutePattern, matchRoute } from '../../utils/endpointManager';
import { tEvent } from '../../utils/i18n-api';

/**
 * Özel sayfaların layout_schema verisini slug ile çeken API.
 * Kullanım: GET /api/pages/my-dashboard
 */
export default defineEventHandler(async (event) => {
  const tenantSlug = event.context.tenantSlug || 'master';
  const sql = useDB(tenantSlug);
  const slug = (event.context.params as any)?.slug || '';

  let slugStr = Array.isArray(slug) ? slug.join('/') : slug;
  if (slugStr === 'index') {
    slugStr = '';
  }
  // Ensure we are comparing normalized paths
  const testPath = slugStr.startsWith('/') ? slugStr : `/${slugStr}`;

  const pagesRes = await sql`
    SELECT id, title, route_pattern, priority, template_string, script_content, style_content, is_public, hashtags
    FROM pages 
    WHERE active = true
    ORDER BY priority ASC, is_public ASC
  `;

  let matchedPage = null;
  let routeParams = {};
  const user = event.context.user;
  let unauthorizedError: any = null;

  for (const p of pagesRes) {
    const pattern = p.route_pattern || '';

    // Compile and match
    const compiled = compileRoutePattern(pattern);
    const matchRes = matchRoute(testPath, compiled.regex, compiled.paramNames);

    if (matchRes.isMatch) {
      if (!p.is_public) {
        if (!user) {
          unauthorizedError = createError({ statusCode: 401, message: 'errors.loginRequired' });
          continue;
        }
        if (!user.is_admin) {
          let pageTags: string[] = [];
          try { pageTags = typeof p.hashtags === 'string' ? JSON.parse(p.hashtags) : (p.hashtags || []); } catch { }
          const allowedTags = Array.isArray(user.allowed_tags) ? user.allowed_tags : [];
          const allowed = pageTags.some((tag: string) => allowedTags.includes(tag));

          if (!allowed) {
            unauthorizedError = createError({ statusCode: 403, message: 'errors.unauthorized' });
            continue;
          }
        }
      }
      
      matchedPage = p;
      routeParams = matchRes.params;
      unauthorizedError = null;
      break;
    }
  }

  if (!matchedPage) {
    if (unauthorizedError) throw unauthorizedError;
    throw createError({ statusCode: 404, message: tEvent(event, 'error.notFound') });
  }

  return { ...matchedPage, routeParams };
});
