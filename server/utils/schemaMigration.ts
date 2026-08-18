import { useDB } from './db';

/**
 * Mevcut Entity kayıtlarını yeni Schema'ya göre uygun hale getirir.
 * Eksik alanları tamamlar, gereksizleri siler ve tipleri dönüştürür.
 */
export async function migrateRecordsToNewSchema(tenantSlug: string, entityId: number, oldSchema: any, newSchema: any) {
  const sql = useDB(tenantSlug);
  
  const records = await sql.unsafe(`SELECT id FROM records WHERE entity_id = ?`, [entityId]);
  
  if (!records || records.length === 0) return;
  
  const newFields = Object.keys(newSchema);
  let queries: { query: string; params: any[] }[] = [];
  const BATCH_SIZE = 500;
  
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const chunk = records.slice(i, i + BATCH_SIZE);
    const chunkIds = chunk.map((r: any) => Number(r.id));
    if (chunkIds.length === 0) continue;

    const placeholders = chunkIds.map(() => '?').join(', ');
    const allFields = await sql.unsafe(
      `SELECT record_id, key, val_str, val_num, val_bool FROM record_fields WHERE record_id IN (${placeholders})`, 
      chunkIds
    );

    const fieldsByRecord = new Map<number, any[]>();
    for (const f of allFields) {
      const rId = Number(f.record_id);
      if (!fieldsByRecord.has(rId)) fieldsByRecord.set(rId, []);
      fieldsByRecord.get(rId)!.push(f);
    }

    for (const record of chunk) {
      const recordId = Number(record.id);
      const fields = fieldsByRecord.get(recordId) || [];
      const data: any = {};
      for (const f of fields) {
        if (f.val_str !== null) data[f.key] = f.val_str;
        else if (f.val_num !== null) data[f.key] = f.val_num;
        else if (f.val_bool !== null) data[f.key] = f.val_bool ? true : false;
      }
      
      const migratedData: any = {};
      
      for (const fieldName of newFields) {
        const config = newSchema[fieldName];
        const oldVal = data[fieldName];
        
        if (oldVal !== undefined) {
          if (config.type === 'number' && typeof oldVal !== 'number') {
             migratedData[fieldName] = Number(oldVal) || 0;
          } else if (config.type === 'boolean' && typeof oldVal !== 'boolean') {
             if (typeof oldVal === 'string') {
               migratedData[fieldName] = oldVal.toLowerCase() !== 'false' && oldVal !== '0' && oldVal !== '';
             } else {
               migratedData[fieldName] = Boolean(oldVal);
             }
          } else {
             migratedData[fieldName] = oldVal;
          }
        } else {
          migratedData[fieldName] = null;
        }
      }
      
      queries.push({ query: `DELETE FROM record_fields WHERE record_id = ?`, params: [recordId] });
      
      for (const [k, v] of Object.entries(migratedData)) {
        if (v === null || v === undefined) continue;
        
        let valStr = null;
        let valNum = null;
        let valBool = null;
        
        if (typeof v === 'boolean') valBool = v ? 1 : 0;
        else if (typeof v === 'number') valNum = v;
        else if (typeof v === 'object') valStr = JSON.stringify(v);
        else valStr = String(v);
        
        queries.push({
          query: `INSERT INTO record_fields (record_id, key, val_str, val_num, val_bool) VALUES (?, ?, ?, ?, ?)`,
          params: [recordId, k, valStr, valNum, valBool]
        });
      }
      
      queries.push({ query: `UPDATE records SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params: [recordId] });
    }

    if (sql.transactionSync) {
      await sql.transactionSync(queries);
    } else {
      for (const q of queries) {
        await sql.unsafe(q.query, q.params);
      }
    }
    queries = [];
  }
  
  console.log(`[OK] [Migration] Entity ID ${entityId} için ${records.length} kayıt yeni şemaya (EAV) göre güncellendi.`);
}
