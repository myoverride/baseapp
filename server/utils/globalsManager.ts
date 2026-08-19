import { useDB, TenantEventManager } from './db';
import { logEvents } from './realtime';
import vm from 'node:vm';

export interface GlobalVar {
  key: string;
  value: any;
  is_secret: boolean;
}

export interface GlobalUtil {
  id: number;
  key: string;
  target: 'ui' | 'api' | 'shared';
  code: string;
  scope: string[];
  compiled?: vm.Script;
}

interface TenantGlobalsCache {
  vars: Map<string, GlobalVar>;
  methods: Map<string, GlobalUtil>;
  isFetched: boolean;
}

const tenantCaches: Map<string, TenantGlobalsCache> = new Map();

TenantEventManager.on('tenant:evict', (tenantSlug: string) => {
  tenantCaches.delete(tenantSlug);
});

function emitUtilLog(level: string, key: string, args: any[]) {
  logEvents.emit('log', {
    sourceId: `util_${key}`,
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
  if (Array.isArray(raw)) return raw.map(String);
  if (raw === null || raw === undefined) return [];
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return s.split(',').map((v) => v.trim()).filter(Boolean);
    }
  }
  return [];
}

async function fetchGlobals(tenantSlug: string): Promise<TenantGlobalsCache> {
  if (!tenantCaches.has(tenantSlug)) {
    tenantCaches.set(tenantSlug, { vars: new Map(), methods: new Map(), isFetched: false });
  }
  const cache = tenantCaches.get(tenantSlug)!;

  if (cache.isFetched) return cache;

  try {
    const sql = useDB(tenantSlug);
    const rows = await sql<any[]>`
      SELECT id, type, key, value, data_type, target, code, scope
      FROM globals
      WHERE active = true OR active = 1
    `;

    cache.vars.clear();
    cache.methods.clear();

    for (const row of rows) {
      if (row.type === 'variable') {
        let parsedVal = row.value;
        if (row.data_type === 'number') parsedVal = Number(row.value);
        if (row.data_type === 'boolean') parsedVal = row.value === 'true' || row.value === '1';
        if (row.data_type === 'json') {
          try { parsedVal = JSON.parse(row.value); } catch { parsedVal = null; }
        }
        cache.vars.set(row.key, {
          key: row.key,
          value: parsedVal,
          is_secret: row.data_type === 'password'
        });
      } else if (row.type === 'util') {
        cache.methods.set(row.key, {
          id: row.id,
          key: row.key,
          target: row.target,
          code: row.code,
          scope: parseScopeSafe(row.scope)
        });
      }
    }
    cache.isFetched = true;
  } catch (err) {
    console.error(`[GlobalsManager] Error fetching globals for ${tenantSlug}`, err);
  }
  return cache;
}

export const globals = {
  invalidate: (tenantSlug: string) => {
    if (tenantCaches.has(tenantSlug)) {
      tenantCaches.get(tenantSlug)!.isFetched = false;
    }
    // Lazy import to prevent circular dependency
    import('./db').then(({ TenantEventManager }) => {
       TenantEventManager.emit('globals:updated', tenantSlug);
    }).catch(()=>{});
  },

  getAllUtils: async (tenantSlug: string): Promise<GlobalUtil[]> => {
    const cache = await fetchGlobals(tenantSlug);
    return Array.from(cache.methods.values());
  },

  getAll: async (tenantSlug: string, includeSecrets = false): Promise<GlobalVar[]> => {
    const cache = await fetchGlobals(tenantSlug);
    const vars = Array.from(cache.vars.values());
    if (includeSecrets) return vars;
    return vars.filter(v => !v.is_secret);
  },

  get: async (tenantSlug: string, key: string, allowSecret = false, defaultValue: any = null): Promise<any> => {
    const cache = await fetchGlobals(tenantSlug);
    const v = cache.vars.get(key);
    if (!v) return defaultValue;
    if (v.is_secret && !allowSecret) return defaultValue;
    return v.value !== undefined ? v.value : defaultValue;
  },

  compileRaw: (code: string, key: string = 'raw'): vm.Script => {
    const forbidden = ['eval', 'Function', 'globalThis', 'global', 'import'];
    for (const word of forbidden) {
      if (new RegExp(`\\b${word}\\b`).test(code)) {
        throw new Error('error.forbiddenWord|' + word);
      }
    }
    const rawCode = String(code || '').trim();
    let wrappedCode = '';
    
    const wrapperStart = `
      (async function() {
        const __ctx = __utils_context || {};
        const __emit = __ctx.__emitUtilLog;
        const __uid = '${key}';
        const console = {
          log: (...a) => { if (__emit) __emit('log', __uid, a); },
          warn: (...a) => { if (__emit) __emit('warn', __uid, a); },
          error: (...a) => { if (__emit) __emit('error', __uid, a); },
          info: (...a) => { if (__emit) __emit('info', __uid, a); }
        };
        const logger = console;
    `;
    const wrapperEnd = `\n      })();`;

    if (/^\s*export\s+default\s+(async\s+)?function\b/m.test(rawCode)) {
      wrappedCode = wrapperStart + `const __fn = (${rawCode.replace(/^\s*export\s+default\s+/m, '')}); return await __fn(__utils_context, ...__utils_args);` + wrapperEnd;
    } else if (/^\s*function\b/.test(rawCode) || /^\s*\(\s*.*\)\s*=>/.test(rawCode) || /^\s*async\s*\(\s*.*\)\s*=>/.test(rawCode)) {
      wrappedCode = wrapperStart + `const __fn = (${rawCode}); return await __fn(__utils_context, ...__utils_args);` + wrapperEnd;
    } else {
      wrappedCode = wrapperStart + rawCode + wrapperEnd;
    }
    return new vm.Script(wrappedCode);
  },

  run: async (tenantSlug: string, key: string, context: any, ...args: any[]) => {
    const cache = await fetchGlobals(tenantSlug);
    const util = cache.methods.get(key);
    
    if (!util) {
      const similar = Array.from(cache.methods.keys()).filter((k: string) => k.includes(key) || key.includes(k)).slice(0, 5);
      const hint = similar.length > 0 ? ` Benzer: ${similar.join(', ')}` : '';
      throw new Error('error.serverUtilityNotFound|' + key + '|' + hint);
    }
    if (util.target === 'ui') {
      throw new Error('error.uiUtilityOnServer|' + key);
    }

    if (!util.compiled) {
      util.compiled = globals.compileRaw(util.code, key);
    }

    const { sendPushToUser, broadcastPush } = await import('./push');
    
    // Inject globals proxy into context so utilities can call other utilities
    const globalsObj: Record<string, any> = {};
    for (const v of cache.vars.values()) {
      globalsObj[v.key] = v.value;
    }
    const globalsProxy = new Proxy(globalsObj, {
      get: (target: any, prop: string | symbol) => {
        if (typeof prop !== 'string') return target[prop];
        if (prop in target) return target[prop];
        return async (...innerArgs: any[]) => {
          return globals.run(tenantSlug, prop, context, ...innerArgs);
        }
      }
    });

    const enhancedContext = {
      ...context,
      globals: globalsProxy,
      __emitUtilLog: emitUtilLog,
      push: {
        send: (userId: number, payload: any) => sendPushToUser(tenantSlug, userId, payload),
        broadcast: (payload: any) => broadcastPush(tenantSlug, payload)
      }
    };

    try {
      const sandboxContext = vm.createContext({
        __utils_context: enhancedContext,
        __utils_args: args,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        Promise,
        Buffer
      });

      // Fetch dynamic timeout from globals (default 5s)
      const timeoutSecStr = await globals.get(tenantSlug, 'SANDBOX_TIMEOUT', false, '5');
      const timeoutSec = parseInt(timeoutSecStr, 10) || 5;
      const timeoutMs = timeoutSec * 1000;

      // 1. Senkron (vm seviyesi) fiziksel timeout (Sonsuz while() vb. döngüleri keser)
      const execPromise = util.compiled.runInContext(sandboxContext, { timeout: timeoutMs });

      // 2. Asenkron (Promise.race) mantıksal timeout (Asılı kalan await'leri keser)
      let timeoutId: any;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Utility execution timed out after ${timeoutSec} seconds (Asynchronous)`));
        }, timeoutMs);
      });

      const result = await Promise.race([execPromise, timeoutPromise]);
      if (timeoutId) clearTimeout(timeoutId);

      return result;
    } catch (err) {
      throw new Error('error.serverUtilityFailed|' + key + '|' + (err as Error).message);
    }
  }
};
