import { useDB, TenantEventManager } from '../../../utils/db';
import { invalidateSysVarCache } from '../../../utils/sysvars';
import { clearSandboxCache, clearAllSandboxCache } from '../../../utils/sandbox';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (!body || !body.components || !body.tag) {
    throw createError({ statusCode: 400, message: 'errors.invalidAppPackage' });
  }

  const sql = useDB(event.context.tenantSlug);
  const tag = body.tag;
  const c = body.components;
  const results: any = { imported: {}, errors: [] };

  try {
    await sql.begin(async (tx: any) => {

      // Helper function for UPSERT based on a unique key
      const upsertTable = async (tableName: string, items: any[], uniqueKey: string) => {
        if (!items || items.length === 0) return;
        results.imported[tableName] = 0;
        
        for (const item of items) {
          try {
            // Check if exists
            const existing = await tx.unsafe(`SELECT * FROM ${tableName} WHERE ${uniqueKey} = $1`, [item[uniqueKey]]);
            
            // Prepare data excluding id, created_at
            const dataToSet = { ...item };
            delete dataToSet.id;
            delete dataToSet.created_at;
            // Also delete generated fields that shouldn't be overridden blindly if needed
            
            if (existing.length > 0) {
              // Update
              const id = existing[0].id;
              const setParts = [];
              const params = [];
              let i = 1;
              for (const [k, v] of Object.entries(dataToSet)) {
                if (tableName === 'languages' && k === 'translations') {
                  // Merge translations instead of overwriting
                  const merged = { ...(typeof existing[0].translations === 'string' ? JSON.parse(existing[0].translations) : (existing[0].translations || {})), ...(typeof v === 'string' ? JSON.parse(v) : (v || {})) };
                  setParts.push(`${k} = $${i}`);
                  params.push(JSON.stringify(merged));
                } else {
                  setParts.push(`${k} = $${i}`);
                  params.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
                }
                i++;
              }
              params.push(id);
              await tx.unsafe(`UPDATE ${tableName} SET ${setParts.join(', ')} WHERE id = $${i}`, params);
            } else {
              // Insert
              const cols = Object.keys(dataToSet);
              const vals = Object.values(dataToSet).map(v => typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
              const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
              await tx.unsafe(`INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders})`, vals);
            }
            results.imported[tableName]++;
          } catch (e: any) {
             results.errors.push(`[${tableName}] ${item[uniqueKey]}: ${e.message}`);
          }
        }
      };

      // 1. DÜŞÜK BAĞIMLILIKLI TABLOLAR (AŞAMA 1)
      await upsertTable('system_variables', c.system_variables, 'key');
      await upsertTable('languages', c.languages, 'code');
      await upsertTable('translation_keys', c.translation_keys, 'key');
      await upsertTable('roles', c.roles, 'name');
      await upsertTable('utils', c.utils, 'key');

      // 2. VERİ MODELİ (AŞAMA 2)
      await upsertTable('entities', c.entities, 'slug');

      // Schema ilişkileri (targetEntitySlug -> targetEntityId) resolution (Tüm Entityler için)
      const allEntities = await tx.unsafe(`SELECT id, slug, schema FROM entities`);
      for (const ent of allEntities) {
         let schemaObj = typeof ent.schema === 'string' ? JSON.parse(ent.schema) : (ent.schema || {});
         let schemaUpdated = false;
         for (const [key, fieldDef] of Object.entries(schemaObj || {}) as [string, any][]) {
            if (fieldDef && fieldDef.type === 'relation' && fieldDef.targetEntitySlug) {
               const targetRes = await tx.unsafe(`SELECT id FROM entities WHERE slug = $1`, [fieldDef.targetEntitySlug]);
               if (targetRes.length > 0) {
                  fieldDef.targetEntityId = targetRes[0].id;
                  schemaUpdated = true;
               }
            }
         }
         if (schemaUpdated) {
            await tx.unsafe(`UPDATE entities SET schema = $1 WHERE id = $2`, [JSON.stringify(schemaObj), ent.id]);
         }
      }

      // Resolve role_id for users based on role_name if provided
      if (c.users && c.users.length > 0) {
        for (const u of c.users) {
          if (u.role_name) {
            const roleRes = await tx.unsafe(`SELECT id FROM roles WHERE name = $1`, [u.role_name]);
            if (roleRes.length > 0) {
              u.role_id = roleRes[0].id;
            }
            delete u.role_name;
          }
        }
      }
      await upsertTable('users', c.users, 'username');
      await upsertTable('devices', c.devices, 'device_id');

      // Records Import
      if (c.records && c.records.length > 0) {
        results.imported.records = 0;
        for (const rec of c.records) {
           // Find local entity ID
           const localEntity = await tx.unsafe(`SELECT id, schema FROM entities WHERE slug = $1`, [rec.entity_slug]);
           if (localEntity.length === 0) {
             results.errors.push(`[records] Entity bulunamadı: ${rec.entity_slug}`);
             continue;
           }
            const entityId = localEntity[0].id;
            const schema = typeof localEntity[0].schema === 'string' ? JSON.parse(localEntity[0].schema) : localEntity[0].schema;

           // To avoid duplicate records, let's check if a record with same entity_id, hashtags, and created_at exists
           // This is a naive way, but better than blindly inserting duplicates.
           const existingRecs = await tx.unsafe(`SELECT id FROM records WHERE entity_id = $1 AND created_at = $2`, [entityId, rec.created_at]);
           
           if (existingRecs.length === 0) {
              // Insert record
              const userId = event.context.user?.id || null;
              const res = await tx.unsafe(`INSERT INTO records (entity_id, hashtags, created_at, updated_at, created_by, updated_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, 
                 [entityId, JSON.stringify(rec.hashtags || []), rec.created_at, rec.updated_at, userId, userId]);
              const newRecId = res[0].id;

              // Insert fields
              if (rec.data) {
                const dataObj = typeof rec.data === 'string' ? JSON.parse(rec.data) : rec.data;
                for (const [fKey, fVal] of Object.entries(dataObj)) {
                   if (fVal === null || fVal === undefined) continue;
                   
                    let valStr = null, valNum = null, valBool = null;
                    // Detect type from schema
                    const fieldDef = schema[fKey];
                    if (fieldDef) {
                      if (fieldDef.type === 'number') valNum = Number(fVal);
                      else if (fieldDef.type === 'boolean') valBool = fVal === true || String(fVal) === 'true' ? 1 : 0;
                      else if (fieldDef.type === 'relation' && fieldDef.targetEntityId) {
                         // Resolve relation by searching the target entity for a matching string value
                         const relRes = await tx.unsafe(`SELECT record_id FROM record_fields rf JOIN records r ON r.id = rf.record_id WHERE r.entity_id = $1 AND rf.val_str = $2 LIMIT 1`, [fieldDef.targetEntityId, String(fVal)]);
                         if (relRes.length > 0) valNum = relRes[0].record_id;
                         else valNum = Number(fVal); // fallback
                      }
                      else valStr = String(fVal);
                    } else {
                      valStr = String(fVal);
                    }
                   
                   await tx.unsafe(`INSERT INTO record_fields (record_id, key, val_str, val_num, val_bool) VALUES ($1, $2, $3, $4, $5)`,
                      [newRecId, fKey, valStr, valNum, valBool]);
                }
              }
              results.imported.records++;
           } else {
              // Record already exists based on timestamp, skip.
           }
        }
      }

      // Process user_records if provided
      if (c.user_records && c.user_records.length > 0) {
        results.imported.user_records = 0;
        for (const ur of c.user_records) {
          // find user
          const uRes = await tx.unsafe(`SELECT id FROM users WHERE username = $1`, [ur.username]);
          if (uRes.length > 0) {
             // to find the record, we need to match it. Since record ids are dynamic, we match by entity_slug and a data field value
             const eRes = await tx.unsafe(`SELECT id FROM entities WHERE slug = $1`, [ur.entity_slug]);
             if (eRes.length > 0) {
                const rRes = await tx.unsafe(`SELECT record_id FROM record_fields rf JOIN records r ON r.id = rf.record_id WHERE r.entity_id = $1 AND rf.key = $2 AND rf.val_str = $3`, [eRes[0].id, ur.match_field, ur.match_value]);
                if (rRes.length > 0) {
                   await tx.unsafe(`INSERT OR IGNORE INTO user_records (user_id, record_id) VALUES ($1, $2)`, [uRes[0].id, rRes[0].record_id]);
                   results.imported.user_records++;
                }
             }
          }
        }
      }

      // Process device relations to records
      if (c.devices && c.devices.length > 0) {
        for (const dev of c.devices) {
          const devSchema = typeof dev.schema === 'string' ? JSON.parse(dev.schema) : (dev.schema || {});
          if (devSchema.target_entity_slug && devSchema.target_match_field) {
             const eRes = await tx.unsafe(`SELECT id FROM entities WHERE slug = $1`, [devSchema.target_entity_slug]);
             if (eRes.length > 0) {
                const rRes = await tx.unsafe(`SELECT record_id FROM record_fields rf JOIN records r ON r.id = rf.record_id WHERE r.entity_id = $1 AND rf.key = $2 AND rf.val_str = $3`, [eRes[0].id, devSchema.target_match_field, devSchema.target_match_value]);
                if (rRes.length > 0) {
                   devSchema.target_record_id = rRes[0].record_id;
                   delete devSchema.target_entity_slug;
                   delete devSchema.target_match_field;
                   delete devSchema.target_match_value;
                   await tx.unsafe(`UPDATE devices SET schema = $1 WHERE device_id = $2`, [JSON.stringify(devSchema), dev.device_id]);
                }
             }
          }
        }
      }

      // 4. İŞ MANTIĞI VE ARAYÜZ (AŞAMA 4)
      await upsertTable('endpoints', c.endpoints, 'name');
      await upsertTable('workers', c.workers, 'name');
      await upsertTable('pages', c.pages, 'route_pattern');

    });
  } catch (e: any) {
    return { success: false, message: 'error.importCritical', details: e.message };
  }

  // Clear caches after a successful import
  const tenantSlug = event.context.tenantSlug;
  invalidateSysVarCache(tenantSlug);
  clearAllSandboxCache();
  TenantEventManager.emit('tenant:evict', tenantSlug);

  if (results.errors.length > 0) {
    return { success: true, message: 'error.importWithErrors', errors: results.errors };
  }
  return { success: true, message: 'success.importSuccessful' };
});
