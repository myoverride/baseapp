import {} from '../utils/globalsManager';

export default defineEventHandler(async (event) => {
  // Utilities loader: API handler'ında erişim sağla
  event.context.utils = {
    getUtils: async (target?: 'api' | 'shared') => {
      const tenantSlug = event.context.tenantSlug || 'master';
      const allUtils = await globals.getAllUtils(tenantSlug);
      return allUtils.filter((util: any) => {
        if (util.target === 'ui') return false;
        if (target) return util.target === target || util.target === 'shared';
        return true;
      });
    },
    exec: async (key: string, ...args: any[]) => {
      const tenantSlug = event.context.tenantSlug || 'master';
      return globals.run(tenantSlug, key, event, ...args);
    }
  };
});
