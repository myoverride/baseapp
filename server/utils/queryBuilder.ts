import { isFilterGroup, type FilterGroup, type FilterCondition } from './filterEngine';

export function buildGenericFilter(group: FilterGroup, startIndex: number = 1): { fragment: string, params: any[] } {
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
            
            // Validate field name to prevent SQL injection
            if (!/^[a-zA-Z0-9_]+$/.test(field)) {
                return null;
            }

            if (operator === 'isEmpty') return `(${field} IS NULL OR ${field} = '')`;
            if (operator === 'isNotEmpty') return `(${field} IS NOT NULL AND ${field} != '')`;

            let normalizedValue = value;
            let normalizedValue2 = value2;

            if (field === 'hashtags') {
                if (typeof normalizedValue === 'string' && normalizedValue.startsWith('#')) {
                    normalizedValue = normalizedValue.substring(1);
                } else if (Array.isArray(normalizedValue)) {
                    normalizedValue = normalizedValue.map((v: any) => typeof v === 'string' && v.startsWith('#') ? v.substring(1) : v);
                }
            }

            if (normalizedValue === undefined || normalizedValue === null) return null;

            const pushParam = (v: any) => {
                params.push(v);
                return `?`;
            };

            switch (operator) {
                case 'equals':
                    return `${field} = ${pushParam(normalizedValue)}`;
                case 'notEquals':
                    return `${field} != ${pushParam(normalizedValue)}`;
                case 'contains':
                    return `${field} LIKE ${pushParam('%' + String(normalizedValue) + '%')}`;
                case 'notContains':
                    return `${field} NOT LIKE ${pushParam('%' + String(normalizedValue) + '%')}`;
                case 'startsWith':
                    return `${field} LIKE ${pushParam(String(normalizedValue) + '%')}`;
                case 'endsWith':
                    return `${field} LIKE ${pushParam('%' + String(normalizedValue))}`;
                case 'gt':
                    return `${field} > ${pushParam(normalizedValue)}`;
                case 'gte':
                    return `${field} >= ${pushParam(normalizedValue)}`;
                case 'lt':
                    return `${field} < ${pushParam(normalizedValue)}`;
                case 'lte':
                    return `${field} <= ${pushParam(normalizedValue)}`;
                case 'between':
                    if (normalizedValue2 === undefined || normalizedValue2 === null) return null;
                    return `${field} BETWEEN ${pushParam(normalizedValue)} AND ${pushParam(normalizedValue2)}`;
                case 'in':
                    if (!Array.isArray(normalizedValue) || normalizedValue.length === 0) return '1=0';
                    const inPlaceholders = normalizedValue.map(pushParam).join(', ');
                    return `${field} IN (${inPlaceholders})`;
                case 'notIn':
                    if (!Array.isArray(normalizedValue) || normalizedValue.length === 0) return '1=1';
                    const notInPlaceholders = normalizedValue.map(pushParam).join(', ');
                    return `${field} NOT IN (${notInPlaceholders})`;
                default:
                    return null;
            }
        }
    }

    const fragment = processCondition(group);
    return { fragment: fragment || '', params };
}
