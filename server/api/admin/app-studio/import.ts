import { getTenantRefs, TenantEventManager } from '../../../utils/db';
import { invalidateEndpointCache } from '../../../utils/endpointManager';
import { globals } from '../../../utils/globalsManager';
import { clearSandboxCache, clearAllSandboxCache } from '../../../utils/sandbox';
import { importProgressMap } from '../../../utils/importProgressManager';
import { validateJS } from '../../../utils/codeValidator';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (!body || !body.components || !body.tag) {
    throw createError({ statusCode: 400, message: 'errors.invalidAppPackage' });
  }

  const query = getQuery(event);
  const importId = query.importId as string;

  const tenantSlug = event.context.tenantSlug;
  const refs = await getTenantRefs(tenantSlug);
  const db = refs.sqlite;

  const tag = body.tag;
  const c = body.components;
  const strategy = body.strategy || 'skip'; // 'skip' | 'overwrite' | 'newer' | 'abort'
  const results: any = { imported: {}, errors: [] };

  if (importId) {
    let totalItems = 0;
    if (c.globals) totalItems += c.globals.length;
    if (c.languages) totalItems += c.languages.length;
    if (c.translation_keys) totalItems += c.translation_keys.length;
    if (c.roles) totalItems += c.roles.length;
    if (c.entities) totalItems += c.entities.length;
    if (c.users) totalItems += c.users.length;
    if (c.devices) totalItems += c.devices.length;
    if (c.records) totalItems += c.records.length;
    if (c.user_records) totalItems += c.user_records.length;
    if (c.endpoints) totalItems += c.endpoints.length;
    if (c.workers) totalItems += c.workers.length;
    if (c.pages) totalItems += c.pages.length;
    importProgressMap.set(importId, { total: totalItems, processed: 0, errors: [], status: 'running' });
  }

  const incrementProgress = (count: number = 1) => {
    if (importId) {
      const p = importProgressMap.get(importId);
      if (p) p.processed += count;
    }
  };

  const addProgressError = (err: string) => {
    results.errors.push(err);
    if (importId) {
      const p = importProgressMap.get(importId);
      if (p) {
        p.errors.push(err);
        if (p.errors.length > 50) p.errors.shift();
      }
    }
  };

  try {
    // PRE-VALIDATION (ASYNC)
    if (c.endpoints) {
      for (const ep of c.endpoints) {
        if (ep.code) {
           try {
              await validateJS(ep.code, 'Endpoint: ' + ep.name);
           } catch(e: any) {
              throw new Error(`Geçersiz JS Kodu (Endpoint: ${ep.name}) - ${e.params?.msg || e.message}`);
           }
        }
      }
    }
    if (c.workers) {
      for (const w of c.workers) {
        if (w.code) {
           try {
              await validateJS(w.code, 'Worker: ' + w.name);
           } catch(e: any) {
              throw new Error(`Geçersiz JS Kodu (Worker: ${w.name}) - ${e.params?.msg || e.message}`);
           }
        }
      }
    }
    
    if (c.pages) {
      for (const p of c.pages) {
        if (p.script_content) {
          try {
            await validateJS(p.script_content, 'Page Script: ' + p.title);
          } catch(e: any) {
            throw new Error(`Geçersiz JS Kodu (Sayfa: ${p.title}) - ${e.params?.msg || e.message}`);
          }
        }
        if (p.template_string) {
          try {
            const { validateTemplate } = await import('../../../utils/codeValidator');
            await validateTemplate(p.template_string, p.script_content, 'Page Template: ' + p.title);
          } catch(e: any) {
            throw new Error(`Geçersiz Template Kodu (Sayfa: ${p.title}) - ${e.params?.msg || e.message}`);
          }
        }
      }
    }

    // MASSIVE TRANSACTION (SYNC)
    db.transaction(() => {
      const userId = event.context.user?.id || null;
      const isSystem = event.context.user?.is_super_admin ? 1 : 0;
      
      const upsertTable = (tableName: string, items: any[], uniqueKey: string) => {
        if (!items || items.length === 0) return;
        results.imported[tableName] = 0;

        for (const item of items) {
          incrementProgress();
          const stmtCheck = db.prepare(`SELECT * FROM ${tableName} WHERE ${uniqueKey} = ?`);
          const existing = stmtCheck.get(item[uniqueKey]) as any;

          if (existing) {
            if (strategy === 'abort') {
              throw new Error(`Çakışma tespit edildi (${tableName}: ${item[uniqueKey]}). İşlem iptal ediliyor.`);
            }
            if (strategy === 'skip') {
              continue;
            }
            if (strategy === 'newer') {
              if (item.updated_at && existing.updated_at && new Date(item.updated_at) <= new Date(existing.updated_at)) {
                continue; // Mevcut olan daha yeni veya aynı, atla
              }
            }
          }

          const dataToSet = { ...item };
          delete dataToSet.id;
          delete dataToSet.created_at;
          delete dataToSet.protected;

          let transToInsert = null;
          if (tableName === 'languages' && dataToSet.translations !== undefined) {
             transToInsert = dataToSet.translations;
             delete dataToSet.translations;
          }

          dataToSet.updated_by = userId;
          dataToSet.system_modified = isSystem;

          if (existing) {
            const id = existing.id;
            const setParts = [];
            const params = [];
            for (const [k, v] of Object.entries(dataToSet)) {
              setParts.push(`${k} = ?`);
              params.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
            }
            params.push(id);
            db.prepare(`UPDATE ${tableName} SET ${setParts.join(', ')} WHERE id = ?`).run(...params);
          } else {
            dataToSet.created_by = userId;
            dataToSet.system_created = dataToSet.system_created !== undefined ? dataToSet.system_created : isSystem;

            const cols = Object.keys(dataToSet);
            const vals = Object.values(dataToSet).map(v => typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
            const placeholders = cols.map(() => '?').join(', ');
            db.prepare(`INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders})`).run(...vals);
          }
          
          if (tableName === 'languages' && transToInsert) {
             const parsedTrans = typeof transToInsert === 'string' ? JSON.parse(transToInsert) : transToInsert;
             if (Object.keys(parsedTrans).length > 0) {
                 const stmtInsertTrans = db.prepare(`
                    INSERT INTO translations (language_code, key, value, created_by, updated_by, system_created, system_modified)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(language_code, key) DO UPDATE SET
                    value = excluded.value, updated_by = excluded.updated_by, system_modified = excluded.system_modified, updated_at = CURRENT_TIMESTAMP
                 `);
                 for (const [tKey, tVal] of Object.entries(parsedTrans)) {
                     stmtInsertTrans.run(item.code, tKey, String(tVal), userId, userId, isSystem, isSystem);
                 }
             }
          }
          
          results.imported[tableName]++;
        }
      };

      // 1. DÜŞÜK BAĞIMLILIKLI TABLOLAR
      upsertTable('globals', c.globals, 'key');
      upsertTable('languages', c.languages, 'code');
      upsertTable('translation_keys', c.translation_keys, 'key');
      upsertTable('roles', c.roles, 'name');

      // 2. VERİ MODELİ
      upsertTable('entities', c.entities, 'slug');

      // Schema ilişkileri (targetEntitySlug -> targetEntityId) resolution
      const allEntities = db.prepare(`SELECT id, slug, schema FROM entities`).all() as any[];
      for (const ent of allEntities) {
        let schemaObj = typeof ent.schema === 'string' ? JSON.parse(ent.schema) : (ent.schema || {});
        let schemaUpdated = false;
        for (const [key, fieldDef] of Object.entries(schemaObj || {}) as [string, any][]) {
          if (fieldDef && fieldDef.type === 'relation' && fieldDef.targetEntitySlug) {
            const targetRes = db.prepare(`SELECT id FROM entities WHERE slug = ?`).get(fieldDef.targetEntitySlug) as any;
            if (targetRes) {
              fieldDef.targetEntityId = targetRes.id;
              delete fieldDef.targetEntitySlug;
              schemaUpdated = true;
            }
          }
        }
        if (schemaUpdated) {
          db.prepare(`UPDATE entities SET schema = ? WHERE id = ?`).run(JSON.stringify(schemaObj), ent.id);
        }
      }

      if (c.users && c.users.length > 0) {
        for (const u of c.users) {
          if (u.role_name) {
            const roleRes = db.prepare(`SELECT id FROM roles WHERE name = ?`).get(u.role_name) as any;
            if (roleRes) {
              u.role_id = roleRes.id;
            }
            delete u.role_name;
          }
        }
      }

      upsertTable('users', c.users, 'username');
      upsertTable('devices', c.devices, 'device_id');

      // Records Import
      if (c.records && c.records.length > 0) {
        results.imported.records = 0;

        // --- PERFORMANCE OPTIMIZATION: Cache Entity Primary Keys ---
        const entitySchemaCache = new Map<number, string | null>();
        const allEnts = db.prepare(`SELECT id, schema FROM entities`).all() as any[];
        for (const e of allEnts) {
            let pk = null;
            if (e.schema) {
                try {
                    const sc = typeof e.schema === 'string' ? JSON.parse(e.schema) : e.schema;
                    for (const [tk, tdef] of Object.entries(sc) as any) {
                         if (tdef.isPrimary) { pk = tk; break; }
                    }
                } catch(err) {}
            }
            entitySchemaCache.set(e.id, pk);
        }
        // -----------------------------------------------------------

        const entityCache = new Map<string, { id: number, schema: any }>();
        const getEntity = (slug: string) => {
          if (entityCache.has(slug)) return entityCache.get(slug);
          const localEntity = db.prepare(`SELECT id, schema FROM entities WHERE slug = ?`).get(slug) as any;
          if (localEntity) {
            const schema = typeof localEntity.schema === 'string' ? JSON.parse(localEntity.schema) : localEntity.schema;
            const val = { id: localEntity.id, schema };
            entityCache.set(slug, val);
            return val;
          }
          return null;
        };

        const stmtCheckRecord = db.prepare(`SELECT id, created_at, updated_at FROM records WHERE entity_id = ? AND created_at = ?`);
        const stmtInsertRecord = db.prepare(`INSERT INTO records (entity_id, hashtags, created_at, updated_at, created_by, updated_by, system_created, system_modified) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`);
        const stmtUpdateRecord = db.prepare(`UPDATE records SET hashtags = ?, updated_at = ?, updated_by = ?, system_modified = ? WHERE id = ?`);
        const stmtDeleteFields = db.prepare(`DELETE FROM record_fields WHERE record_id = ?`);
        const stmtInsertField = db.prepare(`INSERT INTO record_fields (record_id, key, val_str, val_num, val_bool) VALUES (?, ?, ?, ?, ?)`);
        const stmtResolveRel = db.prepare(`SELECT record_id FROM record_fields rf JOIN records r ON r.id = rf.record_id WHERE r.entity_id = ? AND rf.key = ? AND (rf.val_str = ? OR rf.val_num = ?) LIMIT 1`);

        for (const rec of c.records) {
          incrementProgress();
          const entity = getEntity(rec.entity_slug);
          if (!entity) {
            throw new Error('Entity bulunamadı: ' + rec.entity_slug);
          }

          const existingRecs = stmtCheckRecord.get(entity.id, rec.created_at) as any;
          
          if (existingRecs) {
             if (strategy === 'abort') {
                throw new Error(`Çakışma tespit edildi (Record: ${rec.entity_slug}). İşlem iptal ediliyor.`);
             }
             if (strategy === 'skip') {
                continue;
             }
             if (strategy === 'newer') {
                if (rec.updated_at && existingRecs.updated_at && new Date(rec.updated_at) <= new Date(existingRecs.updated_at)) {
                   continue;
                }
             }
          }

          let recId = existingRecs ? existingRecs.id : null;

          if (!recId) {
            const recSystemCreated = rec.system_created !== undefined ? rec.system_created : isSystem;
            const res = stmtInsertRecord.get(entity.id, JSON.stringify(rec.hashtags || []), rec.created_at, rec.updated_at, userId, userId, recSystemCreated, isSystem) as any;
            recId = res.id;
          } else {
            stmtUpdateRecord.run(JSON.stringify(rec.hashtags || []), rec.updated_at, userId, isSystem, recId);
            stmtDeleteFields.run(recId);
          }

          if (rec.data) {
            const dataObj = typeof rec.data === 'string' ? JSON.parse(rec.data) : rec.data;
            for (const [fKey, fVal] of Object.entries(dataObj)) {
              if (fVal === null || fVal === undefined) continue;

              let valStr = null, valNum = null, valBool = null;
              const fieldDef = entity.schema[fKey];

              if (fieldDef) {
                if (fieldDef.type === 'number') valNum = Number(fVal);
                else if (fieldDef.type === 'boolean') valBool = fVal === true || String(fVal) === 'true' ? 1 : 0;
                else if (fieldDef.type === 'relation' && fieldDef.targetEntityId) {
                  const targetKey = entitySchemaCache.get(fieldDef.targetEntityId);
                  
                  if (targetKey) {
                     const numericVal = !isNaN(Number(fVal)) ? Number(fVal) : null;
                     const relRes = stmtResolveRel.get(fieldDef.targetEntityId, targetKey, String(fVal), numericVal) as any;
                     if (relRes) valNum = relRes.record_id;
                     else valNum = Number(fVal);
                  } else {
                     valNum = Number(fVal);
                  }
                }
                else valStr = String(fVal);
              } else {
                valStr = String(fVal);
              }

              stmtInsertField.run(recId, fKey, valStr, valNum, valBool);
            }
          }
          results.imported.records++;
        }
      }

      // Process user_records if provided
      if (c.user_records && c.user_records.length > 0) {
        results.imported.user_records = 0;
        const stmtUser = db.prepare(`SELECT id FROM users WHERE username = ?`);
        const stmtEntity = db.prepare(`SELECT id FROM entities WHERE slug = ?`);
        const stmtRecordFields = db.prepare(`SELECT record_id FROM record_fields rf JOIN records r ON r.id = rf.record_id WHERE r.entity_id = ? AND rf.key = ? AND rf.val_str = ?`);
        const stmtInsertUserRecord = db.prepare(`INSERT OR IGNORE INTO user_records (user_id, record_id) VALUES (?, ?)`);

        for (const ur of c.user_records) {
          incrementProgress();
          const uRes = stmtUser.get(ur.username) as any;
          if (uRes) {
            const eRes = stmtEntity.get(ur.entity_slug) as any;
            if (eRes) {
              const rRes = stmtRecordFields.get(eRes.id, ur.match_field, ur.match_value) as any;
              if (rRes) {
                stmtInsertUserRecord.run(uRes.id, rRes.record_id);
                results.imported.user_records++;
              }
            }
          }
        }
      }

      // Process device relations to records
      if (c.devices && c.devices.length > 0) {
        const stmtEntity = db.prepare(`SELECT id FROM entities WHERE slug = ?`);
        const stmtRecordFields = db.prepare(`SELECT record_id FROM record_fields rf JOIN records r ON r.id = rf.record_id WHERE r.entity_id = ? AND rf.key = ? AND rf.val_str = ?`);
        const stmtUpdateDevice = db.prepare(`UPDATE devices SET schema = ? WHERE device_id = ?`);

        for (const dev of c.devices) {
          incrementProgress();
          const devSchema = typeof dev.schema === 'string' ? JSON.parse(dev.schema) : (dev.schema || {});
          if (devSchema.target_entity_slug && devSchema.target_match_field) {
            const eRes = stmtEntity.get(devSchema.target_entity_slug) as any;
            if (eRes) {
              const rRes = stmtRecordFields.get(eRes.id, devSchema.target_match_field, devSchema.target_match_value) as any;
              if (rRes) {
                devSchema.target_record_id = rRes.record_id;
                delete devSchema.target_entity_slug;
                delete devSchema.target_match_field;
                delete devSchema.target_match_value;
                stmtUpdateDevice.run(JSON.stringify(devSchema), dev.device_id);
              }
            }
          }
        }
      }

      // 4. İŞ MANTIĞI VE ARAYÜZ
      upsertTable('endpoints', c.endpoints, 'name');
      upsertTable('workers', c.workers, 'name');

      const pagesToInsert = c.pages ? c.pages.map((p: any) => {
        const newP = { ...p };
        delete newP.layout_title;
        return newP;
      }) : [];
      upsertTable('pages', pagesToInsert, 'title');

      // Resolve layout_title for pages
      if (c.pages && c.pages.length > 0) {
        const stmtPage = db.prepare(`SELECT id FROM pages WHERE title = ?`);
        const stmtUpdatePage = db.prepare(`UPDATE pages SET layout_id = ? WHERE title = ?`);

        for (const p of c.pages) {
          incrementProgress();
          if (p.layout_title) {
            const layoutRes = stmtPage.get(p.layout_title) as any;
            if (layoutRes) {
              stmtUpdatePage.run(layoutRes.id, p.title);
            }
          }
        }
      }
    })(); // Execute ALL as a single atomic transaction

  } catch (e: any) {
    if (importId) {
      const p = importProgressMap.get(importId);
      if (p) {
        p.status = 'failed';
        p.errors.push(e.message);
      }
    }
    // Return standard error response that the UI expects
    throw createError({ statusCode: 400, message: 'errors.importCritical', data: { details: e.message } });
  }

  globals.invalidate(tenantSlug);
  clearAllSandboxCache();
  TenantEventManager.emit('tenant:evict', tenantSlug);

  if (importId) {
    const p = importProgressMap.get(importId);
    if (p) p.status = 'completed';
  }

  invalidateEndpointCache(tenantSlug);
  clearAllSandboxCache();

  if (results.errors.length > 0) {
    return { success: true, message: 'errors.importWithErrors', errors: results.errors };
  }
  return { success: true, message: 'success.importSuccessful' };
});
