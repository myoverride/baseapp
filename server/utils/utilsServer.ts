import { getUtilByKey, compileUtility, getActiveUtilities, executeUtility } from './utilsCache';

export const executeServerUtil = async (tenantSlug: string, key: string, context: any, ...args: any[]) => {
  // Ensure cache is hydrated from DB before lookup.
  await getActiveUtilities(tenantSlug);

  const util = getUtilByKey(tenantSlug, key);
  if (!util) {
    const all = await getActiveUtilities(tenantSlug);
    const availableKeys = all
      .filter((u: any) => u.target !== 'ui')
      .map((u: any) => u.key);
    const similar = availableKeys.filter((k: string) => k.includes(key) || key.includes(k)).slice(0, 5);
    const hint = similar.length > 0 ? ` Benzer key'ler: ${similar.join(', ')}` : '';
    throw new Error(`Server utility bulunamadı: ${key}.${hint} Utility'nin active olduğundan emin olun.`);
  }

  if (util.target === 'ui') {
    throw new Error(`UI utility server tarafında çalıştırılamaz: ${key}`);
  }

  try {
    // Compile if not already compiled
    await compileUtility(util as any);

    if (!util.compiled) {
      throw new Error('Compilation failed');
    }

    const { sendPushToUser, broadcastPush } = await import('./push');
    const enhancedContext = {
      ...context,
      push: {
        send: (userId: number, payload: any) => sendPushToUser(tenantSlug, userId, payload),
        broadcast: (payload: any) => broadcastPush(tenantSlug, payload)
      }
    };

    return executeUtility(util as any, enhancedContext, ...args);
  } catch (err) {
    throw new Error(
      `Server utility çalıştırılamadı [${key}]: ${(err as Error).message}`
    );
  }
};

export async function getActiveServerUtilities(tenantSlug: string, target?: 'api' | 'shared') {
  const { getActiveUtilities } = await import('./utilsCache');
  const all = await getActiveUtilities(tenantSlug);
  
  return all.filter((util: any) => {
    if (util.target === 'ui') return false;
    if (target) return util.target === target || util.target === 'shared';
    return true;
  });
}
