import { useDB } from '../utils/db';

export default defineEventHandler(async (event) => {
  const tenantSlug = event.context.tenantSlug || 'master';
  const sql = useDB(tenantSlug);
  const user = event.context.user;
  
  try {
    const vars = await sql`SELECT key, value, target, data_type FROM globals WHERE type = 'variable' AND target IN ('ui', 'shared') AND (active = 1 OR active = true)`;
    const result: Record<string, string> = {};
    
    for (const v of vars) {
      const isSecret = v.data_type === 'password';

      let valueToReturn = v.value;
      if (isSecret) {
        valueToReturn = '********';
      }

      result[v.key] = valueToReturn;
    }
    
    return result;
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message });
  }
});
