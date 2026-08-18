import { runCustomCode } from '../../../utils/sandbox';

import { validateJS } from '../../../utils/codeValidator';
import { useDB } from '../../../utils/db';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  if (!user) {
    throw createError({ statusCode: 401, message: 'errors.loginRequired' });
  }
  if (!user.is_admin && !user.is_super_admin) {
    throw createError({ statusCode: 403, message: 'errors.forbiddenAdminOnly' });
  }

  const body = await readBody(event);
  const { type, code, payload, workerType } = body;

  if (!code) {
    throw createError({ statusCode: 400, message: 'validation.codeRequired' });
  }
  
  if (!['endpoint', 'worker', 'util'].includes(type)) {
    throw createError({ statusCode: 400, message: 'validation.invalidType' });
  }

  // 1. Validate Code
  try {
    await validateJS(code, `Test ${type}`);
  } catch (err: any) {
    throw createError({ statusCode: 400, message: err.key || 'errors.databaseError', data: err.key ? err.params : undefined });
  }

  // 2. Execute Code
  const tenantSlug = event.context.tenantSlug;
  const contextParams = { tenantSlug, userId: user.id };

  try {
    let result: any;
    
    if (type === 'util') {
      const { globals } = await import('../../../utils/globalsManager');
      const compiledFn = globals.compileRaw(code, `test-sandbox-${type}`);
      const safeDb = useDB(tenantSlug);
      
      const { publishWS } = await import('../../../utils/wsManager');
      const { publishMQTT } = await import('../../../utils/mqtt');
      const { getServerTranslation } = await import('../../../utils/i18n-server');
      const recordManager = await import('../../../utils/recordManager');
      const { createEphemeralTelemetryDB } = await import('../../../utils/db');

      const allVars = await globals.getAll(tenantSlug, true);
      const globalsObj: Record<string, any> = {};
      for (const v of allVars) {
        globalsObj[v.key] = v.value;
      }
      
      const __utils_context_ref: any = { current: null };
      
      const globalsProxy = new Proxy(globalsObj, {
        get: (target: any, prop: string | symbol) => {
          if (typeof prop !== 'string') return target[prop];
          if (prop in target) return target[prop];
          return async (...innerArgs: any[]) => {
            return globals.run(tenantSlug, prop, __utils_context_ref.current, ...innerArgs);
          }
        }
      });
      
      let telemetryDbProxy: any = null;
      try {
        const tDb = await createEphemeralTelemetryDB(tenantSlug);
        telemetryDbProxy = new Proxy(function(){}, {
           get: (_, prop: string) => async (...args: any[]) => {
              if(typeof tDb[prop] === 'function') return await tDb[prop].bind(tDb)(...args);
              return tDb[prop];
           },
           apply: async (_, __, argsList: any[]) => await tDb(...argsList)
        });
      } catch(e) {}

      const utilContext = {
        payload,
        tenantSlug,
        userId: user.id,
        db: safeDb,
        telemetryDb: telemetryDbProxy,
        globals: globalsProxy,
        publishWS: (path: string, p: any) => publishWS(tenantSlug, path, p),
        publishMQTT: async (topic: string, msg: any) => {
            const finalMsg = typeof msg === 'object' ? JSON.stringify(msg) : String(msg);
            return publishMQTT(`${tenantSlug}/${topic}`, finalMsg);
        },
        t: (key: string, params?: any) => getServerTranslation(tenantSlug, 'en', key, params),
        tAsync: async (args: any) => {
            const k = typeof args === 'string' ? args : args.key;
            const p = args.params;
            return getServerTranslation(tenantSlug, 'en', k, p);
        },
        recordManager: (() => {
          const wrapper: any = {};
          for (const prop in recordManager) {
            const val = (recordManager as any)[prop];
            if (typeof val === 'function') {
              wrapper[prop] = async (...args: any[]) => {
                if (tenantSlug === 'master') return val(...args);
                return val(tenantSlug, ...args);
              };
            } else {
              wrapper[prop] = val;
            }
          }
          return wrapper;
        })(),
        __emitUtilLog: async (level: string, uid: string, args: any[]) => {
           const { logEvents } = await import('../../../utils/realtime');
           logEvents.emit('log', {
              sourceId: `test-sandbox-${type}`,
              level,
              args: args.map(arg => {
                if (typeof arg === 'object' && arg !== null) {
                  try { return JSON.parse(JSON.stringify(arg)); } catch { return String(arg); }
                }
                return arg;
              }),
              timestamp: new Date().toISOString()
           });
        },
        __utilId: `test-sandbox-${type}`,
        push: {
           send: () => {}, broadcast: () => {}
        }
      };
      
      __utils_context_ref.current = utilContext;
      
      const vm = (await import('node:vm')).default;
      const sandboxContext = vm.createContext({
        __utils_context: utilContext,
        __utils_args: Array.isArray(payload) ? payload : [payload],
        setTimeout, clearTimeout, setInterval, clearInterval, Promise, Buffer
      });
      result = await compiledFn.runInContext(sandboxContext);
    } else {
      const { clearSandboxCache } = await import('../../../utils/sandbox');
      clearSandboxCache();
      result = await runCustomCode(
        tenantSlug, 
        code, 
        payload || {}, 
        `test-sandbox-${type}`, 
        contextParams
      );
    }

    return { success: true, result };
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message || 'error.executionFailed' });
  }
});
