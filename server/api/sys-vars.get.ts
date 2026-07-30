import { useDB } from '../utils/db';

export default defineEventHandler(async (event) => {
  const tenantSlug = event.context.tenantSlug || 'master';
  const sql = useDB(tenantSlug);
  const user = event.context.user;
  
  try {
    const vars = await sql`SELECT key, value, target, is_public, is_secret FROM system_variables WHERE target IN ('ui', 'shared')`;
    const result: Record<string, string> = {};
    
    for (const v of vars) {
      const isPublic = v.is_public === 1 || v.is_public === true;
      const isSecret = v.is_secret === 1 || v.is_secret === true;

      // If user is not authenticated, only include public variables
      if (!user && !isPublic) {
        continue;
      }

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
