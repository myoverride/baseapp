import { getActiveEndpoints } from '../utils/endpointManager';
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
    pathname.startsWith('/api/admin/utils') ||
    pathname.startsWith('/api/sys-vars') ||
    pathname === '/api/admin/system-variables' ||
    pathname.startsWith('/api/admin/system-variables/') ||
    pathname.startsWith('/api/admin/pages') ||
    pathname.startsWith('/api/admin/users') ||
    pathname.startsWith('/api/admin/roles') ||
    pathname.startsWith('/api/admin/entities') ||
    pathname.startsWith('/api/admin/backup') ||
    pathname.startsWith('/api/sync-data')
  ) {
    return;
  }

  try {
    const endpoints = await getActiveEndpoints(event.context.tenantSlug);

    if (!endpoints || endpoints.length === 0) return;

    for (const ep of endpoints) {
      // Route pattern eşleştirme
      const match = pathname.match(ep.regexPattern);
      if (!match) continue;

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
            return { error: 'error.forbidden' };
          }
        }
      }

      let bodyData: any = undefined;
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.node.req.method || 'GET')) {
        try {
          bodyData = await readBody(event);
        } catch {
          // ignore
        }
      }

      // Özel parametreleri (params) ayıkla
      const params: Record<string, string> = {};
      if (ep.paramNames && ep.paramNames.length > 0) {
        ep.paramNames.forEach((name, index) => {
          params[name] = match[index + 1] || '';
        });
      }
      
      event.context.params = { ...event.context.params, ...params };

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
        params,
        body: bodyData,
        user: event.context.user
      };

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
            message: result.error || result.message || 'İstek middleware tarafından engellendi.' 
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
            if (bodyData && typeof bodyData === 'object' && typeof result.body === 'object') {
              // Obje referansını koruyarak (H3 cache'ini bozmadan) içeriği değiştir
              for (const key of Object.keys(bodyData)) delete bodyData[key];
              Object.assign(bodyData, result.body);
            } else {
              // Eğer primitive ise veya obje değilse H3'ün dahili requestBody önbelleğini eziyoruz
              (event as any)._requestBody = result.body;
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
          continue; // Mutate eden middlewareler isteği kesmez
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
