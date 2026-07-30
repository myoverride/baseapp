type OnDeletePolicy = 'restrict' | 'cascade' | 'setnull';

type RelationRule = {
  sourceEntityId: number;
  fieldName: string;
  onDelete: OnDeletePolicy;
};

const normalizeOnDelete = (raw: any, required: boolean): OnDeletePolicy => {
  const value = String(raw || '').toLowerCase();
  const normalized: OnDeletePolicy = value === 'cascade' || value === 'setnull' ? (value as OnDeletePolicy) : 'restrict';

  // Required relation cannot be setnull.
  if (required && normalized === 'setnull') return 'restrict';
  return normalized;
};

const parseSchemaObject = (schema: any): Record<string, any> => {
  if (!schema) return {};
  if (typeof schema === 'object') return schema as Record<string, any>;
  if (typeof schema !== 'string') return {};
  try {
    const parsed = JSON.parse(schema);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const validateRelationSchemaPolicies = (schema: any) => {
  const schemaObj = parseSchemaObject(schema);

  for (const [fieldName, fieldDef] of Object.entries(schemaObj)) {
    const def = fieldDef as any;
    if (def?.type !== 'relation') continue;

    const required = !!def?.rules?.required;
    const onDelete = String(def?.onDelete || 'restrict').toLowerCase();

    if (required && onDelete === 'setnull') {
      const err: any = new Error(`${fieldName} alanında required=true iken onDelete=setnull kullanılamaz.`);
      err.statusCode = 400;
      throw err;
    }
  }
};

export const buildIncomingRelationPolicyMap = async (sql: any) => {
  const entities = await sql`SELECT id, schema FROM entities`;
  const map = new Map<number, RelationRule[]>();

  for (const entity of entities as any[]) {
    const sourceEntityId = Number(entity.id);
    const schemaObj = parseSchemaObject(entity.schema);

    for (const [fieldName, fieldDef] of Object.entries(schemaObj)) {
      const def = fieldDef as any;
      if (def?.type !== 'relation' || !def?.targetEntityId) continue;

      const targetEntityId = Number(def.targetEntityId);
      if (!Number.isFinite(targetEntityId)) continue;

      const onDelete = normalizeOnDelete(def.onDelete, !!def?.rules?.required);
      const current = map.get(targetEntityId) || [];
      current.push({ sourceEntityId, fieldName, onDelete });
      map.set(targetEntityId, current);
    }
  }

  return map;
};

const getReferencingRecordIds = async (sql: any, sourceEntityId: number, fieldName: string, targetRecordId: number) => {
  const rows = await sql.unsafe(
    `
      SELECT r.id
      FROM records r
      JOIN record_fields rf ON rf.record_id = r.id
      WHERE r.entity_id = $1
        AND rf.key = $2
        AND rf.val_num = $3
    `,
    [sourceEntityId, fieldName, targetRecordId]
  );

  return (rows as any[]).map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
};

const nullifyReferences = async (sql: any, sourceEntityId: number, fieldName: string, targetRecordId: number) => {
  await sql.unsafe(
    `
      UPDATE record_fields
      SET val_num = NULL,
          val_str = NULL,
          val_bool = NULL
      WHERE id IN (
        SELECT rf.id
        FROM record_fields rf
        JOIN records r ON r.id = rf.record_id
        WHERE r.entity_id = $1
          AND rf.key = $2
          AND rf.val_num = $3
      )
    `,
    [sourceEntityId, fieldName, targetRecordId]
  );
};

export const deleteRecordWithRelationPolicy = async (
  sql: any,
  targetEntityId: number,
  targetRecordId: number,
  policyMap?: Map<number, RelationRule[]>
) => {
  const rulesMap = policyMap || (await buildIncomingRelationPolicyMap(sql));
  
  const toDelete = new Set<string>(); // "entityId:recordId"
  const toNullify = new Map<string, { sourceEntityId: number, fieldName: string, targetRecordId: number }[]>();
  
  const queue = [{ entityId: targetEntityId, recordId: targetRecordId }];
  
  while (queue.length > 0) {
    const { entityId, recordId } = queue.shift()!;
    const visitKey = `${entityId}:${recordId}`;
    
    if (toDelete.has(visitKey)) continue;
    toDelete.add(visitKey);
    
    const incomingRules = rulesMap.get(entityId) || [];
    for (const rule of incomingRules) {
      const refRecordIds = await getReferencingRecordIds(sql, rule.sourceEntityId, rule.fieldName, recordId);
      if (refRecordIds.length === 0) continue;
      
      if (rule.onDelete === 'restrict') {
        const err: any = new Error(
          `Silme engellendi: ${rule.sourceEntityId} varlığındaki ${rule.fieldName} ilişkisi bu kaydı kullanıyor.`
        );
        err.statusCode = 409;
        throw err;
      }
      
      if (rule.onDelete === 'setnull') {
        const list = toNullify.get(visitKey) || [];
        list.push({ sourceEntityId: rule.sourceEntityId, fieldName: rule.fieldName, targetRecordId: recordId });
        toNullify.set(visitKey, list);
      } else if (rule.onDelete === 'cascade') {
        for (const refId of refRecordIds) {
          queue.push({ entityId: rule.sourceEntityId, recordId: refId });
        }
      }
    }
  }

  // 1. Execute Nullify Operations
  for (const [_, nullifyList] of toNullify.entries()) {
    for (const req of nullifyList) {
      await nullifyReferences(sql, req.sourceEntityId, req.fieldName, req.targetRecordId);
    }
  }

  // 2. Batch Deletes (I/O Darboğazını ve Lock durumunu engellemek için transactionSync kullan)
  const deleteItems = Array.from(toDelete);
  const queries: {query: string, params: any[]}[] = [];
  
  for (const item of deleteItems) {
     const [eId, rId] = item.split(':');
     queries.push({ query: `DELETE FROM records WHERE id = $1 AND entity_id = $2`, params: [Number(rId), Number(eId)] });
  }

  if (sql.transactionSync && queries.length > 0) {
     sql.transactionSync(queries);
  } else {
     for (const q of queries) {
       await sql.unsafe(q.query, q.params);
     }
  }
};

export const deleteEntityWithRelationPolicy = async (sql: any, targetEntityId: number) => {
  const rulesMap = await buildIncomingRelationPolicyMap(sql);
  const records = await sql.unsafe(`SELECT id FROM records WHERE entity_id = $1`, [targetEntityId]);

  for (const row of records as any[]) {
    const recordId = Number(row.id);
    if (!Number.isFinite(recordId)) continue;
    await deleteRecordWithRelationPolicy(sql, targetEntityId, recordId, rulesMap);
  }

  await sql.unsafe(`DELETE FROM entities WHERE id = $1`, [targetEntityId]);
};
