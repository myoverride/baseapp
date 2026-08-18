// Custom authorization logic
const normalizePath = (value: string) => {
  if (!value) return '/';
  const clean = value.split('?')[0] || '/';
  if (clean.length > 1 && clean.endsWith('/')) return clean.slice(0, -1);
  return clean;
};



const pathMatchesAnyPattern = (path: string, patterns: string[]) => {
  const normalizedPath = normalizePath(path);
  return patterns.some((pattern) => {
    if (!pattern) return false;
    try {
      return compileRoutePattern(pattern).regex.test(normalizedPath);
    } catch {
      return normalizePath(pattern) === normalizedPath;
    }
  });
};

export default defineEventHandler(async (event) => {
  const reqUrl = event.node.req.url || '/';
  const qIndex = reqUrl.indexOf('?');
  let pathname = qIndex === -1 ? reqUrl : reqUrl.substring(0, qIndex);

  // Trailing slash temizleme (örn: /api/admin/devices/ -> /api/admin/devices)
  pathname = normalizePath(pathname);

  // Sadece /api/ ile başlayan API yollarını denetle
  if (!pathname.startsWith('/api/')) {
    return;
  }

  const publicRoutes = [
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/me',
    '/api/landing-page',
    '/api/i18n/locales',
    '/api/i18n/messages',
    '/api/sync-data'
  ];

  if (publicRoutes.includes(pathname)) {
    return;
  }


  // /api/pages/* ve /api/globals endpoint'leri kendi iç yetkilendirmelerini yapar
  if (pathname.startsWith('/api/pages') || pathname === '/api/globals') {
    return;
  }

  // Özel (Custom) Endpoint'ler için "public" kontrolü
  try {
    const { getActiveEndpointsRouter } = await import('../utils/endpointManager');
    const router = await getActiveEndpointsRouter(event.context.tenantSlug, 'http');
    if (router) {
      const match = router.lookup(pathname);
      if (match && match.payload && match.payload.is_public) {
        return; // Herkese açık özel API
      }
    }
  } catch (e) {
    console.error("02.authorize.ts endpointManager hatası:", e);
  }

  // 1. Kimlik Doğrulama: Giriş yapılmış olmalı (01.auth.ts tarafından event.context.user doldurulur)
  const user = event.context.user;
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'error.unauthorized'
    });
  }

  // Sadece yetkili (giriş yapmış) kullanıcılar dynamic globals (utils/variables) çalıştırabilir/okuyabilir
  if (pathname === '/api/admin/globals' || pathname.startsWith('/api/admin/globals/')) {
    return;
  }

  const adminPrefixes = [
    '/api/admin',
    '/api/system'
  ];

  const isAdminRoute = adminPrefixes.some((prefix: any) => 
    pathname === prefix || pathname.startsWith(prefix + '/')
  );

  if (isAdminRoute && !user.is_admin) {


    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'errors.forbidden'
    });
  }
});
