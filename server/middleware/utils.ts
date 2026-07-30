import { executeServerUtil, getActiveServerUtilities } from '../utils/utilsServer';

export default defineEventHandler(async (event) => {
  // Utilities loader: API handler'ında erişim sağla
  event.context.utils = {
    getUtils: async (target?: 'api' | 'shared') => {
      const tenantSlug = event.context.tenantSlug || 'master';
      return getActiveServerUtilities(tenantSlug, target);
    },
    exec: async (key: string, ...args: any[]) => {
      const tenantSlug = event.context.tenantSlug || 'master';
      return executeServerUtil(tenantSlug, key, event, ...args);
    }
  };
});
