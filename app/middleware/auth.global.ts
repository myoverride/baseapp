export default defineNuxtRouteMiddleware(async (to, _from) => {
  const user = useState<any>('user');

  const normalizePath = (value: string) => {
    if (!value) return '/';
    const clean = value.split('?')[0] || '/';
    if (clean.length > 1 && clean.endsWith('/')) return clean.slice(0, -1);
    return clean;
  };

  const toPatternRegex = (pattern: string) => {
    const escaped = normalizePath(pattern)
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\[\\\.\\\.\\.[^\]]+\\\]/g, '.*')
      .replace(/\\\[[^\]]+\\\]/g, '[^/]+')
      .replace(/:[a-zA-Z0-9_]+/g, '[^/]+')
      .replace(/\*/g, '.*');

    return new RegExp(`^${escaped}$`);
  };

  const pathMatchesAnyPattern = (path: string, patterns: string[]) => {
    const normalizedPath = normalizePath(path);
    return patterns.some((pattern) => {
      if (!pattern) return false;
      try {
        return toPatternRegex(pattern).test(normalizedPath);
      } catch {
        return normalizePath(pattern) === normalizedPath;
      }
    });
  };

  if (to.path === '/login') {
    if (user.value) {
      return navigateTo(user.value.home_page || '/');
    }
    return;
  }

  // Eğer kullanıcı kök dizine (/) geliyorsa ve home_page tanımlıysa yönlendir
  if (to.path === '/' && user.value && user.value.home_page && user.value.home_page !== '/') {
    return navigateTo(user.value.home_page);
  }

  if (to.path.startsWith('/admin/tenants') && user.value && !user.value.is_super_admin) {
    return navigateTo('/');
  }

  // Statik sistem sayfaları ve yönetim paneli
  const isSystemPage = to.path.startsWith('/admin');

  if (isSystemPage || to.path === '/profile') {
    // Kural 1: Eğer route tam olarak /admin/login ise public erişime izin ver.
    if (to.path === '/admin/login') {
      if (user.value) {
        return navigateTo('/admin/pages');
      }
      return; // Public access allowed for safe mode login
    }

    if (!user.value) {
      // Kural 2: Giriş yapmamış biri özel sayfalara gitmeye çalışırsa normal logine at ve geldiği adresi sakla
      return navigateTo({ path: '/login', query: { redirect: to.fullPath } });
    }
    if (isSystemPage && !user.value.is_admin) {
      return navigateTo('/');
    }
  }

  // Özel (Custom) sayfalar için yetki kontrolü [...dynamic].vue bileşeni içinde
  // API üzerinden yapılacaktır. Eğer sayfa private ise API 401 döner ve [...dynamic].vue
  // otomatik olarak login sayfasına yönlendirir.
});
