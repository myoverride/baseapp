import { useDB, TenantEventManager } from './db';

// --- ROUTE MATCHER ---

export interface RouteMatchResult {
  isMatch: boolean;
  params: Record<string, string>;
}

export function compileRoutePattern(pattern: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const rawPattern = String(pattern || '').trim();
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

const CACHE_TTL = 60000; // 60 seconds
const cache = new Map<string, { data: CachedEndpoint[], lastFetchTime: number }>();

TenantEventManager.on('tenant:evict', (tenantSlug: string) => {
  cache.delete(tenantSlug);
});

export async function getActiveEndpoints(tenantSlug: string): Promise<CachedEndpoint[]> {
  if (!tenantSlug) return [];

  const now = Date.now();
  const entry = cache.get(tenantSlug);
  if (entry && entry.lastFetchTime > 0 && (now - entry.lastFetchTime < CACHE_TTL)) {
    return entry.data;
  }

  try {
    const sql = useDB(tenantSlug);
    const rows = await sql<{ id: number, name: string, route_pattern: string, code: string, is_public: boolean, hashtags: string | null }[]>`
      SELECT id, name, route_pattern, code, is_public, hashtags
      FROM endpoints 
      WHERE type = 'http' AND active = true 
      ORDER BY priority ASC
    `;

    const data = rows.map((row: any) => {
      const { regex, paramNames } = compileRoutePattern(row.route_pattern);
      return {
        ...row,
        regexPattern: regex,
        paramNames
      };
    });
    cache.set(tenantSlug, { data, lastFetchTime: Date.now() });
    return data;
  } catch (err) {
    console.error(`[Endpoint Cache Error] Tenant ${tenantSlug}:`, err);
    return entry ? entry.data : [];
  }
}

export function invalidateEndpointCache(tenantSlug: string) {
  cache.delete(tenantSlug);
}
