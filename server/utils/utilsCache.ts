import { useDB, TenantEventManager } from './db';
import { logEvents } from './realtime';
import vm from 'node:vm';

export interface CachedUtil {
  id: number;
  name: string;
  key: string;
  target: 'ui' | 'api' | 'shared';
  code: string;
  scope: string[];
  compiled?: Function;
}

interface TenantCache {
  utils: Map<string, CachedUtil>;
  isFetched: boolean;
}
const tenantCaches: Map<string, TenantCache> = new Map();

TenantEventManager.on('tenant:evict', (tenantSlug: string) => {
  if (tenantCaches.has(tenantSlug)) {
    tenantCaches.delete(tenantSlug);
  }
});

function emitUtilLog(level: string, id: number, args: any[]) {
  logEvents.emit('log', {
    sourceId: `util_${id}`,
    level,
    args: args.map((arg: any) => {
      if (typeof arg === 'object' && arg !== null) {
        try { return JSON.parse(JSON.stringify(arg)); } catch { return String(arg); }
      }
      return arg;
    }),
    timestamp: new Date().toISOString()
  });
}

function parseScopeSafe(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v));
  if (raw === null || raw === undefined) return [];

  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v));
      return [];
    } catch {
      return s.split(',').map((v) => v.trim()).filter(Boolean);
    }
  }

  return [];
}

export async function getActiveUtilities(tenantSlug: string): Promise<CachedUtil[]> {
  if (!tenantCaches.has(tenantSlug)) {
    tenantCaches.set(tenantSlug, { utils: new Map(), isFetched: false });
  }
  const cache = tenantCaches.get(tenantSlug)!;

  if (cache.isFetched) {
    return Array.from(cache.utils.values());
  }

  try {
    const sql = useDB(tenantSlug);
    const rows = await sql<any[]>`
      SELECT id, name, key, target, code, scope
      FROM utils
      WHERE active = true
    `;

    cache.utils.clear();
    rows.forEach((row: any) => {
      const util: CachedUtil = {
        id: row.id,
        name: row.name || '',
        key: row.key,
        target: row.target,
        code: row.code,
        scope: parseScopeSafe(row.scope)
      };
      cache.utils.set(row.key, util);
    });

    cache.isFetched = true;
  } catch (err) {
    console.error('[Utils Cache Error]', err);
  }

  return Array.from(cache.utils.values());
}

export function getUtilByKey(tenantSlug: string, key: string): CachedUtil | undefined {
  const cache = tenantCaches.get(tenantSlug);
  if (!cache) return undefined;
  return cache.utils.get(key);
}

export function invalidateUtilsCache(tenantSlug: string) {
  if (tenantCaches.has(tenantSlug)) {
    tenantCaches.get(tenantSlug)!.utils.clear();
    tenantCaches.get(tenantSlug)!.isFetched = false;
  }
}

export async function compileUtility(util: CachedUtil): Promise<Function> {
  if (util.compiled) {
    return util.compiled;
  }

  try {
    // Validate code doesn't contain forbidden globals
    const forbidden = ['eval', 'Function', 'globalThis', 'global', 'import'];
    for (const word of forbidden) {
      if (new RegExp(`\\b${word}\\b`).test(util.code)) {
        throw new Error(
          `Yasaklı: ${word} kullanılamaz. Güvenli API uzantılarını kullanın.`
        );
      }
    }

    const rawCode = String(util.code || '').trim();

    // Support module-like utilities: "export default function (...) { ... }" or "export default async function"
    if (/^\s*export\s+default\s+(async\s+)?function\b/.test(rawCode)) {
      const functionCode = rawCode.replace(/^\s*export\s+default\s+/, '');
      const wrappedCall = `
        (function(__utils_context, ...__utils_args) {
          const __ctx = __utils_context || {};
          const __emit = __ctx.__emitUtilLog;
          const __uid = __ctx.__utilId;
          const console = {
            log: (...a) => { if (__emit) __emit('log', __uid, a); },
            warn: (...a) => { if (__emit) __emit('warn', __uid, a); },
            error: (...a) => { if (__emit) __emit('error', __uid, a); },
            info: (...a) => { if (__emit) __emit('info', __uid, a); }
          };
          const logger = console;
          const __fn = (${functionCode});
          return __fn(__utils_context, ...__utils_args);
        })
      `;
      const fn = vm.runInNewContext(wrappedCall, {}) as Function;
      util.compiled = fn;
      return fn;
    }

    // Support direct function declaration/expression style.
    if (/^\s*function\b/.test(rawCode) || /^\s*\(\s*.*\)\s*=>/.test(rawCode) || /^\s*async\s*\(\s*.*\)\s*=>/.test(rawCode)) {
      const wrappedCall = `
        (function(__utils_context, ...__utils_args) {
          const __ctx = __utils_context || {};
          const __emit = __ctx.__emitUtilLog;
          const __uid = __ctx.__utilId;
          const console = {
            log: (...a) => { if (__emit) __emit('log', __uid, a); },
            warn: (...a) => { if (__emit) __emit('warn', __uid, a); },
            error: (...a) => { if (__emit) __emit('error', __uid, a); },
            info: (...a) => { if (__emit) __emit('info', __uid, a); }
          };
          const logger = console;
          const __fn = (${rawCode});
          return __fn(__utils_context, ...__utils_args);
        })
      `;
      const fn = vm.runInNewContext(wrappedCall, {}) as Function;
      util.compiled = fn;
      return fn;
    }

    // Body style fallback: code is treated as function body.
    const wrappedCode = `
      (function(__utils_context, ...__utils_args) {
        const __ctx = __utils_context || {};
        const __emit = __ctx.__emitUtilLog;
        const __uid = __ctx.__utilId;
        const console = {
          log: (...a) => { if (__emit) __emit('log', __uid, a); },
          warn: (...a) => { if (__emit) __emit('warn', __uid, a); },
          error: (...a) => { if (__emit) __emit('error', __uid, a); },
          info: (...a) => { if (__emit) __emit('info', __uid, a); }
        };
        const logger = console;
        ${rawCode}
      })
    `;

    const fn = vm.runInNewContext(wrappedCode, {}) as Function;
    util.compiled = fn;
    return fn;
  } catch (err) {
    throw new Error(
      `Utility derlemesi başarısız [${util.key}]: ${(err as Error).message}`
    );
  }
}

export function executeUtility(
  util: CachedUtil,
  context: any,
  ...args: any[]
): any {
  try {
    if (!util.compiled) {
      throw new Error(`Utility derlenmedi: ${util.key}`);
    }

    // Enforce scope restrictions
    if (util.scope.length > 0) {
      // Scope validation opsiyonel (v2'de)
    }

    const enhancedContext = {
      __emitUtilLog: emitUtilLog,
      __utilId: util.id,
      ...(context || {})
    };

    return util.compiled(enhancedContext, ...args);
  } catch (err) {
    throw new Error(
      `Utility çalıştırılması başarısız [${util.key}]: ${(err as Error).message}`
    );
  }
}
