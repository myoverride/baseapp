import { runCustomCode } from '../../../utils/sandbox';
import { compileUtility, executeUtility } from '../../../utils/utilsCache';
import type { CachedUtil } from '../../../utils/utilsCache';
import { validateJS } from '../../../utils/codeValidator';
import { useDB } from '../../../utils/db';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  if (!user || (!user.is_admin && !user.is_super_admin)) {
    throw createError({ statusCode: 403, message: 'Bu işlem için yetkiniz yok.' });
  }

  const body = await readBody(event);
  const { type, code, payload, workerType } = body;

  if (!code) {
    throw createError({ statusCode: 400, message: 'Code cannot be empty.' });
  }
  
  if (!['endpoint', 'worker', 'util'].includes(type)) {
    throw createError({ statusCode: 400, message: 'Invalid test type.' });
  }

  // 1. Validate Code
  try {
    await validateJS(code, `Test ${type}`);
  } catch (err: any) {
    throw createError({ statusCode: 400, message: err.key || err.message, data: err.params });
  }

  // 2. Execute Code
  const tenantSlug = event.context.tenantSlug;
  const contextParams = { tenantSlug, userId: user.id };

  try {
    let result: any;
    
    if (type === 'util') {
      const dummyUtil: CachedUtil = {
        id: -1,
        name: 'Test Util',
        key: 'test_util',
        target: 'api',
        code: code,
        scope: []
      };
      const compiledFn = await compileUtility(dummyUtil);
      const safeDb = useDB(tenantSlug);
      
      const utilContext = {
        payload,
        db: safeDb,
        context: contextParams,
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
        __utilId: `test-sandbox-${type}`
      };
      
      if (Array.isArray(payload)) {
        result = await executeUtility(dummyUtil, utilContext, ...payload);
      } else {
        result = await executeUtility(dummyUtil, utilContext, payload);
      }
    } else if (type === 'worker' && workerType === 'daemon') {
      const { startTestDaemon } = await import('../../../utils/workerManager');
      await startTestDaemon(tenantSlug, code);
      result = "Daemon arkaplanda teste başladı. Durdurmak için Testi Durdur butonunu kullanın.";
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
    throw createError({ statusCode: 500, message: err.message || 'Çalıştırma hatası' });
  }
});
