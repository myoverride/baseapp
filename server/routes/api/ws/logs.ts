import { defineWebSocketHandler } from 'h3';
import { logEvents } from '../../../utils/realtime';
import { useDB } from '../../../utils/db';
import { resolveTenant } from '../../../utils/tenantResolver';

function parseCookieString(cookieHeader: string) {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  const items = cookieHeader.split(';');
  for (const item of items) {
    const parts = item.split('=');
    if (parts.length >= 2) {
      const key = parts[0]?.trim();
      if (key) {
        cookies[key] = parts.slice(1).join('=').trim();
      }
    }
  }
  return cookies;
}

const activePeers = new Set<any>();
let isGlobalListenerActive = false;

export default defineWebSocketHandler({
  async upgrade(req) {
    let cookieStr = '';
    if (req.headers && typeof (req.headers as any).get === 'function') {
      cookieStr = (req.headers as any).get('cookie') || '';
    } else if (req.headers) {
      cookieStr = (req.headers as any).cookie || '';
    }

    const cookies = parseCookieString(cookieStr);
    const token = cookies['auth_token'];

    if (!token) {
      console.warn('[WS] Upgrade rejected: No auth_token');
      (req as any)._wsRejected = true;
      return;
    }

    const peerHeaders = (req as any).headers || {};
    const peerUrl = (req as any).url || '/';
    const host = peerHeaders['host'] || peerHeaders['x-forwarded-host'] || '';
    const urlObj = new URL(peerUrl, 'http://localhost');

    const resolveReq = {
      url: peerUrl,
      headers: peerHeaders,
      host,
      cookies,
      queryTenant: urlObj.searchParams.get('tenant') || undefined
    };

    const tenantSlug = await resolveTenant(resolveReq);

    // Auth check
    const sql = useDB(tenantSlug);
    let users = [];
    try {
      users = await sql`SELECT id, is_admin FROM users WHERE current_token = ${token}`;
    } catch (e) { }

    if (users.length === 0 && tenantSlug !== 'master') {
      const masterSql = useDB('master');
      try {
        const masterUsers = await masterSql`SELECT id, is_admin FROM users WHERE current_token = ${token}`;
        if (masterUsers.length > 0 && (masterUsers[0].is_admin === 1 || masterUsers[0].is_admin === true)) {
          users = masterUsers;
        }
      } catch (e) { }
    }

    if (users.length === 0 || !users[0].is_admin) {
      console.warn('[WS] Upgrade rejected: Invalid token or not admin');
      (req as any)._wsRejected = true;
      return;
    }
    
    (req as any)._resolvedTenantSlug = tenantSlug;
  },

  async open(peer) {
    if (peer && (peer as any).request && (peer as any).request._wsRejected) {
      peer.close(1008, 'Unauthorized');
      return;
    }
    activePeers.add(peer);

    let tenantSlug = 'master';
    if (peer && (peer as any).request && (peer as any).request._resolvedTenantSlug) {
      tenantSlug = (peer as any).request._resolvedTenantSlug;
    } else {
      const peerReq = (peer as any).request || {};
      const peerHeaders = peerReq.headers || (peer as any).headers || {};
      const peerUrl = peerReq.url || (peer as any).url || '/';
      const urlObj = new URL(peerUrl, 'http://localhost');
      const host = peerHeaders['host'] || peerHeaders['x-forwarded-host'] || '';
      
      let cookieStr = '';
      if (peerHeaders && typeof peerHeaders.get === 'function') {
        cookieStr = peerHeaders.get('cookie') || '';
      } else if (peerHeaders) {
        cookieStr = peerHeaders.cookie || '';
      }
      
      const cookies = parseCookieString(cookieStr);
      const reqInfo = {
        url: peerUrl,
        headers: peerHeaders,
        host,
        cookies,
        queryTenant: urlObj.searchParams.get('tenant') || undefined
      };
      
      tenantSlug = await resolveTenant(reqInfo);
    }

    (peer as any)._tenantSlug = tenantSlug;

    // URL'den dinlenecek ID'leri alalım
    const url = (peer as any).url || (peer as any).request?.url || (peer as any)._url || '';
    let targetIds: string[] = [];
    try {
      if (url.includes('?')) {
        const search = url.split('?')[1];
        const params = new URLSearchParams(search);
        const idsParam = params.get('ids') || params.get('id') || '';
        targetIds = idsParam.split(',').map(id => id.trim()).filter(Boolean);
      }
    } catch (e) {
      console.error('[WS] Query parse error:', e);
    }

    if (targetIds.length > 0) {
      if (targetIds.includes('all')) {
        (peer as any)._subscribeAll = true;
      } else {
        (peer as any)._subscriptions = new Set(targetIds);
      }
    } else {
      try { peer.send(JSON.stringify({ status: 'error', type: 'system', message: 'error.noTargetId' })); } catch { }
    }

    if (!isGlobalListenerActive) {
      isGlobalListenerActive = true;
      logEvents.on('log', (log: any) => {
        const strLog = JSON.stringify(log);
        for (const p of activePeers) {
          if ((p as any).readyState === 2 || (p as any).readyState === 3) {
            activePeers.delete(p);
            continue;
          }
          // Tenant İzolasyonu
          if (log.tenantSlug && log.tenantSlug !== (p as any)._tenantSlug) continue;

          const subs = (p as any)._subscriptions || new Set();
          if ((p as any)._subscribeAll || subs.has(log.sourceId)) {
            try {
              p.send(strLog);
            } catch (e) {
              activePeers.delete(p);
            }
          }
        }
      });
    }

    peer.send(JSON.stringify({
      level: 'info',
      sourceId: 'SYSTEM',
      args: ['Virtual Console connection successful'],
      timestamp: new Date().toISOString()
    }));
  },

  close(peer) {
    activePeers.delete(peer);
  },

  error(peer, error) {
    activePeers.delete(peer);
    console.error('[WS] Hata:', error);
  }
});
