import { useDB } from '../utils/db'; // Trigger HMR
import { getGlobalVersion } from '../utils/versionManager';
import {} from '../utils/globalsManager';

export default defineEventHandler(async (event) => {
  const tenantSlug = event.context.tenantSlug || 'master';
  const sql = useDB(tenantSlug);
  const version = getGlobalVersion(tenantSlug);

  const clientVersion = getQuery(event).version;
  
  if (clientVersion && parseInt(clientVersion as string) === version) {
    return { upToDate: true, version };
  }
  const globalsData = await globals.getAll(tenantSlug, false);
  const allUtils = await globals.getAllUtils(tenantSlug);
  const uiUtils = allUtils
    .filter(u => u.target === 'ui' || u.target === 'shared')
    .map(u => ({ key: u.key, code: u.code, target: u.target }));

  // Fetch locales
  const locales = await sql`
    SELECT 
      code, 
      name, 
      is_default, 
      dir, 
      COALESCE((SELECT json_group_object(key, value) FROM translations WHERE language_code = languages.code), '{}') as translation_json 
    FROM languages 
    WHERE is_active = 1
  `;
  
  // Fetch pages
  const user = event.context.user;
  const pagesRes = await sql`
    SELECT id, title, route_pattern, priority, template_string, script_content, style_content, is_public, hashtags
    FROM pages 
    WHERE active = true
    ORDER BY priority ASC, is_public ASC
  `;

  const allowedPages = [];
  const allowedTags = user && Array.isArray(user.allowed_tags) ? user.allowed_tags : [];

  for (const p of pagesRes) {
    if (p.is_public) {
      allowedPages.push(p);
    } else if (user) {
      if (user.is_admin) {
        allowedPages.push(p);
      } else {
        let pageTags: string[] = [];
        try { pageTags = typeof p.hashtags === 'string' ? JSON.parse(p.hashtags) : (p.hashtags || []); } catch {}
        const allowed = pageTags.some((tag: string) => allowedTags.includes(tag));
        if (allowed) {
          allowedPages.push(p);
        }
      }
    }
  }

  return {
    upToDate: false,
    version,
    data: {
      globals: globalsData,
      uiUtils,
      locales,
      pages: allowedPages
    }
  };
});
