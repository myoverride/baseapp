export type FilterOperator =
    | 'equals'
    | 'notEquals'
    | 'contains'
    | 'notContains'
    | 'startsWith'
    | 'endsWith'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'between'
    | 'isEmpty'
    | 'isNotEmpty'
    | 'in'
    | 'notIn';

export interface FilterCondition {
    field: string;
    operator: FilterOperator;
    value?: any;
    value2?: any; // Used for 'between'
}

export interface FilterGroup {
    logic: 'AND' | 'OR';
    isNot?: boolean;
    conditions: (FilterCondition | FilterGroup)[];
}

// Type guard
export function isFilterGroup(obj: any): obj is FilterGroup {
    return obj && typeof obj === 'object' && ('logic' in obj) && Array.isArray(obj.conditions);
}

/**
 * Translates our AST FilterGroup into a SQL WHERE clause fragment.
 * Supports accessing top level fields directly and nested fields inside a JSONB column if specified.
 * Returns { fragment: string, params: any[] } to be used with parameter injection (e.g., $1, $2)
 */
export interface BuildSqlFilterOptions {
    jsonbColumn?: string;
    schema?: any;
}

export function buildSqlFilter(group: FilterGroup, startIndex: number = 1, options?: BuildSqlFilterOptions): { fragment: string, params: any[] } {
    const params: any[] = [];
    let paramIndex = startIndex;

    function processCondition(condition: FilterCondition | FilterGroup): string | null {
        if (isFilterGroup(condition)) {
            const fragments = condition.conditions.map(processCondition).filter(c => c !== null);
            if (fragments.length === 0) return null;
            const groupFragment = `(${fragments.join(` ${condition.logic} `)})`;
            return condition.isNot ? `NOT ${groupFragment}` : groupFragment;
        } else {
            const { field, operator, value, value2 } = condition;
            
            // Define which fields are native columns vs jsonb properties
            const topLevelFields = ['id', 'entity_id', 'created_at', 'updated_at'];
            const isTopLevel = topLevelFields.includes(field);
            
            // Safely escape single quotes to prevent SQL injection on the JSON path key, while preserving spaces and special characters.
            const safeField = field.replace(/'/g, "''");
            const fieldSchema = options?.schema?.[field];
            const isRelation = fieldSchema?.type === 'relation';
            
            // EAV (record_fields) subquery for custom fields
            const sqlField = (!options?.jsonbColumn || isTopLevel) 
                ? safeField 
                : `(SELECT COALESCE(rf.val_str, rf.val_num, CASE WHEN rf.val_bool=1 THEN 'true' ELSE 'false' END) FROM record_fields rf WHERE rf.record_id = records.id AND rf.key = '${safeField}')`;

            const isJsonbProp = options?.jsonbColumn && !isTopLevel;
            const sqlFieldCasted = `${sqlField}`;

            if (operator === 'isEmpty') {
                return isJsonbProp 
                    ? `NOT EXISTS (SELECT 1 FROM record_fields rf WHERE rf.record_id = records.id AND rf.key = '${safeField}' AND (rf.val_str IS NOT NULL OR rf.val_num IS NOT NULL))`
                    : `(${sqlField} IS NULL OR ${sqlField} = '')`;
            }
            if (operator === 'isNotEmpty') {
                return isJsonbProp 
                    ? `EXISTS (SELECT 1 FROM record_fields rf WHERE rf.record_id = records.id AND rf.key = '${safeField}' AND (rf.val_str IS NOT NULL OR rf.val_num IS NOT NULL))`
                    : `(${sqlField} IS NOT NULL AND ${sqlField} != '')`;
            }

            if (value === undefined || value === null) return null;

            // Yardımcı: EAV alanları için EXISTS şablonu üretir.
            // ÖNEMLİ: SQLite'ın zayıf tip dönüşümünü korumak için val_num'u CAST(.. AS TEXT) YAPMIYORUZ.
            // Çünkü CAST(10.0 AS TEXT) '10.0' döner ve '10.0' = '10' string karşılaştırması FALSE çıkar.
            const buildExists = (opSql: string, valParams: any[]) => {
                if (!isJsonbProp) return null;
                const paramPlaceholders = valParams.map(v => {
                    params.push(v);
                    return `$${paramIndex++}`;
                });
                
                let finalOpSql = opSql;
                paramPlaceholders.forEach((p, i) => {
                    finalOpSql = finalOpSql.replace(`{${i}}`, p);
                });

                let targetColumn = 'rf.val_str';
                if (fieldSchema?.type === 'number') targetColumn = 'rf.val_num';
                else if (fieldSchema?.type === 'boolean') targetColumn = 'rf.val_bool';
                else if (typeof value === 'number') targetColumn = 'rf.val_num';
                else if (typeof value === 'boolean') targetColumn = 'rf.val_bool';

                if (isRelation && typeof value === 'string') {
                    const rf2TargetColumn = targetColumn.replace('rf.', 'rf2.');
                    return `EXISTS (
                        SELECT 1 FROM record_fields rf 
                        JOIN records r2 ON r2.id = CAST(rf.val_num AS INTEGER)
                        JOIN record_fields rf2 ON rf2.record_id = r2.id
                        WHERE rf.record_id = records.id 
                        AND rf.key = '${safeField}' 
                        AND (${rf2TargetColumn} ${finalOpSql})
                    )`;
                }

                return `EXISTS (SELECT 1 FROM record_fields rf WHERE rf.record_id = records.id AND rf.key = '${safeField}' AND (${targetColumn} ${finalOpSql}))`;
            };

            switch (operator) {
                case 'equals':
                    if (isJsonbProp) return buildExists('= {0}', [value]);
                    params.push(value);
                    return `(${sqlField} = $${paramIndex++})`;
                case 'notEquals':
                    if (isJsonbProp) return buildExists('!= {0}', [value]);
                    params.push(value);
                    return `(${sqlField} != $${paramIndex++})`;
                case 'contains':
                    if (isJsonbProp) return buildExists('LIKE {0}', [`%${value}%`]);
                    params.push(`%${value}%`);
                    return `(${sqlField} LIKE $${paramIndex++})`;
                case 'notContains':
                    if (isJsonbProp) return buildExists('NOT LIKE {0}', [`%${value}%`]);
                    params.push(`%${value}%`);
                    return `(${sqlField} NOT LIKE $${paramIndex++})`;
                case 'startsWith':
                    if (isJsonbProp) return buildExists('LIKE {0}', [`${value}%`]);
                    params.push(`${value}%`);
                    return `(${sqlField} LIKE $${paramIndex++})`;
                case 'endsWith':
                    if (isJsonbProp) return buildExists('LIKE {0}', [`%${value}`]);
                    params.push(`%${value}`);
                    return `(${sqlField} LIKE $${paramIndex++})`;
                case 'gt':
                    if (isJsonbProp) return buildExists('> {0}', [value]);
                    params.push(value);
                    return `(${sqlFieldCasted} > $${paramIndex++})`;
                case 'gte':
                    if (isJsonbProp) return buildExists('>= {0}', [value]);
                    params.push(value);
                    return `(${sqlFieldCasted} >= $${paramIndex++})`;
                case 'lt':
                    if (isJsonbProp) return buildExists('< {0}', [value]);
                    params.push(value);
                    return `(${sqlFieldCasted} < $${paramIndex++})`;
                case 'lte':
                    if (isJsonbProp) return buildExists('<= {0}', [value]);
                    params.push(value);
                    return `(${sqlFieldCasted} <= $${paramIndex++})`;
                case 'between':
                    if (value2 === undefined) return null;
                    if (isJsonbProp) return buildExists('BETWEEN {0} AND {1}', [value, value2]);
                    params.push(value);
                    params.push(value2);
                    return `(${sqlFieldCasted} BETWEEN $${paramIndex++} AND $${paramIndex++})`;
                case 'in': {
                    const arr = Array.isArray(value) ? value : [value];
                    if (arr.length === 0) return 'FALSE';
                    if (isJsonbProp) {
                        const inPlaceholders = arr.map((_, i) => `{${i}}`).join(', ');
                        return buildExists(`IN (${inPlaceholders})`, arr.map(String));
                    }
                    const inList = arr.map((v: any) => { params.push(String(v)); return `$${paramIndex++}`; }).join(', ');
                    return `(${sqlField} IN (${inList}))`;
                }
                case 'notIn': {
                    const arr2 = Array.isArray(value) ? value : [value];
                    if (arr2.length === 0) return 'TRUE';
                    if (isJsonbProp) {
                        const notInPlaceholders = arr2.map((_, i) => `{${i}}`).join(', ');
                        return buildExists(`NOT IN (${notInPlaceholders})`, arr2.map(String));
                    }
                    const notInList = arr2.map((v: any) => { params.push(String(v)); return `$${paramIndex++}`; }).join(', ');
                    return `(${sqlField} NOT IN (${notInList}))`;
                }
                default:
                    return null;
            }
        }
    }

    const fragment = processCondition(group);
    return { fragment: fragment || '', params };
}
