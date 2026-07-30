import { useDB } from '../../../utils/db';
import { compileUtility, executeUtility } from '../../../utils/utilsCache';
import { logEvents } from '../../../utils/realtime';

function parseScopeSafe(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v));
  if (raw === null || raw === undefined) return [];
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
    } catch {
      return s.split(',').map((v) => v.trim()).filter(Boolean);
    }
  }
  return [];
}

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  if (!user) throw createError({ statusCode: 401, message: 'errors.loginRequired' });
  const method = getMethod(event);

  if (!['GET', 'POST'].includes(method) && !user.is_admin) {
    throw createError({ statusCode: 403, message: 'errors.unauthorized' });
  }

  const sql = useDB(event.context.tenantSlug);
  const id = getRouterParam(event, 'id');
  const userId = event.context.user?.id;

  if (!id) {
    throw createError({ statusCode: 400, message: 'errors.validationFailed' });
  }

  if (method === 'GET') {
    try {
      const [util] = await sql.unsafe('SELECT * FROM utils WHERE id = ?', [id]);
      if (!util) throw createError({ statusCode: 404, message: 'errors.notFound' });

      let parsedTags = [];
      if (util.hashtags) {
        try {
          const parsed = JSON.parse(util.hashtags);
          parsedTags = Array.isArray(parsed) ? parsed : [];
        } catch {
          parsedTags = typeof util.hashtags === 'string' && util.hashtags.length > 0 ? [util.hashtags] : [];
        }
      }

      let parsedScope = [];
      if (util.scope) {
        try {
          const parsed = JSON.parse(util.scope);
          parsedScope = Array.isArray(parsed) ? parsed : [];
        } catch {
          parsedScope = [];
        }
      }

      return {
        success: true,
        data: {
          ...util,
          scope: parsedScope,
          tags: parsedTags
        }
      };
    } catch (err: any) {
      if (err.statusCode) throw err;
      throw createError({ statusCode: 500, message: 'errors.internalError' + ': ' + (err?.message || '') });
    }
  }

  if (method === 'PUT') {
    const body = await readBody(event);
    try {
      const [existing] = await sql.unsafe('SELECT id, name, key, target, code, hashtags FROM utils WHERE id = ?', [id]);
      if (!existing) throw createError({ statusCode: 404, message: 'errors.notFound' });

      const newKey = body.key !== undefined ? body.key : existing.key;
      const newName = body.name !== undefined ? body.name : existing.name;

      const duplicates = await sql.unsafe(
        'SELECT id FROM utils WHERE (key = ? OR name = ?) AND id != ?',
        [newKey, newName || '', id]
      );

      if (duplicates.length > 0) {
        throw createError({
          statusCode: 409,
          message: 'errors.duplicateKey'
        });
      }

      const hashtags = body.hashtags !== undefined 
        ? (Array.isArray(body.hashtags) ? JSON.stringify(body.hashtags) : '[]')
        : (existing.hashtags || '[]');

      if (body.code !== undefined) {
        const target = body.target !== undefined ? body.target : existing.target;
        if (['api', 'shared'].includes(target)) {
          try {
            const { validateJS } = await import('../../../utils/codeValidator');
            await validateJS(body.code, `Util: ${body.key !== undefined ? body.key : existing.key}`);
          } catch (err: any) {
            throw createError({ statusCode: 400, message: err.key || err.message, data: err.params });
          }
        }
      }

      await sql.unsafe(`
        UPDATE utils 
        SET name = ?, key = ?, target = ?, code = ?, hashtags = ?, active = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        body.name !== undefined ? body.name : existing.name || '',
        body.key !== undefined ? body.key : existing.key,
        body.target !== undefined ? body.target : existing.target,
        body.code ?? existing.code,
        hashtags,
        typeof body.active === 'boolean' ? (body.active ? 1 : 0) : existing.active,
        userId,
        id
      ]);

      const [updated] = await sql.unsafe('SELECT * FROM utils WHERE id = ?', [id]);
      import('../../../utils/history').then(m => m.saveHistory(event.context.tenantSlug, 'utils', id as string, updated)).catch(console.error);
      
      const { invalidateUtilsCache } = await import('../../../utils/utilsCache');
      invalidateUtilsCache(event.context.tenantSlug);

      return { success: true, message: 'message.success' };
    } catch (err: any) {
      if (err.statusCode) throw err;
      throw createError({ statusCode: 500, message: 'errors.internalError' + ': ' + (err?.message || '') });
    }
  }

  if (method === 'DELETE') {
    try {
      const result = await sql.unsafe('DELETE FROM utils WHERE id = ?', [id]);
      if ((result as any).changes === 0) throw createError({ statusCode: 404, message: 'errors.notFound' });
      
      const { invalidateUtilsCache } = await import('../../../utils/utilsCache');
      invalidateUtilsCache(event.context.tenantSlug);
      
      return { success: true, message: 'message.success' };
    } catch (err: any) {
      if (err.statusCode) throw err;
      throw createError({ statusCode: 500, message: 'errors.internalError' + ': ' + (err?.message || '') });
    }
  }

  if (method === 'POST') {
    const sourceId = `custom_util_${id}`;
    const executionLogs: Array<{ level: 'log' | 'warn' | 'error'; timestamp: string; args: any[] }> = [];

    const pushLog = (level: 'log' | 'warn' | 'error', args: any[]) => {
      const logEntry = {
        level,
        timestamp: new Date().toISOString(),
        args: args.map((a: any) => {
          if (a === undefined) return 'undefined';
          if (a === null) return null;
          if (typeof a === 'object') {
            try { return JSON.parse(JSON.stringify(a)); } catch { return String(a); }
          }
          return a;
        })
      };

      executionLogs.push(logEntry);
      logEvents.emit('log', {
        sourceId,
        level: logEntry.level,
        args: logEntry.args,
        timestamp: logEntry.timestamp
      });
    };

    const body = await readBody(event);
    const args = body.args || [];

    try {
      const [util] = await sql.unsafe(
        'SELECT id, key, target, code, scope, hashtags FROM utils WHERE id = ? AND active = true',
        [id]
      );

      if (!util) throw createError({ statusCode: 404, message: 'errors.notFound' });
      if (!['ui', 'shared'].includes(util.target)) {
        throw createError({ statusCode: 403, message: 'errors.utilNotExecutable' });
      }

      if (!user.is_admin) {
        let utilTags: string[] = [];
        try { utilTags = typeof util.hashtags === 'string' ? JSON.parse(util.hashtags) : (util.hashtags || []); } catch {}
        const allowedTags = Array.isArray(user.allowed_tags) ? user.allowed_tags : [];
        const hasAccess = utilTags.length === 0 || utilTags.some((tag: string) => allowedTags.includes(tag));
        if (!hasAccess) {
          throw createError({ statusCode: 403, message: 'errors.unauthorized' });
        }
      }

      const mockUtil = { ...util, scope: parseScopeSafe(util.scope), compiled: undefined };
      await compileUtility(mockUtil as any);

      const safeContext = {
        logger: {
          log: (...logArgs: any[]) => pushLog('log', logArgs),
          error: (...logArgs: any[]) => pushLog('error', logArgs),
          warn: (...logArgs: any[]) => pushLog('warn', logArgs)
        },
        console: {
          log: (...logArgs: any[]) => pushLog('log', logArgs),
          error: (...logArgs: any[]) => pushLog('error', logArgs),
          warn: (...logArgs: any[]) => pushLog('warn', logArgs)
        },
        push: {
          send: async (uId: number, payload: any) => {
            const { sendPushToUser } = await import('../../../utils/push');
            await sendPushToUser(event.context.tenantSlug, uId, payload);
          },
          broadcast: async (payload: any) => {
            const { broadcastPush } = await import('../../../utils/push');
            await broadcastPush(event.context.tenantSlug, payload);
          }
        }
      };

      const result = await Promise.resolve(executeUtility(mockUtil as any, safeContext, ...args));

      return { success: true, result, logs: executionLogs };
    } catch (err: any) {
      if (err.statusCode) throw err;
      const errorMessage = err?.message || err?.statusMessage || err?.data?.message || (typeof err === 'string' ? err : JSON.stringify(err));
      return {
        success: false,
        error: errorMessage,
        logs: executionLogs,
        debug: {
          id,
          argsCount: Array.isArray(args) ? args.length : 0,
          stack: err?.stack || null
        }
      };
    }
  }

  throw createError({ statusCode: 405, message: 'errors.methodNotAllowed' });
});
