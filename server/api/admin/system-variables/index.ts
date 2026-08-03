import { useDB } from '../../../utils/db';
import { getAllSysVars, invalidateSysVarCache } from '../../../utils/sysvars';
import { clearSandboxCache } from '../../../utils/sandbox';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  if (!user || !user.is_admin) throw createError({ statusCode: 403, message: 'errors.unauthorized' });

  const method = getMethod(event);
  const sql = useDB(event.context.tenantSlug);

  if (method === 'GET') {
    try {
      const query = getQuery(event);
      const isExport = query.export === 'true';
      const search = ((query.search as string) || '').replace(/^#/, '');
      const page = Math.max(1, parseInt(query.page as string) || 1);
      const limit = parseInt(query.limit as string) || 10;
      const sortBy = (query.sortBy as string) || 'key';
      const sortOrder = (query.sortOrder as string) || 'asc';
      
      let vars = await getAllSysVars(event.context.tenantSlug, false); // Güvenlik (Backdoor Önlemi): Export yaparken bile şifreler SIZDIRILAMAZ (isExport yerine false)

      // Note: Values are returned to the frontend. Secrets are already masked by getAllSysVars(..., false).
      if (search) {
        vars = vars.filter(v => 
          String(v.key).toLowerCase().includes(search) || 
          String(v.value).toLowerCase().includes(search) || 
          (v.description && String(v.description).toLowerCase().includes(search))
        );
      }

      const filtersParam = (query.advancedFilters || query.filters) as string;
      if (filtersParam) {
        try {
          const filterAst = JSON.parse(filtersParam);
          
          const evaluateCondition = (item: any, condition: any): boolean => {
            if (condition.logic && Array.isArray(condition.conditions)) {
              if (condition.conditions.length === 0) return true;
              const results = condition.conditions.map((c: any) => evaluateCondition(item, c));
              let isMatch = condition.logic === 'AND' ? results.every((r: boolean) => r) : results.some((r: boolean) => r);
              return condition.isNot ? !isMatch : isMatch;
            } else {
              const { field, operator, value } = condition;
              let itemValue = item[field];
              
              if (field === 'hashtags' && typeof itemValue === 'string') {
                 try { 
                   const parsed = JSON.parse(itemValue); 
                   if (Array.isArray(parsed)) itemValue = parsed;
                 } catch(e) {}
              }

              if (itemValue === undefined || itemValue === null) itemValue = '';
              const strItem = String(itemValue).toLowerCase();
              const strVal = String(value || '').toLowerCase();

              switch (operator) {
                case 'equals': return itemValue == value;
                case 'notEquals': return itemValue != value;
                case 'contains':
                  if (Array.isArray(itemValue)) return itemValue.some(v => String(v).toLowerCase().includes(strVal));
                  return strItem.includes(strVal);
                case 'notContains':
                  if (Array.isArray(itemValue)) return !itemValue.some(v => String(v).toLowerCase().includes(strVal));
                  return !strItem.includes(strVal);
                case 'startsWith': return strItem.startsWith(strVal);
                case 'endsWith': return strItem.endsWith(strVal);
                case 'isEmpty': return itemValue === '' || (Array.isArray(itemValue) && itemValue.length === 0);
                case 'isNotEmpty': return itemValue !== '' && (!Array.isArray(itemValue) || itemValue.length > 0);
                default: return true;
              }
            }
          };

          const astArray = Array.isArray(filterAst) ? filterAst : [filterAst];
          for (const ast of astArray) {
             vars = vars.filter(v => evaluateCondition(v, ast));
          }
        } catch (e) {
          console.error('Error parsing advancedFilters in system-variables:', e);
        }
      }
      
      vars.sort((a, b) => {
        let valA = a[sortBy];
        let valB = b[sortBy];
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });

      const totalCount = vars.length;

      if (!isExport && limit > 0) {
         const offset = (page - 1) * limit;
         vars = vars.slice(offset, offset + limit);
      }
      
      return { data: vars, total: totalCount, page, limit };
    } catch (err: any) {
      throw createError({ statusCode: 500, message: err.message });
    }
  }

  if (method === 'POST') {
    const body = await readBody(event);
    
    // BULK IMPORT LOGIC
    if (body.records && Array.isArray(body.records)) {
      let updatedCount = 0;
      let insertedCount = 0;
      
      for (const rec of body.records) {
        const key = String(rec?.key || '').trim();
        if (!key) continue;
        
        const target = String(rec.target || 'shared');
        const isPublic = target === 'api' ? 0 : ((rec.is_public === true || rec.is_public === 1) ? 1 : 0);
        const isSecret = (rec.is_secret === true || rec.is_secret === 1) ? 1 : 0;
        const type = String(rec.type || 'string');
        const desc = rec.description || null;
        const hashtags = Array.isArray(rec.hashtags) ? JSON.stringify(rec.hashtags) : (typeof rec.hashtags === 'string' ? rec.hashtags : '[]');
        
        let val: any = rec.value || '';
        const isMasked = (isSecret && val === '********');
        
        const existing = await sql.unsafe('SELECT id FROM system_variables WHERE key = ?', [key]);
        
        if (existing.length > 0) {
          if (isMasked) {
             await sql.unsafe(
               'UPDATE system_variables SET description = ?, target = ?, is_public = ?, is_secret = ?, type = ?, hashtags = ? WHERE key = ?',
               [desc, target, isPublic, isSecret, type, hashtags, key]
             );
          } else {
             await sql.unsafe(
               'UPDATE system_variables SET value = ?, description = ?, target = ?, is_public = ?, is_secret = ?, type = ?, hashtags = ? WHERE key = ?',
               [val, desc, target, isPublic, isSecret, type, hashtags, key]
             );
          }
          updatedCount++;
        } else {
          val = isMasked ? '' : val;
          await sql.unsafe(
            'INSERT INTO system_variables (key, value, description, target, is_public, is_secret, type, hashtags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [key, val, desc, target, isPublic, isSecret, type, hashtags]
          );
          insertedCount++;
        }
      }
      invalidateSysVarCache(event.context.tenantSlug);
      clearSandboxCache('mqtt_sandbox');
      return { success: true, message: 'success.importSuccessful' };
    }

    // SINGLE CREATE LOGIC
    if (!body.key) {
      throw createError({ statusCode: 400, message: 'errors.validationFailed' });
    }

    try {
      // Validate key format (only letters, numbers, underscores)
      if (!/^[a-zA-Z0-9_]+$/.test(body.key)) {
        throw createError({ statusCode: 400, message: 'errors.invalidKeyFormat' });
      }

      const target = body.target || 'shared';
      const isPublic = target === 'api' ? 0 : (body.is_public === true ? 1 : 0);
      const isSecret = body.is_secret === true ? 1 : 0;
      const type = body.type || 'string';
      const value = body.value || '';
      const hashtags = Array.isArray(body.hashtags) ? JSON.stringify(body.hashtags) : (typeof body.hashtags === 'string' ? body.hashtags : '[]');

      if (isSecret && value === '********') {
         throw createError({ statusCode: 400, message: 'errors.maskedSecretNotAllowed' });
      }

      await sql.unsafe(
        'INSERT INTO system_variables (key, value, description, target, is_public, is_secret, type, hashtags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [body.key, value, body.description || null, target, isPublic, isSecret, type, hashtags]
      );
      invalidateSysVarCache(event.context.tenantSlug);
      clearSandboxCache('mqtt_sandbox');
      return { success: true, message: 'message.saved' };
    } catch (err: any) {
      if (err.message?.includes('UNIQUE')) {
        throw createError({ statusCode: 400, message: 'errors.duplicateKey' });
      }
      throw createError({ statusCode: 500, message: err.message });
    }
  }
});
