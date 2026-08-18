export const resolveRecordTitle = async (
  sql: any,
  entityId: number,
  recordId: number,
  depth: number = 0,
  preloadedData?: Record<string, any>
): Promise<string> => {
  if (depth > 3) return `[Depth Limit Reached] ID: ${recordId}`;
  if (!recordId) return '';

  try {
    // 1. Get the schema for the entity
    const targetRes = await sql`SELECT slug, schema FROM entities WHERE id = ${entityId}`;
    if (targetRes.length === 0) return `ID: ${recordId}`;
    
    const targetEntity = targetRes[0];
    let schema: Record<string, any> = {};
    if (typeof targetEntity.schema === 'string') {
      try { schema = JSON.parse(targetEntity.schema); } catch {}
    } else {
      schema = targetEntity.schema || {};
    }

    // 2. Determine the primary keys
    const schemaEntries = Object.entries(schema).sort((a: any, b: any) => {
      const oA = a[1]._order !== undefined ? a[1]._order : 999;
      const oB = b[1]._order !== undefined ? b[1]._order : 999;
      return oA - oB;
    });

    let primaryKeys = schemaEntries.filter(([, config]: any) => config.isPrimary === true).map(([k]) => k);
    
    if (primaryKeys.length === 0) {
      let fallbackKey = schemaEntries[0] ? schemaEntries[0][0] : null;
      if (fallbackKey && schema[fallbackKey] && schema[fallbackKey]._order === undefined) {
         const smartKey = schemaEntries.find(([k]) => ['envanter kodu', 'ad', 'name', 'title', 'label', 'ad soyad', 'isim', 'makine modeli'].includes(k.toLowerCase()))?.[0];
         if (smartKey) fallbackKey = smartKey;
      }
      if (fallbackKey) primaryKeys = [fallbackKey];
    }

    if (primaryKeys.length === 0) return `ID: ${recordId}`;

    // 3. Get the data for the primary keys
    let data = preloadedData;
    if (!data) {
      // Dynamic IN clause requires sql.unsafe in Postgres/Postgres.js or similar query builder
      // Using unsafe with mapped params
      const params = [recordId, ...primaryKeys];
      const placeholders = primaryKeys.map((_, i) => `$${i + 2}`).join(', ');
      const fieldsRes = await sql.unsafe(
        `SELECT key, val_str, val_num, val_bool FROM record_fields WHERE record_id = $1 AND key IN (${placeholders})`,
        params
      );
      
      data = {};
      for (const f of fieldsRes) {
        if (f.val_str !== null) data[f.key] = f.val_str;
        else if (f.val_num !== null) data[f.key] = f.val_num;
        else if (f.val_bool !== null) data[f.key] = f.val_bool === 1;
      }
    }

    // 4. Resolve each primary key value
    const resolvedValues: string[] = [];
    for (const key of primaryKeys) {
      const config = schema[key];
      const val = data[key];
      
      if (val === undefined || val === null || val === '') continue;

      if (config.type === 'relation' && config.targetEntityId) {
        // Recursive resolution
        const resolvedRel = await resolveRecordTitle(sql, Number(config.targetEntityId), Number(val), depth + 1);
        resolvedValues.push(resolvedRel);
      } else {
        resolvedValues.push(String(val));
      }
    }

    return resolvedValues.length > 0 ? resolvedValues.join(' | ') : `ID: ${recordId}`;
    
  } catch (e) {
    console.error(`Failed to resolve title for entity ${entityId}, record ${recordId}`, e);
    return `ID: ${recordId}`;
  }
};
