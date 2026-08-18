import { getActiveEndpointsRouter } from '../utils/endpointManager';
import { useDB } from '../utils/db';
import { runCustomCode } from '../utils/sandbox';

export default defineEventHandler(async (event) => {
  const router = await getActiveEndpointsRouter('master', 'http');
  const match = router ? router.lookup('/api/custom/kategori') : null;
  
  let sandboxError = null;
  let sandboxResult: any = 'NOT_RUN';
  try {
    if (match && match.payload) {
      const p = { method: 'GET', query: { limit: '1' }, params: {} };
      sandboxResult = await runCustomCode('master', match.payload.code, p, 'debug-123', { tenantSlug: 'master', userId: 1 });
    }
  } catch(e: any) {
    sandboxError = e.message;
  }

  return {
    isUndefined: sandboxResult === undefined,
    sandboxResult,
    sandboxError
  };
});
