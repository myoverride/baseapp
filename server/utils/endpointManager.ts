import { useDB, TenantEventManager } from './db';

// --- ROUTE MATCHER ---

export interface RouteMatchResult {
  isMatch: boolean;
  params: Record<string, string>;
}

export function compileRoutePattern(pattern: string, type: string = 'http'): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  let rawPattern = String(pattern || '').trim();
  
  if (type === 'ws') {
    rawPattern = rawPattern.replace(/^\/?api\/ws/, '').replace(/^\/?ws/, '');
  }
  
  const normalizedPattern = rawPattern.startsWith('/') ? rawPattern : `/${rawPattern}`;
  const segments = normalizedPattern.split('/');
  const regexParts: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i] || '';

    // Leading slash segment
    if (i === 0) {
      regexParts.push('');
      continue;
    }

    // Catch-all wildcard
    const isCatchAll = seg.startsWith('[...') && seg.endsWith(']');
    if (isCatchAll) {
      const paramName = seg.replace('[...', '').replace(']', '') || 'catchAll';
      paramNames.push(paramName);
      regexParts.push('(.*)');
      break; // Catch-all can only be at the end
    }

    // MQTT Wildcards
    if (type === 'mqtt') {
      if (seg === '#') {
        paramNames.push('wildcard');
        regexParts.push('(.*)');
        break; // # can only be at the end
      }
      if (seg === '+') {
        paramNames.push('plusSegment');
        regexParts.push('([^/]+)');
        continue;
      }
    }

    // Named parameters
    const namedMatch = seg.match(/^:([a-zA-Z0-9_]+)$/);
    if (namedMatch) {
      paramNames.push(namedMatch[1] as string);
      regexParts.push('([^/]+)');
      continue;
    }

    // Literal segment
    regexParts.push(seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  }

  const regexBody = regexParts.join('/');
  return { regex: new RegExp(`^${regexBody}$`), paramNames };
}

export function matchRoute(path: string, compiledRegex: RegExp, paramNames: string[]): RouteMatchResult {
  // Strip query string if any
  const cleanPath = path.split('?')[0] || '';
  const match = cleanPath.match(compiledRegex);

  if (!match) {
    return { isMatch: false, params: {} };
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < paramNames.length; i++) {
    const pName = paramNames[i] as string;
    params[pName] = match[i + 1] || '';
  }

  return { isMatch: true, params };
}

// --- ENDPOINT CACHE (Formerly Middleware Cache) ---

import { createRouter } from 'radix3';

export interface CachedEndpoint {
  id: number;
  name: string;
  route_pattern: string;
  code: string;
  is_public: boolean;
  hashtags: string | null;
  regexPattern: RegExp;
  paramNames: string[];
}

interface TenantEndpointCache {
  endpoints: Map<string, CachedEndpoint[]>; // key: type (http, ws, mqtt)
  routers: Map<string, any>; // key: type (http, ws)
  isFetched: Map<string, boolean>; // key: type
}
const tenantCaches = new Map<string, TenantEndpointCache>();

TenantEventManager.on('tenant:evict', (tenantSlug: string) => {
  invalidateEndpointCache(tenantSlug);
});

export async function getActiveEndpoints(tenantSlug: string, type: 'http' | 'ws' | 'mqtt' = 'http'): Promise<CachedEndpoint[]> {
  if (!tenantSlug) return [];

  if (!tenantCaches.has(tenantSlug)) {
    tenantCaches.set(tenantSlug, { endpoints: new Map(), routers: new Map(), isFetched: new Map() });
  }
  const cache = tenantCaches.get(tenantSlug)!;

  if (cache.isFetched.get(type)) {
    return cache.endpoints.get(type) || [];
  }

  try {
    const sql = useDB(tenantSlug);
    const rows = await sql<{ id: number, name: string, route_pattern: string, code: string, is_public: boolean, hashtags: string | null }[]>`
      SELECT id, name, route_pattern, code, is_public, hashtags
      FROM endpoints 
      WHERE type = ${type} AND active = true 
      ORDER BY priority ASC
    `;

    const data = rows.map((row: any) => {
      const { regex, paramNames } = compileRoutePattern(row.route_pattern, type);
      return {
        ...row,
        regexPattern: regex,
        paramNames
      };
    });
    
    cache.endpoints.set(type, data);

    if (type === 'http' || type === 'ws') {
      const router = createRouter();
      
      const patternMap = new Map<string, CachedEndpoint[]>();
      for (const ep of data) {
        let radixPattern = ep.route_pattern.trim();
        if (type === 'ws') {
           radixPattern = radixPattern.replace(/^\/?api\/ws/, '').replace(/^\/?ws/, '');
        }
        if (!radixPattern.startsWith('/')) radixPattern = '/' + radixPattern;
        // Convert Nuxt-like [...catchAll] to Radix3 /**
        radixPattern = radixPattern.replace(/\[\.\.\.[^\]]+\]/g, '**');
        
        if (!patternMap.has(radixPattern)) {
           patternMap.set(radixPattern, []);
        }
        patternMap.get(radixPattern)!.push(ep);
      }
      
      for (const [pattern, eps] of patternMap.entries()) {
        // Insert payload wrapped to prevent params overriding ep properties
        router.insert(pattern, { payload: eps });
      }
      
      cache.routers.set(type, router);
    }

    cache.isFetched.set(type, true);
    return data;
  } catch (err) {
    console.error(`[Endpoint Cache Error] Tenant ${tenantSlug} (type: ${type}):`, err);
    return cache.endpoints.get(type) || [];
  }
}

export async function getActiveEndpointsRouter(tenantSlug: string, type: 'http' | 'ws' = 'http'): Promise<any> {
   if (!tenantSlug) return null;
   await getActiveEndpoints(tenantSlug, type); // Ensure it is fetched
   const cache = tenantCaches.get(tenantSlug)!;
   return cache.routers.get(type) || null;
}

export function invalidateEndpointCache(tenantSlug: string) {
  if (tenantCaches.has(tenantSlug)) {
    const cache = tenantCaches.get(tenantSlug)!;
    cache.isFetched.set('http', false);
    cache.isFetched.set('ws', false);
    cache.isFetched.set('mqtt', false);
  }
}
