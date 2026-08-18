import { useDB } from '../../utils/db';
import { wsConnections, wsClients, wsChannelMap } from '../../utils/wsManager';
import { compileRoutePattern, matchRoute } from '../../utils/endpointManager';
import fs from 'node:fs';
import path from 'node:path';

import { resolveTenant } from '../../utils/tenantResolver';

// Console logger for WS events
const wsLog = (...args: any[]) => {
  if (process.env.DEBUG_WS === 'true') {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    console.log('[WS]', msg);
  }
};

// 3. WS Heartbeat Interval (Architectural Shield)
if (!(globalThis as any).__wsHeartbeatSet) {
  (globalThis as any).__wsHeartbeatSet = true;
  const scheduleHeartbeat = async () => {
    try {
      const { globals } = await import('../../utils/globalsManager');
      const val = await globals.get('master', 'WS_HEARTBEAT_INTERVAL', false, '30000');
      let intervalMs = parseInt(val, 10);
      if (isNaN(intervalMs) || intervalMs < 5000) intervalMs = 30000;
      
      for (const [id, info] of wsConnections.entries()) {
        if (info.isAlive === false) { // Strict false check to avoid killing too early before first ping
          wsLog('HEARTBEAT peer dead:', id);
          const infoPath = (info.endpointPath || '').replace(/^\/?api\/ws/, '').replace(/^\/?ws/, '');
          const normalizedPath = infoPath.replace(/^\/+|\/+$/g, '') || 'root';
          const channelKey = `${info.tenantSlug}:${normalizedPath}`;
          if (wsChannelMap.has(channelKey)) {
              wsChannelMap.get(channelKey)!.delete(info);
          }
          wsConnections.delete(id);
          try { info.peer.close(1000, 'Ping Timeout'); } catch {}
        } else {
          info.isAlive = false;
          info.send('__PING__');
        }
      }
      setTimeout(scheduleHeartbeat, intervalMs).unref();
    } catch (e) {
      console.error('Heartbeat scheduler error:', e);
      setTimeout(scheduleHeartbeat, 30000).unref();
    }
  };
  scheduleHeartbeat();
}

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

export default defineWebSocketHandler({
  upgrade(req) {
    let cookieStr = '';
    if (req.headers && typeof (req.headers as any).get === 'function') {
      cookieStr = (req.headers as any).get('cookie') || '';
    } else if (req.headers) {
      cookieStr = (req.headers as any).cookie || '';
    }
    
    (req as any)._wsCookies = cookieStr;
  },
  async open(peer) {
    try {
      const peerReq = (peer as any).ctx?.node?.req || (peer as any).request || (peer as any).req || {};
      const reqCookies = (peer as any)._wsCookies || peerReq._wsCookies || '';
      const peerHeaders = peerReq.headers || (peer as any).headers || {};
      
      if (reqCookies && !peerHeaders.cookie) peerHeaders.cookie = reqCookies;
      
      const peerUrl = peerReq.url || (peer as any).url || '/';
      
      const urlObj = new URL(peerUrl, 'http://localhost');
      let fullPath = urlObj.pathname;

      if (fullPath.startsWith('/_nitro/ws')) {
        fullPath = fullPath.replace('/_nitro/ws', '');
      }

      let cookieStr = '';
      if (peerReq.headers && typeof peerReq.headers.get === 'function') {
        cookieStr = peerReq.headers.get('cookie') || '';
      } else if (peerReq.headers) {
        cookieStr = peerReq.headers.cookie || '';
      } else if (peerHeaders && typeof (peerHeaders as any).get === 'function') {
        cookieStr = (peerHeaders as any).get('cookie') || '';
      } else if (peerHeaders) {
        cookieStr = peerHeaders['cookie'] || '';
      }

      const host = peerHeaders['host'] || peerHeaders['x-forwarded-host'] || '';
      const cookies = parseCookieString(cookieStr);
      
      let endpointPath = fullPath;
      let syncTenantSlug = 'master';
      
      const tenantMatch = fullPath.match(/^\/(?:api\/ws\/)?tenant\/([^\/]+)(.*)$/);
      if (tenantMatch) {
        syncTenantSlug = tenantMatch[1] || 'master';
        let ep = tenantMatch[2] || '/';
        if (!ep.startsWith('/')) ep = '/' + ep;
        endpointPath = '/api/ws' + ep;
      } else {
         syncTenantSlug = peerHeaders['x-tenant-slug'] || (urlObj.searchParams.get('tenant')) || cookies['tenant_slug'] || 'master';
      }

      if (!endpointPath.startsWith('/')) {
        endpointPath = '/' + endpointPath;
      }
      
      const reqForTenant = {
        url: fullPath,
        headers: peerHeaders,
        host,
        cookies,
        queryTenant: urlObj.searchParams.get('tenant') || undefined
      };

      let tenantSlug;
      try {
        tenantSlug = await resolveTenant(reqForTenant as any);
        
        // Register AFTER resolveTenant so crossws open hook is closer to completion
        const peerInfo = {
          tenantSlug,
          endpointPath,
          peer,
          isAlive: true,
          send: (msg: string) => {
            try { 
              peer.send(msg); 
            } catch (e: any) { wsLog('send error:', e?.message); }
          }
        };
        wsConnections.set(peer.id, peerInfo);
        
        const infoPath = (endpointPath || '').replace(/^\/?api\/ws/, '').replace(/^\/?ws/, '');
        const normalizedPath = infoPath.replace(/^\/+|\/+$/g, '') || 'root';
        const channelKey = `${tenantSlug}:${normalizedPath}`;
        if (!wsChannelMap.has(channelKey)) {
          wsChannelMap.set(channelKey, new Set());
        }
        wsChannelMap.get(channelKey)!.add(peerInfo);
      } catch (err: any) {
        wsConnections.delete(peer.id);
        try { peer.close(1011, 'Tenant Error'); } catch { }
        return;
      }

      wsLog('OPEN peer.id=', peer.id, 'tenantSlug=', tenantSlug, 'endpointPath=', endpointPath);
      wsLog('OPEN registered, wsConnections.size=', wsConnections.size);

      const sql = useDB(tenantSlug);

      const { getActiveEndpointsRouter } = await import('../../utils/endpointManager');
      const router = await getActiveEndpointsRouter(tenantSlug, 'ws');

      let matchedEps: any[] = [];
      let routeParams: Record<string, any> = {};

      function normalizeWsPath(p: string) {
        let res = p.replace(/^\/?api\/ws/, '').replace(/^\/?ws/, '');
        if (!res.startsWith('/')) res = '/' + res;
        return res;
      }

      if (router) {
        const match = router.lookup(normalizeWsPath(endpointPath));
        if (match && match.payload) {
          matchedEps.push(match.payload);
          // Extract params (excluding 'payload' key)
          for (const key of Object.keys(match)) {
             if (key !== 'payload') routeParams[key] = (match as any)[key];
          }
        }
      }

      if (matchedEps.length === 0) {
        wsLog('OPEN no matching endpoint found, closing with 4004');
        wsConnections.delete(peer.id);
        try { peer.close(4004, 'Endpoint Not Found'); } catch { }
        return;
      }

      wsLog('OPEN matched eps ids=', matchedEps.map(e => e.id));

      (peer as any).__tenantSlug = tenantSlug;
      (peer as any).__endpointPath = endpointPath;
      (peer as any).__routeParams = routeParams;
      (peer as any).__wsEps = matchedEps;

      const isPublic = matchedEps.every(ep => ep.is_public);
      if (isPublic) {
        wsLog('OPEN endpoints are all public, peer stays registered');
        return;
      }

      // Authorization Check
      const token = cookies['auth_token'];

      if (!token) {
        wsLog('OPEN no auth token, removing and closing');
        wsConnections.delete(peer.id);
        try { peer.close(4001, 'Unauthorized'); } catch { }
        return;
      }

      let users = await sql`
        SELECT u.id, u.is_admin, r.allowed_tags
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE u.current_token = ${token}
      `.catch(() => []);

      if (users.length === 0 && tenantSlug !== 'master') {
        const masterSql = useDB('master');
        const masterUsers = await masterSql`
          SELECT u.id, u.is_admin, r.allowed_tags
          FROM users u
          LEFT JOIN roles r ON u.role_id = r.id
          WHERE u.current_token = ${token}
        `.catch(() => []);
        
        if (masterUsers.length > 0 && (masterUsers[0].is_admin === 1 || masterUsers[0].is_admin === true || masterUsers[0].is_admin === '1')) {
           users = masterUsers;
           (users[0] as any).is_super_admin = true;
        }
      }

      if (users.length === 0) {
        wsLog('OPEN user not found, removing and closing');
        wsConnections.delete(peer.id);
        try { peer.close(4001, 'Unauthorized'); } catch { }
        return;
      }

      const user = users[0]!;

      if (!user.is_admin) {
        let allowedTags: string[] = [];
        try { allowedTags = typeof user.allowed_tags === 'string' ? JSON.parse(user.allowed_tags) : (user.allowed_tags || []); } catch { }

        for (const ep of matchedEps) {
          if (ep.is_public) continue;
          let epTags: string[] = [];
          try { epTags = typeof ep.hashtags === 'string' ? JSON.parse(ep.hashtags) : (ep.hashtags || []); } catch { }
          const allowed = epTags.some((tag: string) => allowedTags.includes(tag));
          if (!allowed) {
            wsLog('OPEN user not allowed for ep id=', ep.id, 'removing and closing');
            wsConnections.delete(peer.id);
            try { peer.close(4003, 'Forbidden'); } catch { }
            return;
          }
        }
      }

      (peer as any).__user = user;
      wsLog('OPEN auth passed, peer fully registered');
    } catch (err: any) {
      wsLog('OPEN ERROR:', err?.message, err?.stack);
      wsConnections.delete(peer.id);
      try { peer.close(1011, 'Internal Error'); } catch { }
    }
  },

  close(peer) {
    wsLog('CLOSE peer.id=', peer.id);
    const info = wsConnections.get(peer.id);
    if (info) {
        const infoPath = (info.endpointPath || '').replace(/^\/?api\/ws/, '').replace(/^\/?ws/, '');
        const normalizedPath = infoPath.replace(/^\/+|\/+$/g, '') || 'root';
        const channelKey = `${info.tenantSlug}:${normalizedPath}`;
        if (wsChannelMap.has(channelKey)) {
            wsChannelMap.get(channelKey)!.delete(info);
        }
    }
    wsConnections.delete(peer.id);
  },

  error(peer, error) {
    wsLog('ERROR peer.id=', peer.id, 'error=', (error as any)?.message);
    const info = wsConnections.get(peer.id);
    if (info) {
        const infoPath = (info.endpointPath || '').replace(/^\/?api\/ws/, '').replace(/^\/?ws/, '');
        const normalizedPath = infoPath.replace(/^\/+|\/+$/g, '') || 'root';
        const channelKey = `${info.tenantSlug}:${normalizedPath}`;
        if (wsChannelMap.has(channelKey)) {
            wsChannelMap.get(channelKey)!.delete(info);
        }
    }
    wsConnections.delete(peer.id);
  },

  async message(peer, message) {
    try {
      const msgData = message.text ? message.text() : message.toString();

      const senderInfo = wsConnections.get(peer.id);
      
      // Heartbeat Check
      if (msgData === '__PONG__') {
        if (senderInfo) senderInfo.isAlive = true;
        return;
      }

      let parsedPayload: any = null;
      try { parsedPayload = JSON.parse(msgData); } catch { parsedPayload = msgData; }

      wsLog('MESSAGE peer.id=', peer.id, 'wsConnections.size=', wsConnections.size, 'data=', msgData.substring(0, 100));

      if (!senderInfo) {
        wsLog('MESSAGE ABORT: peer.id not found in wsConnections. Keys:', Array.from(wsConnections.keys()));
        return;
      }

      const p = peer as any;
      if (p.__wsEps && p.__wsEps.length > 0) {
        try {
          const { runCustomCode } = await import('../../utils/sandbox');
          for (const ep of p.__wsEps) {
            if (!ep.code || String(ep.code).trim().length === 0) continue;
            
            const sandboxResult = await runCustomCode(
              p.__tenantSlug || 'master',
              ep.code,
              parsedPayload,
              String(ep.id || 'unknown'),
              { user: p.__user || null, peerId: peer.id, params: p.__routeParams || {} }
            );

            if (sandboxResult && typeof sandboxResult === 'object') {
              if (sandboxResult.block === true || sandboxResult.broadcast === false) {
                wsLog(`MESSAGE SANDBOX ${ep.id} BLOCKED BROADCAST`);
                return;
              }
              if (sandboxResult.payload !== undefined) {
                parsedPayload = sandboxResult.payload;
              }
            }
          }
        } catch (e: any) {
          wsLog('MESSAGE SANDBOX ERROR:', e?.message);
          return; // Do not broadcast if Sandbox crashes
        }
      }

      const finalMsgData = typeof parsedPayload === 'object' ? JSON.stringify(parsedPayload) : String(parsedPayload);
      wsLog('MESSAGE senderInfo found, tenant=', senderInfo.tenantSlug, 'path=', senderInfo.endpointPath);

      // Broadcast to all clients in the same tenant and same matched path
      let sentCount = 0;
      for (const [id, info] of wsConnections.entries()) {
        const infoPath = info.endpointPath.replace(/^\/?api\/ws/, '').replace(/^\/?ws/, '');
        const senderPath = senderInfo.endpointPath.replace(/^\/?api\/ws/, '').replace(/^\/?ws/, '');
        const cleanInfoPath = infoPath.startsWith('/') ? infoPath : '/' + infoPath;
        const cleanSenderPath = senderPath.startsWith('/') ? senderPath : '/' + senderPath;

        if (id !== peer.id && info.tenantSlug === senderInfo.tenantSlug && cleanInfoPath === cleanSenderPath) {
          try {
            info.send(finalMsgData);
            sentCount++;
          } catch (err: any) {
            wsLog('MESSAGE broadcast send error:', err?.message);
          }
        }
      }
      wsLog('MESSAGE broadcast done, sentCount=', sentCount);
    } catch (err: any) {
      wsLog('MESSAGE ERROR:', err?.message, err?.stack);
    }
  }
});
