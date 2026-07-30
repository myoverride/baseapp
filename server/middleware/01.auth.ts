import { useDB } from '../utils/db';

const toArraySafe = (raw: any): string[] => {
  if (Array.isArray(raw)) return raw.map((v) => String(v));
  if (raw == null) return [];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v));
    } catch {
      return trimmed
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    }
  }
  return [];
};

export default defineEventHandler(async (event) => {
  const reqUrl = event.node.req.url || '/';
  
  // Skip statics (if it contains a dot but is not an API route)
  if (reqUrl.startsWith('/_nuxt') || reqUrl.startsWith('/__nuxt') || 
     (reqUrl.includes('.') && !reqUrl.startsWith('/api/') && !reqUrl.startsWith('/logo.svg') && !reqUrl.startsWith('/manifest.json'))) {
    return;
  }

  const token = getCookie(event, 'auth_token');
  
  if (!token) {
    event.context.user = null;
    if (reqUrl.startsWith('/api/admin')) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'errors.loginRequired' });
    }
    return;
  }

  const isExplicitRequest = !!event.context.tenantSlug;
  let dbToSearch = event.context.tenantSlug || 'master';

  let sql;
  try {
    sql = useDB(dbToSearch);
  } catch (e) {
    dbToSearch = 'master';
    sql = useDB(dbToSearch);
  }

  // Fetch user and role
  let users = await sql`
    SELECT u.id, u.username, u.is_admin, u.role_id, u.home_page as user_home, u.menu_list as user_menu,
           u.token_expires_at, u.token_tenant,
           r.allowed_tags, r.home_page as role_home, r.menu_list as role_menu
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE u.current_token = ${token}
  `.catch(() => []);

  if (users.length === 0 && dbToSearch !== 'master') {
    // Check if it's a super admin in master.db
    const masterSql = useDB('master');
    const masterUsers = await masterSql`
      SELECT u.id, u.username, u.is_admin, u.role_id, u.home_page as user_home, u.menu_list as user_menu,
             u.token_expires_at, u.token_tenant,
             r.allowed_tags, r.home_page as role_home, r.menu_list as role_menu
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.current_token = ${token}
    `.catch((e: any) => {
      console.error('masterSql error:', e);
      return [];
    });
    
    if (masterUsers.length > 0) {
      const isSuperAdmin = masterUsers[0].is_admin === 1 || masterUsers[0].is_admin === true || masterUsers[0].is_admin === '1';
      if (isSuperAdmin) {
        users = masterUsers;
        sql = masterSql; // Use masterSql for linked_records fetch below
        (users[0] as any).is_super_admin = true;
      }
    }
  }

  if (users.length === 0) {
    // Invalid or expired token (cross-tenant mismatch results in this as well, since token is not found in requested tenant DB)
    deleteCookie(event, 'auth_token', { path: '/' });
    event.context.user = null;
    // Güvenlik: Eğer token gönderilmiş ama geçersizse (veya başka kiracıya aitse),
    // public endpoint bile olsa 401 dön. Sadece HİÇ token gönderilmeyenler public'e girebilir.
    if (reqUrl.startsWith('/api/admin') || reqUrl.startsWith('/api/custom') || reqUrl.startsWith('/api/ws')) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'errors.sessionInvalid' });
    }
    return;
  }

  const u = users[0]!;

  // Eğer kullanıcı master veritabanındaysa ve adminse, o bir super_admin'dir
  if (dbToSearch === 'master' || (u as any).is_super_admin) {
     const isAdmin = u.is_admin === 1 || u.is_admin === true || u.is_admin === '1';
     if (isAdmin) {
       (u as any).is_super_admin = true;
     }
  }

  // Token TTL kontrolü: Süresi dolmuş token'ları reddet
  if (u.token_expires_at) {
    const expiresAt = new Date(u.token_expires_at).getTime();
    if (Date.now() > expiresAt) {
      // Token'ı veritabanından da temizle
      try {
        await sql`UPDATE users SET current_token = NULL, token_expires_at = NULL WHERE id = ${u.id}`;
      } catch {}
      deleteCookie(event, 'auth_token', { path: '/' });
      event.context.user = null;
      if (reqUrl.startsWith('/api/admin') || reqUrl.startsWith('/api/custom') || reqUrl.startsWith('/api/ws')) {
        throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'errors.sessionExpired' });
      }
      return;
    }
  }

  // KURAL 1 & 2: Tenant Mismatch ve Kapalı İstem Fallback
  if (u.token_tenant && u.token_tenant !== '__super_admin__') {
    if (!isExplicitRequest) {
      // KURAL 1 (Kapalı İstem Fallback): Açık istem yoksa, sistemi token'ın sahibine göre başlat
      event.context.tenantSlug = u.token_tenant;
    } else {
      // KURAL 2 (Mismatch & Güvenlik): Açık istem varsa ve token_tenant ile eşleşmiyorsa engelle
      if (u.token_tenant !== event.context.tenantSlug && !(u as any).is_super_admin) {
        event.context.user = null;
        throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'errors.sessionMismatch' });
      }
    }
  } else if (!isExplicitRequest && (u as any).is_super_admin) {
    // Super admin için fallback
    event.context.tenantSlug = dbToSearch === 'master' ? null : dbToSearch;
  }
  
  event.context.user = {
    id: u.id,
    username: u.username,
    is_admin: u.is_admin,
    is_super_admin: (u as any).is_super_admin === true,
    role_id: u.role_id,
    allowed_tags: toArraySafe(u.allowed_tags),
    home_page: u.user_home || u.role_home || null,
    menu_list: u.user_menu || u.role_menu || [],
    linked_records: []
  };

  // Global Auth Guard for Roles
  if (reqUrl.startsWith('/api/admin') && !event.context.user.is_admin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'errors.adminRequired' });
  }
  if (reqUrl.startsWith('/api/admin/tenants') && !event.context.user.is_super_admin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'errors.superAdminRequired' });
  }
});
