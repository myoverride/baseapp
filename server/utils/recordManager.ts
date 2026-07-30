import { useDB } from './db';
import { type FilterGroup, buildSqlFilter } from './filterEngine';
import { validateRecordData, checkUniqueConstraints } from './recordValidator';
import bcrypt from 'bcryptjs';

export const getRecords = async (tenantSlug: string, slug: string, query: any) => {
  const sql = useDB(tenantSlug || 'master');
  const entityResult = await sql`SELECT id, name, schema, hashtags FROM entities WHERE slug = ${slug}`;
  if (entityResult.length === 0) throw { statusCode: 404, message: 'error.entityNotFound' };
  const entity = entityResult[0] as any;

  const page = Math.max(1, parseInt(query.page as string) || 1);
  const limit = Math.max(1, parseInt(query.limit as string) || 10);
  const search = query.search as string || '';
  const filtersParam = (query.advancedFilters || query.filters) as string;
  const sortBy = query.sortBy as string || 'created_at';
  const sortOrder = (query.sortOrder as string || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const offset = (page - 1) * limit;

  const parsedSchema = (typeof entity.schema === 'string' && entity.schema.trim()) ? (() => { try { return JSON.parse(entity.schema); } catch { return {}; } })() : (entity.schema || {});

  for (const [key, field] of Object.entries(parsedSchema)) {
    const f = field as any;
    if (f.type === 'relation' && f.targetEntityId) {
      try {
        const targetRes = await sql`SELECT slug, schema FROM entities WHERE id = ${f.targetEntityId}`;
        if (targetRes.length > 0) {
          f.targetEntitySlug = targetRes[0].slug;
          f.targetEntitySchema = (typeof targetRes[0].schema === 'string' && targetRes[0].schema.trim()) ? (() => { try { return JSON.parse(targetRes[0].schema); } catch { return {}; } })() : (targetRes[0].schema || {});
        }
      } catch (e) {
        console.error(`Failed to load target entity info for relation ${key}`, e);
      }
    }
  }
  entity.schema = parsedSchema;

  let whereClause = `WHERE records.entity_id = $1`;
  const queryParams: any[] = [entity.id];
  let paramCount = 1;

  const reservedKeys = new Set(['page', 'limit', 'search', 'filters', 'advancedFilters', 'sortBy', 'sortOrder', 'tenantSlug']);
  for (let [k, v] of Object.entries(query || {})) {
    if (reservedKeys.has(k) || v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v = v[v.length - 1];

    if (['id', 'created_by', 'updated_by'].includes(k)) {
      paramCount++;
      whereClause += ` AND records.${k} = $${paramCount}`;
      queryParams.push(v);
    } else {
      const fieldDef = parsedSchema[k];
      if (!fieldDef) continue;

      let valCondition = `rf_custom.val_str = $${paramCount + 1}`;
      let valParam: any = String(v);

      if (fieldDef.type === 'number' || fieldDef.type === 'relation') {
        valCondition = `rf_custom.val_num = $${paramCount + 1}`;
        valParam = Number(v);
      } else if (fieldDef.type === 'boolean') {
        valCondition = `rf_custom.val_bool = $${paramCount + 1}`;
        valParam = v === 'true' || v === true || v === '1' || v === 1 ? 1 : 0;
      }
      paramCount++;
      whereClause += ` AND EXISTS (SELECT 1 FROM record_fields rf_custom WHERE rf_custom.record_id = records.id AND rf_custom.key = '${k}' AND ${valCondition})`;
      queryParams.push(valParam);
    }
  }

  if (search) {
    paramCount++;
    whereClause += ` AND EXISTS (
      SELECT 1 FROM record_fields rf_search 
      WHERE rf_search.record_id = records.id 
      AND (
        rf_search.val_str LIKE $${paramCount} 
        OR CAST(rf_search.val_num AS TEXT) LIKE $${paramCount}
        OR EXISTS (
            SELECT 1 FROM record_fields related_rf 
            WHERE related_rf.record_id = rf_search.val_num
            AND (related_rf.val_str LIKE $${paramCount} OR CAST(related_rf.val_num AS TEXT) LIKE $${paramCount})
        )
      )
    )`;
    queryParams.push(`%${search}%`);
  }

  if (filtersParam) {
    try {
      const filterAst = (typeof filtersParam === 'string' ? JSON.parse(filtersParam) : filtersParam) as FilterGroup;
      const sqlFilter = buildSqlFilter(filterAst, paramCount + 1, { jsonbColumn: 'data', schema: parsedSchema });

      if (sqlFilter.fragment) {
        whereClause += ` AND ${sqlFilter.fragment}`;
        queryParams.push(...sqlFilter.params);
        paramCount += sqlFilter.params.length;
      }
    } catch (e) {
      console.warn('Advanced filter parse error:', e);
    }
  }

  let orderClause = 'records.created_at DESC';
  let joinClause = '';
  if (['id', 'created_at', 'updated_at', 'createdAt', 'updatedAt'].includes(sortBy)) {
    orderClause = `records.${sortBy.replace('At', '_at')} ${sortOrder}`;
  } else if (sortBy && /^[\p{L}0-9_ \.\-]+$/u.test(sortBy)) {
    joinClause = `LEFT JOIN record_fields rf_sort ON records.id = rf_sort.record_id AND rf_sort.key = '${sortBy}'`;
    orderClause = `rf_sort.val_num ${sortOrder}, rf_sort.val_str ${sortOrder}`;
  }

  const [countRes, pagedRes] = await Promise.all([
    sql.unsafe(`SELECT COUNT(*) as count FROM records ${joinClause} ${whereClause}`, queryParams),
    sql.unsafe(`
      SELECT records.id, records.created_at, records.updated_at, records.hashtags, records.created_by, records.updated_by,
      (
        SELECT json_group_object(
            rf.key, 
            CASE 
              WHEN rf.val_str IS NOT NULL THEN rf.val_str 
              WHEN rf.val_num IS NOT NULL THEN rf.val_num 
              WHEN rf.val_bool IS NOT NULL THEN json(CASE WHEN rf.val_bool = 1 THEN 'true' ELSE 'false' END) 
            END
        )
        FROM record_fields rf WHERE rf.record_id = records.id
      ) as data
      FROM records
      ${joinClause}
      ${whereClause}
      ORDER BY ${orderClause} 
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `, [...queryParams, limit, offset])
  ]);

  const totalCount = parseInt((countRes[0] as any)?.count || '0');
  const secretKeys = Object.entries(parsedSchema || {})
    .filter(([_, def]: any) => def.type === 'password')
    .map(([k]) => k);

  const finalRecords = pagedRes.map((r: any) => {
    let parsedData: any = {};
    if (typeof r.data === 'string') {
      try { parsedData = JSON.parse(r.data); } catch { }
    } else {
      parsedData = r.data || {};
    }
    
    secretKeys.forEach((k: string) => {
      if (parsedData[k] !== undefined && parsedData[k] !== null && parsedData[k] !== '') {
        parsedData[k] = '********';
      }
    });

    let parsedHashtags = [];
    if (typeof r.hashtags === 'string' && r.hashtags.trim()) {
      try { parsedHashtags = JSON.parse(r.hashtags); } catch { }
    } else if (Array.isArray(r.hashtags)) {
      parsedHashtags = r.hashtags;
    }

    return {
      ...parsedData,
      id: r.id,
      hashtags: parsedHashtags,
      created_at: r.created_at,
      updated_at: r.updated_at,
      created_by: r.created_by,
      updated_by: r.updated_by
    };
  });

  return {
    entity: entity,
    records: finalRecords,
    total: totalCount,
    page: page,
    limit: limit
  };
};

export const createRecord = async (tenantSlug: string, slug: string, body: any, userId: any) => {
  const sql = useDB(tenantSlug || 'master');
  const entityResult = await sql`SELECT id, name, schema FROM entities WHERE slug = ${slug}`;
  if (entityResult.length === 0) throw { statusCode: 404, message: 'error.entityNotFound' };
  const entity = entityResult[0] as any;
  const parsedSchema = (typeof entity.schema === 'string' && entity.schema.trim()) ? (() => { try { return JSON.parse(entity.schema); } catch { return {}; } })() : (entity.schema || {});

  const validation = validateRecordData(body.data || {}, parsedSchema);
  if (!validation.isValid) {
    throw {
      statusCode: 400,
      statusMessage: 'error.validationError',
      message: validation.errors.map(e => e.message).join(' | '),
      data: validation.errors
    };
  }

  const uniqueError = await checkUniqueConstraints(sql, entity.id, parsedSchema, validation.processedPayload);
  if (uniqueError) {
    throw { statusCode: 400, message: uniqueError };
  }

  const safeData = validation.processedPayload;
  const passwordFields = Object.entries(parsedSchema || {}).filter(([_, def]: any) => def.type === 'password');
    
  for (const [key, _] of passwordFields as [string, any][]) {
    const val = safeData[key];
    if (val !== undefined && val !== null && val !== '') {
      safeData[key] = await bcrypt.hash(String(val), 10);
    }
  }

  return await sql.begin(async (tx: any) => {
    let recHashtagsArr = Array.isArray(body.hashtags) ? body.hashtags : [];
    const hashtags = JSON.stringify(recHashtagsArr);
    const userIdStr = userId ? String(userId) : null;

    const result = await tx.unsafe(`
      INSERT INTO records (entity_id, hashtags, created_by, updated_by) 
      VALUES ($1, $2, $3, $4) 
      RETURNING id, created_at, updated_at, created_by, updated_by
    `, [entity.id, hashtags, userIdStr, userIdStr]);

    const record = result[0];

    const placeholders: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(safeData)) {
      if (value === undefined || value === null) continue;
      let valStr = null, valNum = null, valBool = null;

      if (typeof value === 'boolean') valBool = value;
      else if (typeof value === 'number') valNum = value;
      else if (typeof value === 'object') valStr = JSON.stringify(value);
      else valStr = String(value);

      placeholders.push('(?, ?, ?, ?, ?)');
      params.push(record.id, key, valStr, valNum, valBool);
    }

    if (placeholders.length > 0) {
      await tx.unsafe(`
        INSERT INTO record_fields (record_id, key, val_str, val_num, val_bool)
        VALUES ${placeholders.join(', ')}
      `, params);
    }

    return {
      ...safeData,
      id: record.id,
      hashtags: recHashtagsArr,
      created_at: record.created_at,
      updated_at: record.updated_at,
      created_by: record.created_by,
      updated_by: record.updated_by
    };
  });
};

export const getRecord = async (tenantSlug: string, slug: string, id: any) => {
  const sql = useDB(tenantSlug || 'master');
  const entityResult = await sql`SELECT id, name, schema FROM entities WHERE slug = ${slug}`;
  if (entityResult.length === 0) throw { statusCode: 404, message: 'error.entityNotFound' };
  const entity = entityResult[0] as any;

  const [recordInfo] = await sql.unsafe(`SELECT created_at, updated_at, hashtags, created_by, updated_by FROM records WHERE id = ? AND entity_id = ?`, [id, entity.id]);
  if (!recordInfo) throw { statusCode: 404, message: 'error.recordNotFound' };

  const parsedSchema = (typeof entity.schema === 'string' && entity.schema.trim()) ? (() => { try { return JSON.parse(entity.schema); } catch { return {}; } })() : (entity.schema || {});
  const secretKeys = Object.entries(parsedSchema || {}).filter(([_, def]: any) => def.type === 'password').map(([k]) => k);

  const fields = await sql.unsafe(`SELECT key, val_str, val_num, val_bool FROM record_fields WHERE record_id = ?`, [id]);
  const data: any = {};
  fields.forEach((f: any) => {
    if (f.val_str !== null) data[f.key] = f.val_str;
    else if (f.val_num !== null) data[f.key] = f.val_num;
    else if (f.val_bool !== null) data[f.key] = (f.val_bool === 1 || f.val_bool === true);
  });

  secretKeys.forEach((k: string) => {
    if (data[k] !== undefined && data[k] !== null && data[k] !== '') {
      data[k] = '********';
    }
  });

  let parsedHashtags = [];
  if (typeof recordInfo.hashtags === 'string' && recordInfo.hashtags.trim()) {
    try { parsedHashtags = JSON.parse(recordInfo.hashtags); } catch { }
  } else if (Array.isArray(recordInfo.hashtags)) {
    parsedHashtags = recordInfo.hashtags;
  }

  return {
    ...data,
    id: id,
    created_at: recordInfo.created_at,
    updated_at: recordInfo.updated_at,
    created_by: recordInfo.created_by,
    updated_by: recordInfo.updated_by,
    hashtags: parsedHashtags
  };
};

export const updateRecord = async (tenantSlug: string, slug: string, id: any, body: any, userId: any) => {
  const sql = useDB(tenantSlug || 'master');
  const entityResult = await sql`SELECT id, name, schema FROM entities WHERE slug = ${slug}`;
  if (entityResult.length === 0) throw { statusCode: 404, message: 'error.entityNotFound' };
  const entity = entityResult[0] as any;

  const [recordInfo] = await sql.unsafe(`SELECT id FROM records WHERE id = ? AND entity_id = ?`, [id, entity.id]);
  if (!recordInfo) throw { statusCode: 404, message: 'error.recordNotFound' };

  const parsedSchema = (typeof entity.schema === 'string' && entity.schema.trim()) ? (() => { try { return JSON.parse(entity.schema); } catch { return {}; } })() : (entity.schema || {});
  const passwordFields = Object.entries(parsedSchema || {}).filter(([_, def]: any) => def.type === 'password');

  const restoredKeys = new Set<string>();
  if (passwordFields.length > 0 && body.data) {
    const keysToRestore = passwordFields.filter(([k]) => body.data[k] === '********').map(([k]) => k);
    if (keysToRestore.length > 0) {
      const oldFields = await sql.unsafe(`SELECT key, val_str FROM record_fields WHERE record_id = $1 AND key = ANY($2)`, [id, keysToRestore]);
      const oldValues: Record<string, string> = {};
      oldFields.forEach((f: any) => oldValues[f.key] = f.val_str);

      keysToRestore.forEach(k => {
        if (oldValues[k] !== undefined) {
          body.data[k] = oldValues[k];
          restoredKeys.add(k);
        } else {
          delete body.data[k];
        }
      });
    }
  }

  const validation = validateRecordData(body.data || {}, parsedSchema);
  if (!validation.isValid) {
    throw {
      statusCode: 400,
      statusMessage: 'error.validationError',
      message: validation.errors.map(e => e.message).join(' | '),
      data: validation.errors
    };
  }
  const uniqueError = await checkUniqueConstraints(sql, entity.id, parsedSchema, validation.processedPayload, id);
  if (uniqueError) throw { statusCode: 400, message: uniqueError };

  const safeData = validation.processedPayload;

  for (const [key, _] of passwordFields as [string, any][]) {
    const val = safeData[key];
    if (val !== undefined && val !== null && val !== '' && !restoredKeys.has(key)) {
      safeData[key] = await bcrypt.hash(String(val), 10);
    }
  }

  return await sql.begin(async (tx: any) => {
    let recHashtagsArr = Array.isArray(body.hashtags) ? body.hashtags : [];
    const hashtags = JSON.stringify(recHashtagsArr);
    const userIdStr = userId ? String(userId) : null;

    const result = await tx.unsafe(`
      UPDATE records 
      SET updated_at = CURRENT_TIMESTAMP, hashtags = $3, updated_by = $4
      WHERE id = $1 AND entity_id = $2 
      RETURNING id, created_at, updated_at, created_by, updated_by
    `, [id, entity.id, hashtags, userIdStr]);

    const record = result[0];
    await tx.unsafe(`DELETE FROM record_fields WHERE record_id = $1`, [id]);

    const placeholders: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(safeData)) {
      if (value === undefined || value === null) continue;
      let valStr = null, valNum = null, valBool = null;
      if (typeof value === 'boolean') valBool = value;
      else if (typeof value === 'number') valNum = value;
      else if (typeof value === 'object') valStr = JSON.stringify(value);
      else valStr = String(value);

      placeholders.push('(?, ?, ?, ?, ?)');
      params.push(record.id, key, valStr, valNum, valBool);
    }

    if (placeholders.length > 0) {
      await tx.unsafe(`
        INSERT INTO record_fields (record_id, key, val_str, val_num, val_bool)
        VALUES ${placeholders.join(', ')}
      `, params);
    }

    return {
      ...safeData,
      id: record.id,
      hashtags: recHashtagsArr,
      created_at: record.created_at,
      updated_at: record.updated_at,
      created_by: record.created_by,
      updated_by: record.updated_by
    };
  });
};

export const deleteRecord = async (tenantSlug: string, slug: string, id: any) => {
  const sql = useDB(tenantSlug || 'master');
  const entityResult = await sql`SELECT id FROM entities WHERE slug = ${slug}`;
  if (entityResult.length === 0) throw { statusCode: 404, message: 'error.entityNotFound' };
  const entity = entityResult[0] as any;

  const [recordInfo] = await sql.unsafe(`SELECT id FROM records WHERE id = ? AND entity_id = ?`, [id, entity.id]);
  if (!recordInfo) throw { statusCode: 404, message: 'error.recordNotFound' };

  const { deleteRecordWithRelationPolicy } = await import('./relationDeletePolicy');
  await deleteRecordWithRelationPolicy(sql, entity.id, Number(id));
  return { success: true };
};

export const bulkDeleteRecords = async (tenantSlug: string, slug: string, ids: string[]) => {
  if (!Array.isArray(ids) || ids.length === 0) return { success: false, message: 'error.noIdsProvided' };
  const sql = useDB(tenantSlug || 'master');
  const entityResult = await sql`SELECT id FROM entities WHERE slug = ${slug}`;
  if (entityResult.length === 0) throw { statusCode: 404, message: 'error.entityNotFound' };
  const entityId = entityResult[0].id;

  const { deleteRecordWithRelationPolicy } = await import('./relationDeletePolicy');
  let deletedCount = 0;
  for (const id of ids) {
    try {
      await deleteRecordWithRelationPolicy(sql, entityId, Number(id));
      deletedCount++;
    } catch (e) {
      console.warn('Toplu silme sirasinda hata (id: ' + id + '):', e);
    }
  }
  return { success: true, count: deletedCount };
};

export const bulkImportRecords = async (tenantSlug: string, slug: string, records: any[], userId: any) => {
  if (!Array.isArray(records)) return { success: false, message: 'error.recordsArrayExpected' };
  
  const sql = useDB(tenantSlug || 'master');
  const entityResult = await sql`SELECT id, schema FROM entities WHERE slug = ${slug}`;
  if (entityResult.length === 0) return { success: false, message: 'error.entityNotFound' };
  
  const entity = entityResult[0] as any;
  const parsedSchema = (typeof entity.schema === 'string' && entity.schema.trim()) ? (() => { try { return JSON.parse(entity.schema); } catch { return {}; } })() : (entity.schema || {});

  const relationFields: { [key: string]: number } = {};
  for (const [key, field] of Object.entries(parsedSchema)) {
    const f = field as any;
    if (f.type === 'relation' && f.targetEntityId) {
      relationFields[key] = f.targetEntityId;
    }
  }

  let insertedCount = 0;
  const errors: any[] = [];
  const validRecordsToInsert: any[] = [];

  // --- BATCHING PHASE: İlişki ve Unique kontrolleri için verileri tek seferde DB'den çek ---
  
  // 1. İlişki Değerlerini Topla
  const relationLookups = new Map<number, Set<string>>(); // targetEntityId -> Set<string values>
  for (const rec of records) {
    for (const [key, targetEntityId] of Object.entries(relationFields)) {
      const val = rec[key];
      if (val && typeof val === 'string' && isNaN(Number(val))) {
        if (!relationLookups.has(targetEntityId)) relationLookups.set(targetEntityId, new Set());
        relationLookups.get(targetEntityId)!.add(val);
      }
    }
  }

  // 2. İlişkileri Çöz (Batched SELECT)
  const resolvedRelations = new Map<number, Map<string, number>>(); // targetEntityId -> Map<string value, id>
  for (const [targetEntityId, valSet] of relationLookups.entries()) {
    const valArray = Array.from(valSet);
    if (valArray.length === 0) continue;
    
    const chunked = [];
    for (let i = 0; i < valArray.length; i += 500) chunked.push(valArray.slice(i, i + 500));
    
    const valueMap = new Map<string, number>();
    for (const chunk of chunked) {
      const placeholders = chunk.map(() => '?').join(', ');
      const rows = await sql.unsafe(`
        SELECT r.id, rf.val_str
        FROM records r
        JOIN record_fields rf ON r.id = rf.record_id
        WHERE r.entity_id = ? AND rf.val_str IN (${placeholders})
      `, [targetEntityId, ...chunk]);
      for (const row of (rows as any[])) {
        valueMap.set(row.val_str, Number(row.id));
      }
    }
    resolvedRelations.set(targetEntityId, valueMap);
  }

  // 3. Unique Kısıtlamalarını Topla (Batched SELECT)
  const uniqueKeys = Object.entries(parsedSchema).filter(([_, conf]: any) => conf.rules?.unique === true).map(([k]) => k);
  const existingUniqueValues = new Map<string, Set<any>>(); // key -> Set<values>
  
  if (uniqueKeys.length > 0) {
    for (const k of uniqueKeys) existingUniqueValues.set(k, new Set());
    
    const placeholders = uniqueKeys.map(() => '?').join(', ');
    const existing = await sql.unsafe(`
      SELECT rf.key, rf.val_str, rf.val_num, rf.val_bool
      FROM record_fields rf
      JOIN records r ON rf.record_id = r.id
      WHERE r.entity_id = ? AND rf.key IN (${placeholders})
    `, [entity.id, ...uniqueKeys]);
    
    for (const row of (existing as any[])) {
      const k = row.key;
      let val: any = null;
      if (row.val_str !== null) val = String(row.val_str);
      else if (row.val_num !== null) val = Number(row.val_num);
      else if (row.val_bool !== null) val = row.val_bool === 1 ? true : false;
      if (val !== null) existingUniqueValues.get(k)!.add(val);
    }
  }

  // --- AŞAMA 1: Validasyon ve Hashleme (Bellek Üzerinde) ---
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    try {
      // Bellekteki Map üzerinden ilişkileri çöz (N+1 engellendi)
      for (const [key, targetEntityId] of Object.entries(relationFields)) {
        const val = rec[key];
        if (val && typeof val === 'string' && isNaN(Number(val))) {
           const map = resolvedRelations.get(targetEntityId);
           if (map && map.has(val)) {
             rec[key] = map.get(val);
           } else {
             throw new Error(`'${key}' alanı için eşleşen kayıt bulunamadı: ${val}`);
           }
        }
      }

      const validation = validateRecordData(rec, parsedSchema);
      if (!validation.isValid) throw new Error(validation.errors.map(e => e.message).join(' | '));
      
      const safeData = validation.processedPayload;
      
      // Bellekteki Set üzerinden Unique kontrolü (N+1 engellendi)
      for (const k of uniqueKeys) {
        const val = safeData[k];
        if (val !== null && val !== undefined) {
          let normVal = val;
          if (typeof val === 'boolean') normVal = val;
          else if (typeof val === 'number') normVal = val;
          else normVal = String(val);
          
          if (existingUniqueValues.get(k)!.has(normVal)) {
            throw new Error(`error.uniqueConstraint|${k}`);
          }
          // İçe aktarılan diğer satırlarla çakışmayı önlemek için Set'e ekle
          existingUniqueValues.get(k)!.add(normVal); 
        }
      }
      
      const passwordFields = Object.entries(parsedSchema || {}).filter(([_, def]: any) => def.type === 'password');
      for (const [key, _] of passwordFields as [string, any][]) {
        const val = safeData[key];
        if (val !== undefined && val !== null && val !== '') {
          safeData[key] = await bcrypt.hash(String(val), 10);
        }
      }
      
      validRecordsToInsert.push({ originalRec: rec, safeData });
    } catch (e: any) {
      errors.push({
        row: i + 1,
        data: rec,
        reason: e.message || e.statusMessage || 'Bilinmeyen hata'
      });
      console.warn(`Toplu import hatasi (Satir ${i + 1}):`, e);
    }
  }

  // --- AŞAMA 2: Geçerli Kayıtları Veritabanına Yaz (Dev Transaction) ---
  if (validRecordsToInsert.length > 0) {
    await sql.begin(async (tx: any) => {
      const userIdStr = userId ? String(userId) : null;
      
      for (const item of validRecordsToInsert) {
        const { originalRec, safeData } = item;
        const recHashtagsArr = Array.isArray(originalRec.hashtags) ? originalRec.hashtags : [];
        const hashtags = JSON.stringify(recHashtagsArr);
        
        const result = await tx.unsafe(`
          INSERT INTO records (entity_id, hashtags, created_by, updated_by) 
          VALUES ($1, $2, $3, $4) 
          RETURNING id
        `, [entity.id, hashtags, userIdStr, userIdStr]);
        
        const recordId = result[0].id;
        const placeholders: string[] = [];
        const params: any[] = [];
        
        for (const [k, v] of Object.entries(safeData)) {
          if (v === undefined || v === null) continue;
          let valStr = null, valNum = null, valBool = null;
          
          if (typeof v === 'boolean') valBool = v ? 1 : 0;
          else if (typeof v === 'number') valNum = v;
          else if (typeof v === 'object') valStr = JSON.stringify(v);
          else valStr = String(v);

          placeholders.push('(?, ?, ?, ?, ?)');
          params.push(recordId, k, valStr, valNum, valBool);
        }
        
        if (placeholders.length > 0) {
          await tx.unsafe(`
            INSERT INTO record_fields (record_id, key, val_str, val_num, val_bool)
            VALUES ${placeholders.join(', ')}
          `, params);
        }
        
        insertedCount++;
      }
    });
  }
  
  return { 
    success: true, 
    count: insertedCount, 
    errors: errors.length > 0 ? errors : undefined 
  };
};
