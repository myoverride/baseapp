import { useDB } from '../utils/db';


export default defineEventHandler(async (event) => {
  const tenantSlug = event.context.tenantSlug || 'master';
  const sql = useDB(tenantSlug);
  
  let appName = 'BaseApp';
  let appLogoSvg = '/logo.svg';

  try {
    const vars = await sql`SELECT key, value, target, is_public FROM system_variables WHERE key = 'APP_NAME'`;
    for (const v of vars) {
      const isPublic = v.is_public === 1 || v.is_public === true;
      if (v.key === 'APP_NAME' && v.value) {
        if (v.target === 'ui' || v.target === 'shared') {
          if (!isPublic && !event.context.user) {
            throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'errors.unauthorized' });
          }
          appName = v.value;
        } else {
          // Target api ise frontend'e sızdırma
          throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'errors.unauthorized' });
        }
      }
    }
  } catch (e: any) {
    if (e.statusCode === 403) throw e;
    // Ignore error if table doesn't exist
  }

  setHeader(event, 'Content-Type', 'application/json');

  return {
    "name": appName,
    "short_name": appName,
    "description": appName,
    "start_url": "/",
    "display": "standalone",
    "background_color": "#121212",
    "theme_color": "#121212",
    "icons": [
      {
        "src": appLogoSvg,
        "sizes": "192x192 512x512 any",
        "type": "image/svg+xml",
        "purpose": "any maskable"
      },
      {
        "src": appLogoSvg,
        "sizes": "192x192 216x178 512x512",
        "type": "image/svg+xml"
      }
    ]
  };
});
