import { useDB } from '../utils/db';

export default defineEventHandler(async (event) => {
  const tenantSlug = event.context.tenantSlug || 'master';
  const sql = useDB(tenantSlug);
  
  let appLogoCode = '';

  try {
    const vars = await sql`SELECT value, target, is_public FROM globals WHERE type = 'variable' AND key = 'APP_LOGO'`;
    if (vars.length > 0) {
      const v = vars[0];
      const isPublic = v.is_public === 1 || v.is_public === true;
      
      // Sadece 'ui' veya 'shared' ise gösterilebilir
      if (v.target === 'ui' || v.target === 'shared') {
        // Eğer public değilse ve login değilse gösterme (HATA DÖNDÜR)
        if (!isPublic && !event.context.user) {
          throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'errors.unauthorized' });
        }
        appLogoCode = v.value;
      } else {
        // Target api ise DİREKT HATA DÖNDÜR (çünkü frontend'e hiçbir şekilde gitmemeli)
        throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'errors.unauthorized' });
      }
    }
  } catch (e: any) {
    if (e.statusCode === 403) throw e;
    // Ignore error if table doesn't exist
  }

  const defaultSvg = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<!-- Creator: CorelDRAW X7 -->
<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" width="100%" height="100%" version="1.1" style="shape-rendering:geometricPrecision; text-rendering:geometricPrecision; image-rendering:optimizeQuality; fill-rule:evenodd; clip-rule:evenodd"
viewBox="2730 7938 15540 13824"
 xmlns:xlink="http://www.w3.org/1999/xlink">
 <defs>
  <style type="text/css">
   <![CDATA[
    .fil0 {fill:#03396C}
    .fil1 {fill:#6497B1}
   ]]>
  </style>
 </defs>
 <g id="Layer_x0020_1">
  <metadata id="CorelCorpID_0Corel-Layer"/>
  <g id="_2671332334448">
   <polygon class="fil0" points="5013,10810 11456,8438 17147,10696 15008,11483 15602,11719 17741,10932 15602,11719 11456,10074 7152,11658 5013,10810 5771,10531 7880,11390 7152,11658 "/>
   <polygon class="fil0" points="5042,17132 5042,18768 11327,21262 17770,18890 17770,17254 11327,19626 "/>
   <polygon class="fil1" points="3230,13815 3230,15451 9516,17945 15958,15573 15958,13937 9516,16309 "/>
   <polygon class="fil0" points="5013,10810 5013,12446 11299,14939 17741,12568 17741,10932 11299,13303 "/>
   <polygon class="fil0" points="17214,17034 15075,17821 13229,17089 15368,16302 "/>
   <polygon class="fil1" points="3859,13584 5998,14433 7534,13867 5395,13019 "/>
  </g>
 </g>
</svg>`;

  setHeader(event, 'Content-Type', 'image/svg+xml');
  setHeader(event, 'Cache-Control', 'public, max-age=3600');

  return appLogoCode || defaultSvg;
});
