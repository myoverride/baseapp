export const checkRequiredFieldsOnSchemaUpdate = async (sql: any, entityId: number, newSchema: any) => {
  // Check if there are any records first
  const countRes = await sql.unsafe(`SELECT COUNT(*) as count FROM records WHERE entity_id = $1`, [entityId]);
  const count = parseInt(countRes[0]?.count || '0', 10);
  if (count === 0) return; // No records, safe to add required fields.

  const getLabel = (lbl: any, fallback: string) => {
    if (!lbl) return fallback;
    if (typeof lbl === 'string') {
      try { 
        const parsed = JSON.parse(lbl); 
        return parsed.tr || parsed.en || fallback; 
      } catch { 
        return lbl; 
      }
    }
    return lbl.tr || lbl.en || fallback;
  };

  for (const [fieldName, config] of Object.entries(newSchema) as any) {
    if (config.rules?.required) {
      const fieldLabel = getLabel(config.label, fieldName);

      if (config.type === 'boolean') {
         // Must have a record_fields entry with val_bool = 1
         const res = await sql.unsafe(`
           SELECT r.id FROM records r 
           WHERE r.entity_id = $1 
             AND NOT EXISTS (
               SELECT 1 FROM record_fields rf 
               WHERE rf.record_id = r.id AND rf.key = $2 AND rf.val_bool IS NOT NULL
             )
           LIMIT 1
         `, [entityId, fieldName]);
         
         if (res.length > 0) {
           const err: any = new Error('errors.requiredFieldMissingInOldRecords');
           err.statusCode = 400;
           throw err;
         }
      } else if (config.type === 'string' || config.type === 'password' || config.type === 'date' || config.type === 'time') {
         // Must have val_str != '' AND val_str IS NOT NULL
         const res = await sql.unsafe(`
           SELECT r.id FROM records r 
           WHERE r.entity_id = $1 
             AND NOT EXISTS (
               SELECT 1 FROM record_fields rf 
               WHERE rf.record_id = r.id AND rf.key = $2 AND rf.val_str IS NOT NULL AND rf.val_str != ''
             )
           LIMIT 1
         `, [entityId, fieldName]);
         
         if (res.length > 0) {
           const err: any = new Error('errors.requiredFieldMissingInOldRecords');
           err.statusCode = 400;
           throw err;
         }
      } else if (config.type === 'number' || config.type === 'relation') {
         // Must have val_num IS NOT NULL
         const res = await sql.unsafe(`
           SELECT r.id FROM records r 
           WHERE r.entity_id = $1 
             AND NOT EXISTS (
               SELECT 1 FROM record_fields rf 
               WHERE rf.record_id = r.id AND rf.key = $2 AND rf.val_num IS NOT NULL
             )
           LIMIT 1
         `, [entityId, fieldName]);
         
         if (res.length > 0) {
           const err: any = new Error('errors.requiredFieldMissingInOldRecords');
           err.statusCode = 400;
           throw err;
         }
      } else {
         // For json/array/etc., must not be empty array/object
         const res = await sql.unsafe(`
           SELECT r.id FROM records r 
           WHERE r.entity_id = $1 
             AND NOT EXISTS (
               SELECT 1 FROM record_fields rf 
               WHERE rf.record_id = r.id AND rf.key = $2 AND rf.val_str IS NOT NULL AND rf.val_str != '' AND rf.val_str != '[]' AND rf.val_str != '{}'
             )
           LIMIT 1
         `, [entityId, fieldName]);
         
         if (res.length > 0) {
           const err: any = new Error('errors.requiredFieldMissingInOldRecords');
           err.statusCode = 400;
           throw err;
         }
      }
    }
  }
};

export const checkUniqueFieldsOnSchemaUpdate = async (sql: any, entityId: number, newSchema: any) => {
  // Veritabanında kayıt var mı kontrolü
  const countRes = await sql.unsafe(`SELECT COUNT(*) as count FROM records WHERE entity_id = $1`, [entityId]);
  const count = parseInt(countRes[0]?.count || '0', 10);
  if (count <= 1) return; // 0 veya 1 kayıt varsa çakışma (duplicate) olamaz.

  for (const [fieldName, config] of Object.entries(newSchema) as any) {
    if (config.rules?.unique) {
      let valColumn = 'val_str';
      if (config.type === 'number' || config.type === 'relation') {
        valColumn = 'val_num';
      } else if (config.type === 'boolean') {
        valColumn = 'val_bool';
      }

      // Check if there are duplicate values for this field across all records of this entity
      const res = await sql.unsafe(`
        SELECT rf.${valColumn} as val, COUNT(*) as cnt
        FROM record_fields rf
        JOIN records r ON rf.record_id = r.id
        WHERE r.entity_id = $1 AND rf.key = $2 AND rf.${valColumn} IS NOT NULL
        GROUP BY rf.${valColumn}
        HAVING COUNT(*) > 1
        LIMIT 1
      `, [entityId, fieldName]);

      if (res.length > 0) {
        const err: any = new Error('errors.uniqueConstraintViolationInOldRecords|' + fieldName);
        err.statusCode = 400;
        throw err;
      }
    }
  }
};
