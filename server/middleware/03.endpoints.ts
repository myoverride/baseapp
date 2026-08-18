import { getActiveEndpointsRouter } from '../utils/endpointManager';
import { runCustomCode } from '../utils/sandbox';

/**
 * Özel Middleware Katmanı
 * 
 * Her gelen HTTP isteğini yakalar ve endpoints tablosundaki
 * aktif route_pattern kuralları ile eşleştirir. Eşleşen middleware'lerin
 * kodunu sandbox'ta çalıştırır.
 * 
 * Middleware kodu { block: true, status: 403, message: '...' } gibi bir sonuç
 * döndürürse istek orada kesilir.
 */
export default defineEventHandler(async (event) => {
  // Yüksek performanslı path ayıklama (getRequestURL(event) yavaş olduğu için kaldırıldı)
  const reqUrl = event.node.req.url || '/';
  const qIndex = reqUrl.indexOf('?');
  const pathname = qIndex === -1 ? reqUrl : reqUrl.substring(0, qIndex);

  // Statik dosyaları ve Nuxt dahili yolları atla
  if (
    pathname.startsWith('/_nuxt') ||
    pathname.startsWith('/__nuxt') ||
    pathname.includes('.') // .js, .css, .png vb.
  ) {
    return;
  }

  // Core yolları bypass et (Kendini kilitleme koruması)
  if (
    pathname.startsWith('/api/auth') || 
    pathname.startsWith('/api/admin/endpoints') ||
    pathname.startsWith('/api/admin/workers') ||
    pathname.startsWith('/api/admin/globals') ||
    pathname.startsWith('/api/admin/pages') ||
    pathname.startsWith('/api/admin/users') ||
    pathname.startsWith('/api/admin/roles') ||
    pathname.startsWith('/api/admin/entities') ||
    pathname.startsWith('/api/sync-data')
  ) {
    return;
  }

  try {
    const router = await getActiveEndpointsRouter(event.context.tenantSlug, 'http');

    if (!router) return;

    // Radix3 O(1) Lookup
    const match = router.lookup(pathname);
    if (!match || !match.payload) return;

    const endpoints = Array.isArray(match.payload) ? match.payload : [match.payload];
    const params = match; // Radix3 merges params into the returned object, but since we wrapped payload, the params are siblings of 'payload'
    
    let bodyData: any = undefined;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.node.req.method || 'GET')) {
      try {
        bodyData = await readBody(event);
      } catch {
        // ignore
      }
    }

    // Parametreleri temizle (Radix3 payload propertysini dahil etme)
    const cleanParams: Record<string, string> = {};
    for (const key of Object.keys(params)) {
      if (key !== 'payload') cleanParams[key] = params[key];
    }
    
    event.context.params = { ...event.context.params, ...cleanParams };

    // Sandbox'a gönderilecek payload (Lazy getters sayesinde gereksiz işlem ve bellek tüketimi önlenir)
    const sandboxPayload = {
      url: pathname,
      method: event.node.req.method,
      get headers() {
        return getRequestHeaders(event);
      },
      get query() {
        return getQuery(event);
      },
      params: cleanParams,
      body: bodyData,
      user: event.context.user
    };

    for (const ep of endpoints) {
      // Authorization Check
      if (!ep.is_public) {
        const user = event.context.user;
        if (!user) {
          console.error(`[Endpoints Middleware] Unauthorized access to ${ep.route_pattern}. ep.is_public is:`, ep.is_public, typeof ep.is_public);
          setResponseStatus(event, 401);
          return { error: 'error.unauthorized' };
        }
        if (!user.is_admin) {
          let mwTags: string[] = [];
          try { mwTags = typeof ep.hashtags === 'string' ? JSON.parse(ep.hashtags) : (ep.hashtags || []); } catch {}
          const allowedTags = Array.isArray(user.allowed_tags) ? user.allowed_tags : [];
          const allowed = mwTags.some((tag: string) => allowedTags.includes(tag));
          
          if (!allowed) {
            setResponseStatus(event, 403);
            return { error: 'errors.forbidden' };
          }
        }
      }

      const result = await runCustomCode(
        event.context.tenantSlug, 
        ep.code as string, 
        sandboxPayload, 
        ep.id.toString(), 
        { tenantSlug: event.context.tenantSlug, userId: event.context.user?.id }
      );

      // Middleware isteği engellemek istiyorsa
      if (result && typeof result === 'object') {
        if (result.block === true || result.blocked === true) {
          setResponseStatus(event, result.status || 403);
          return { 
            blocked: true, 
            endpoint: ep.name, 
            message: result.error || result.message || 'error.blockedByMiddleware' 
          };
        }
        
        // Middleware doğrudan veri dönüp endpoint gibi davranmak istiyorsa
        if (result.respond === true) {
          if (result.status) setResponseStatus(event, result.status);
          if (result.headers) {
            for (const [key, value] of Object.entries(result.headers)) {
              setHeader(event, key, value as string);
            }
          }
          return result.body !== undefined ? result.body : result;
        }

        // Middleware gelen isteği modifiye edip (mutate) devam etmesini istiyorsa
        if (result.mutate === true) {
          if (result.body !== undefined) {
            if (sandboxPayload.body && typeof sandboxPayload.body === 'object' && typeof result.body === 'object') {
              // Obje referansını koruyarak (H3 cache'ini bozmadan) içeriği değiştir
              for (const key of Object.keys(sandboxPayload.body)) delete sandboxPayload.body[key];
              Object.assign(sandboxPayload.body, result.body);
            } else {
              // Eğer primitive ise veya obje değilse H3'ün dahili requestBody önbelleğini eziyoruz
              (event as any)._requestBody = result.body;
              sandboxPayload.body = result.body;
            }
          }
          if (result.headers) {
            // Gelen request headerlarını modifiye et
            for (const [key, value] of Object.entries(result.headers)) {
              event.node.req.headers[key.toLowerCase()] = value as string;
            }
          }
          if (result.context) {
            // Sonraki endpointlerin veya middleware'lerin kullanabilmesi için event.context'e özel veri ekle
            Object.assign(event.context, result.context);
          }
          continue; // Mutate eden middlewareler isteği kesmez, sonraki endpointleri kontrol etmeye devam eder
        }
      }

      // Eğer sonuç ne block, ne respond, ne mutate ise; bu bir endpoint'tir ve sonucu doğrudan dön
      // Not: Eşleşen bir endpoint veri döndüyse (undefined değilse), routing'i burada kesip cevabı dönüyoruz.
      if (result !== undefined) {
        return result;
      }
    }

  } catch (err: any) {
    console.error(`[Özel Middleware Hatası] ${err.message}`);
    // Middleware hatası ana isteği engellemez, sadece loglanır
  }
});
// force restart
