type FilterOperator =
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
