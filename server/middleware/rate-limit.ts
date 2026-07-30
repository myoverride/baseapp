import { LRUCache } from 'lru-cache';

// Rate limiter
const rateLimitCache = new LRUCache<string, number>({
  max: 10000,
  ttl: 60 * 1000 // 1 minute
});

export default defineEventHandler((event) => {
  const ip = getRequestIP(event) || 'unknown';
  const pathname = event.node.req.url?.split('?')[0] || '';
  const isLogin = pathname.startsWith('/api/auth/login');
  const tenantSlug = event.context.tenantSlug || 'global';
  const userId = event.context.user?.id || 'anon';
  
  const MAX_REQUESTS = isLogin ? 10 : 1000;
  const cacheKey = isLogin ? `${ip}:${tenantSlug}:login` : `${ip}:${tenantSlug}:${userId}`;
  
  const currentCount = rateLimitCache.get(cacheKey) || 0;
  
  if (currentCount >= MAX_REQUESTS) {
    setResponseStatus(event, 429);
    return {
      error: 'Too Many Requests',
      message: 'errors.rateLimitExceeded'
    };
  }
  
  rateLimitCache.set(cacheKey, currentCount + 1);
});
