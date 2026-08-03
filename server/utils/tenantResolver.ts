import { getMasterDb } from './db';
import { LRUCache } from 'lru-cache';
import type { H3Event } from 'h3';

const tenantValidationCache = new LRUCache<string, boolean>({ max: 1000, ttl: 60 * 1000 });
const customDomainCache = new LRUCache<string, any>({ max: 1000, ttl: 60 * 1000 });

export function invalidateTenantCache(slug: string) {
  tenantValidationCache.delete(slug);
  customDomainCache.clear();
}

export async function resolveTenant(req: {
  url: string;
  headers: Record<string, string>;
  host: string;
  cookies: Record<string, string>;
  queryTenant?: string;
}): Promise<string> {
  let tenantSlug: string | null = null;
  let isResolvedFromCookie = false;
  const reqUrl = req.url || '/';

  // 1. Path tabanlı çözümleme (En yüksek öncelik)
  if (reqUrl.startsWith('/tenant/')) {
    const match = reqUrl.match(/^\/tenant\/([^\/?]+)/);
    if (match) tenantSlug = match[1] || null;
  } 
  else if (reqUrl.startsWith('/api/ws/tenant/')) {
    const match = reqUrl.match(/^\/api\/ws\/tenant\/([^\/?]+)/);
    if (match) tenantSlug = match[1] || null;
  } 
  else if (reqUrl.startsWith('/api/tenant/')) {
    const match = reqUrl.match(/^\/api\/tenant\/([^\/?]+)/);
    if (match) tenantSlug = match[1] || null;
  }

  // 2. Header & Query tabanlı çözümleme
  if (!tenantSlug) {
    tenantSlug = req.headers['x-tenant-slug'] || req.queryTenant || null;
  }

  // 3. Referer tabanlı çözümleme
  if (!tenantSlug) {
    const referer = req.headers['referer'];
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        const match = refererUrl.pathname.match(/^\/tenant\/([^\/?]+)/);
        if (match) tenantSlug = match[1] || null;
      } catch (e) {
        // ignore
      }
    }
  }

  const hostWithoutPort = (req.host.split(':')[0] || '').toLowerCase();
  const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostWithoutPort);
  const isLocalhost = hostWithoutPort === 'localhost' || hostWithoutPort === '127.0.0.1';

  // 4. Custom Domain tabanlı çözümleme
  if (!tenantSlug && !isIp && !isLocalhost) {
    let matchedSlug = customDomainCache.get(hostWithoutPort);
    if (matchedSlug === undefined) {
      try {
        const masterSql = getMasterDb();
        const res = await masterSql.unsafe(`SELECT slug FROM tenants WHERE custom_domain = ? AND status = 'active'`, [hostWithoutPort]);
        if (res && res.length > 0) {
          matchedSlug = res[0].slug;
        } else {
          matchedSlug = null;
        }
        customDomainCache.set(hostWithoutPort, matchedSlug);
      } catch (e) {
        matchedSlug = null;
      }
    }
    
    if (matchedSlug) {
      tenantSlug = matchedSlug;
    }
  }

  // 5. Subdomain tabanlı çözümleme
  // Tunnel servisleri için subdomain kontrolünü atla (ngrok, cloudflare, localtunnel vb.)
  const isTunnel = hostWithoutPort.endsWith('.trycloudflare.com') || 
                   hostWithoutPort.endsWith('.ngrok-free.app') || 
                   hostWithoutPort.endsWith('.loca.lt');
                   
  if (!tenantSlug && !isIp && !isLocalhost && !isTunnel) {
    const hostParts = hostWithoutPort.split('.');
    
    // TLD heuristic for .com.tr, .co.uk etc.
    let isTwoPartTld = false;
    if (hostParts.length >= 3) {
      const secondToLast = hostParts[hostParts.length - 2];
      if (secondToLast && ['com', 'co', 'org', 'net', 'gov', 'edu', 'gen', 'av', 'bel', 'dr', 'k12', 'pol'].includes(secondToLast)) {
        isTwoPartTld = true;
      }
    }

    const minPartsForSubdomain = isTwoPartTld ? 3 : 2;

    if (hostParts.length > minPartsForSubdomain) {
      const subdomain = hostParts[0];
      if (subdomain !== 'www' && subdomain !== 'app' && subdomain !== 'api') {
        tenantSlug = subdomain || null;
      }
    }
  }

  // 6. Sticky Cookie Fallback (Only for UI interactions that lack headers/URL info)
  // We explicitly ignore the cookie for login routes to prevent "ghost cookie" mismatches
  // where a leftover cookie redirects a master login attempt to a tenant database.
  if (!tenantSlug) {
    if (!reqUrl.startsWith('/api/auth/login') && !reqUrl.startsWith('/api/pages/system/login')) {
      const cookieSlug = req.cookies['tenant_slug'];
      if (cookieSlug && cookieSlug !== 'master') {
        tenantSlug = cookieSlug;
        isResolvedFromCookie = true;
      }
    }
  }

  // 7. Validation and Fallback
  if (tenantSlug && tenantSlug !== 'master') {
    let isValid = tenantValidationCache.get(tenantSlug);
    
    if (isValid === undefined) {
      try {
        const masterSql = getMasterDb();
        const res = await masterSql.unsafe(`SELECT id FROM tenants WHERE slug = ? AND status = 'active'`, [tenantSlug]);
        isValid = res && res.length > 0;
        tenantValidationCache.set(tenantSlug, isValid);
      } catch (e) {
        isValid = false;
      }
    }

    if (!isValid) {
      if (isResolvedFromCookie) {
        return 'master';
      }
      throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'errors.tenantNotFound' });
    }
  }

  // Eğer hiçbir yöntemle tenant bulunamadıysa (bare root vs) master olarak kabul et
  return tenantSlug || 'master';
}
