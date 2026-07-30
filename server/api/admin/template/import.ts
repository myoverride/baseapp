import { useDB } from '../../../utils/db';
import { invalidateSysVarCache } from '../../../utils/sysvars';
import { clearSandboxCache } from '../../../utils/sandbox';
import { invalidateEndpointCache } from '../../../utils/endpointManager';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (!body || !body.template || !body.template.components) {
    // If the format is slightly different, try to handle it
    if (body && body.components) {
      body.template = { components: body.components };
    } else {
      throw createError({ statusCode: 400, message: 'errors.invalidTemplate' });
    }
  }

  const sql = useDB(event.context.tenantSlug);
  const c = body.template.components;

  const results: any = { imported: {}, errors: [] };

  try {
    await sql.begin(async (tx: any) => {
      // Helper function for UPSERT based on a unique key
      const upsertTable = async (tableName: string, items: any[], uniqueKey: string) => {
        if (!items || items.length === 0) return;
        results.imported[tableName] = 0;
        
        for (const item of items) {
          try {
            const existing = await tx.unsafe(`SELECT id FROM ${tableName} WHERE ${uniqueKey} = $1`, [item[uniqueKey]]);
            
            const dataToSet = { ...item };
            delete dataToSet.id;
            delete dataToSet.created_at;
            
            if (existing.length > 0) {
              const id = existing[0].id;
              const setParts = [];
              const params = [];
              let i = 1;
              for (const [k, v] of Object.entries(dataToSet)) {
                setParts.push(`${k} = $${i}`);
                params.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
                i++;
              }
              params.push(id);
              await tx.unsafe(`UPDATE ${tableName} SET ${setParts.join(', ')} WHERE id = $${i}`, params);
            } else {
              const keys = Object.keys(dataToSet);
              const values = keys.map(k => {
                const v = dataToSet[k];
                return typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
              });
              const placeholders = keys.map((_, idx) => `$${idx + 1}`);
              await tx.unsafe(`INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`, values);
            }
            results.imported[tableName]++;
          } catch (e: any) {
             results.errors.push(`${tableName} error: ` + e.message);
          }
        }
      };

      // Import in correct dependency order
      await upsertTable('entities', c.entities, 'slug');
      await upsertTable('system_variables', c.system_variables, 'key');
      await upsertTable('languages', c.languages, 'code');
      await upsertTable('translations', c.translations, 'key');
      await upsertTable('roles', c.roles, 'name');
      await upsertTable('utils', c.utils, 'name');
      await upsertTable('endpoints', c.endpoints, 'name');
      await upsertTable('workers', c.workers, 'name');
      await upsertTable('devices', c.devices, 'mac_address');
      await upsertTable('pages', c.pages, 'route_pattern');

      // Import records specially since they belong to entities
      if (c.records && c.records.length > 0) {
         results.imported.records = 0;
         for (const rec of c.records) {
            try {
               const entityRes = await tx.unsafe(`SELECT id FROM entities WHERE slug = $1`, [rec.entity_slug]);
               if (entityRes.length === 0) continue;
               const entityId = entityRes[0].id;
               
               const existingRec = await tx.unsafe(`SELECT id FROM records WHERE entity_id = $1 AND id = $2`, [entityId, rec.id]);
               if (existingRec.length > 0) {
                 await tx.unsafe(`UPDATE records SET user_id=$1, location_id=$2, device_id=$3, status=$4, hashtags=$5, updated_at=CURRENT_TIMESTAMP WHERE id=$6`, 
                   [rec.user_id, rec.location_id, rec.device_id, rec.status, JSON.stringify(rec.hashtags || []), rec.id]);
               } else {
                 await tx.unsafe(`INSERT INTO records (id, entity_id, user_id, location_id, device_id, status, hashtags) VALUES ($1, $2, $3, $4, $5, $6, $7)`, 
                   [rec.id, entityId, rec.user_id, rec.location_id, rec.device_id, rec.status, JSON.stringify(rec.hashtags || [])]);
               }
               
               if (rec.data) {
                 const fieldsData = typeof rec.data === 'string' ? JSON.parse(rec.data) : rec.data;
                 for (const [k, v] of Object.entries(fieldsData)) {
                    await tx.unsafe(`DELETE FROM record_fields WHERE record_id = $1 AND key = $2`, [rec.id, k]);
                    let val_str = null, val_num = null, val_bool = null;
                    if (typeof v === 'boolean') val_bool = v ? 1 : 0;
                    else if (typeof v === 'number') val_num = v;
                    else val_str = String(v);
                    
                    await tx.unsafe(`INSERT INTO record_fields (record_id, key, val_str, val_num, val_bool) VALUES ($1, $2, $3, $4, $5)`, 
                      [rec.id, k, val_str, val_num, val_bool]);
                 }
               }
               results.imported.records++;
            } catch (e: any) {
               results.errors.push(`records error: ` + e.message);
            }
         }
      }
    });
    
    // Clear caches
    await invalidateSysVarCache(event.context.tenantSlug);
    await clearSandboxCache(event.context.tenantSlug);
    invalidateEndpointCache(event.context.tenantSlug);

    return { success: true, message: 'success.templateImported', results };
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message });
  }
});
