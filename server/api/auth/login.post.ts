import { useDB, getMasterDb } from '../../utils/db';
import { checkRateLimit } from '../../utils/rateLimit';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

export default defineEventHandler(async (event) => {
  const ip = getRequestIP(event) || 'unknown';
  const rateLimitKey = `login_${ip}`;
  
  // 5 attempts per 5 minutes
  if (!checkRateLimit(rateLimitKey, 5, 5 * 60 * 1000)) {
    throw createError({ statusCode: 429, message: tEvent(event, 'errors.tooManyRequests') || 'Too many login attempts. Please try again later.' });
  }

  const body = await readBody(event);
  const { username, password } = body;

  if (!username || !password) {
    throw createError({ statusCode: 400, message: tEvent(event, 'errors.usernamePasswordRequired') });
  }

  let tenantSlug = event.context.tenantSlug || 'master';
  let sql = useDB(tenantSlug);
  
  // Find user
  let users = await sql`
    SELECT u.id, u.username, u.password_hash, u.is_admin, u.role_id, 
           u.home_page as user_home, r.home_page as role_home,
           u.menu_list as user_menu, r.menu_list as role_menu
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE u.username = ${username}
  `;

  if (users.length === 0 && tenantSlug === 'master') {
    // If not found in master, check global_users in master.db (system DB)
    const systemDb = getMasterDb();
    const globalUsers = await systemDb.unsafe(`SELECT tenant_slug FROM global_users WHERE username = ?`, [username]);
    if (globalUsers && globalUsers.length > 0) {
      tenantSlug = globalUsers[0].tenant_slug;
      sql = useDB(tenantSlug);
      users = await sql`
        SELECT u.id, u.username, u.password_hash, u.is_admin, u.role_id, 
               u.home_page as user_home, r.home_page as role_home,
               u.menu_list as user_menu, r.menu_list as role_menu
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE u.username = ${username}
      `;
    }
  }

  if (users.length === 0 && tenantSlug !== 'master') {
    const masterSql = useDB('master');
    const masterUsers = await masterSql`
      SELECT u.id, u.username, u.password_hash, u.is_admin, u.role_id, 
             u.home_page as user_home, r.home_page as role_home,
             u.menu_list as user_menu, r.menu_list as role_menu
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.username = ${username}
    `;
    if (masterUsers.length > 0) {
      const isSuperAdmin = masterUsers[0].is_admin === 1 || masterUsers[0].is_admin === true || masterUsers[0].is_admin === '1';
      if (isSuperAdmin) {
        users = masterUsers;
        (users[0] as any).is_super_admin = true;
        tenantSlug = 'master';
        sql = masterSql;
      }
    }
  }

  if (users.length === 0) {
    throw createError({ statusCode: 401, message: tEvent(event, 'errors.invalidCredentials') });
  }

  const user = users[0]!;
  const storedHash = user.password_hash;

  // Geriye uyumluluk: Eski SHA-256 hash (64 hex karakter) ise kontrol et ve otomatik bcrypt'e yükselt
  const isSha256 = /^[a-f0-9]{64}$/.test(storedHash);
  let passwordValid = false;

  if (isSha256) {
    const sha256Hash = crypto.createHash('sha256').update(password).digest('hex');
    passwordValid = sha256Hash === storedHash;
    if (passwordValid) {
      // Otomatik bcrypt'e yükseltme (migration)
      const bcryptHash = await bcrypt.hash(password, 10);
      const activeSql = (user as any).is_super_admin ? useDB('master') : sql;
      await activeSql`UPDATE users SET password_hash = ${bcryptHash} WHERE id = ${user.id}`;
    }
  } else {
    passwordValid = await bcrypt.compare(password, storedHash);
  }

  if (!passwordValid) {
    throw createError({ statusCode: 401, message: tEvent(event, 'errors.invalidCredentials') });
  }

  // Generate secure token
  const token = crypto.randomBytes(64).toString('hex');
  const { getSysVar } = await import('../../utils/sysvars');
  const tokenTtlStr = await getSysVar(tenantSlug, 'TOKEN_TTL_MINUTES', false, '10080'); // 7 days default in minutes
  const TOKEN_TTL_MINUTES = parseInt(tokenTtlStr, 10) || 10080;
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000).toISOString();
  const tokenTenant = (users[0] as any).is_super_admin ? '__super_admin__' : tenantSlug;

  // Save token to database with expiry and tenant binding
  const activeSql = (users[0] as any).is_super_admin ? useDB('master') : sql;
  
  await activeSql`
    UPDATE users 
    SET current_token = ${token}, token_expires_at = ${expiresAt}, token_tenant = ${tokenTenant}, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ${user.id}
  `;

  // Set HttpOnly Cookie
  // Build sonrası HTTP üzerinden test edebilmek için ALLOW_HTTP sysvar değişkenini kullanabilirsiniz
  const allowHttp = await getSysVar('master', 'ALLOW_HTTP', false, 'true');
  const isSecure = process.env.NODE_ENV === 'production' && allowHttp !== 'true';

  setCookie(event, 'auth_token', token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'strict' : 'lax',
    path: '/',
    maxAge: TOKEN_TTL_MINUTES * 60
  });

  setCookie(event, 'tenant_slug', tenantSlug, {
    httpOnly: false, // Frontend can read it if needed
    secure: isSecure,
    sameSite: isSecure ? 'strict' : 'lax',
    path: '/',
    maxAge: TOKEN_TTL_MINUTES * 60
  });

  return {
    success: true,
    user: {
      id: user.id,
      username: user.username,
      is_admin: user.is_admin,
      is_super_admin: user.is_super_admin || false,
      role_id: user.role_id,
      home_page: user.user_home || user.role_home || null,
      menu_list: user.user_menu || user.role_menu || []
    }
  };
});
