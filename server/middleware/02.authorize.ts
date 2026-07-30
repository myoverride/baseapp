import { getActiveEndpoints, compileRoutePattern } from '../utils/endpointManager';

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


  // /api/pages/* ve /api/sys-vars endpoint'leri kendi iç yetkilendirmelerini yapar
  if (pathname.startsWith('/api/pages') || pathname === '/api/sys-vars') {
    return;
  }

  // Özel (Custom) Endpoint'ler için "public" kontrolü
  try {
    const endpoints = await getActiveEndpoints(event.context.tenantSlug);
    for (const ep of endpoints) {
      if (ep.is_public && ep.regexPattern.test(pathname)) {
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

  // Sadece yetkili (giriş yapmış) kullanıcılar dynamic utils çalıştırabilir (RCE Koruması)
  if (pathname === '/api/admin/utils' || pathname.startsWith('/api/admin/utils/')) {
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
      message: 'error.forbidden'
    });
  }
});
