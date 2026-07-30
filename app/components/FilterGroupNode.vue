<template>
  <div class="filter-group" :class="{ 'is-root': isRoot }">
    <div class="d-flex align-center mb-3">
      <v-btn-toggle
        v-model="localGroup.logic"
        density="compact"
        :color="color"
        variant="outlined"
        class="mr-4 logic-toggle"
        mandatory
        @update:modelValue="emitUpdate"
      >
        <v-btn value="AND">{{ $t("filter.operatorAnd") }}</v-btn>
        <v-btn value="OR">{{ $t("filter.operatorOr") }}</v-btn>
      </v-btn-toggle>

      <v-btn
        :color="localGroup.isNot ? 'error' : 'default'"
        variant="outlined"
        density="compact"
        class="mr-4"
        @click="localGroup.isNot = !localGroup.isNot; emitUpdate()"
      >
        {{ localGroup.isNot ? $t("filter.notActive") : $t("filter.not") }}
      </v-btn>

      <v-btn size="small" variant="tonal" :color="color" prepend-icon="mdi-plus" class="mr-2" @click="addRule">
        {{ $t("common.addRule") }}
      </v-btn>
      <v-btn size="small" variant="tonal" color="secondary" prepend-icon="mdi-format-list-group" @click="addGroup">
        {{ $t("filter.addGroup") }}
      </v-btn>

      <v-spacer></v-spacer>
      
      <v-btn v-if="!isRoot" icon="mdi-close" size="small" variant="text" color="error" @click="$emit('remove')" />
    </div>

    <div class="conditions-container pl-4 border-s-sm border-primary">
      <div v-for="(condition, index) in localGroup.conditions" :key="index" class="condition-item mb-2">
        
        <!-- Render Group -->
        <template v-if="'logic' in condition">
          <FilterGroupNode
            :group="condition"
            :columns="columns"
            @update="updateCondition(index, $event)"
            @remove="removeCondition(index)"
          />
        </template>

        <!-- Render Rule -->
        <template v-else>
          <div class="d-flex align-center gap-2 rule-row">
            <v-select
              v-model="condition.field"
              :items="columns"
              item-title="title"
              item-value="key"
              density="compact"
              variant="outlined"
              hide-details
              class="flex-1-1 field-select"
              @update:modelValue="onFieldChange(condition)"
            ></v-select>

            <v-select
              v-model="condition.operator"
              :items="getOperatorsForField(condition.field)"
              density="compact"
              variant="outlined"
              hide-details
              class="flex-1-1 op-select"
              @update:modelValue="onOperatorChange(condition)"
            ></v-select>

            <template v-if="!['isEmpty', 'isNotEmpty'].includes(condition.operator)">
              <template v-if="getFieldType(condition.field) === 'boolean'">
                <v-select
                  v-model="condition.value"
                  :items="booleanOptions"
                  density="compact"
                  variant="outlined"
                  hide-details
                  class="flex-1-1 val-input"
                  @update:modelValue="emitUpdate"
                ></v-select>
              </template>

              <template v-else>
                <v-text-field
                  :model-value="condition.value"
                  :type="getFieldInputType(condition.field)"
                  density="compact"
                  variant="outlined"
                  hide-details
                  class="flex-1-1 val-input"
                  :placeholder="condition.operator === 'between' ? 'Min' : $t('common.value')"
                  @update:modelValue="(val: any) => { condition.value = getFieldType(condition.field) === 'number' && val !== '' ? Number(val) : val; emitUpdate(); }"
                ></v-text-field>

                <v-text-field
                  v-if="condition.operator === 'between'"
                  :model-value="condition.value2"
                  :type="getFieldInputType(condition.field)"
                  density="compact"
                  variant="outlined"
                  hide-details
                  class="flex-1-1 val-input"
                  :placeholder="$t('field.filterMax')"
                  @update:modelValue="(val: any) => { condition.value2 = getFieldType(condition.field) === 'number' && val !== '' ? Number(val) : val; emitUpdate(); }"
                ></v-text-field>
              </template>
            </template>

            <v-btn icon="mdi-minus-circle-outline" size="small" variant="text" color="error" @click="removeCondition(index)" />
          </div>
        </template>

      </div>
      
      <div v-if="localGroup.conditions.length === 0" class="text-caption text-grey py-2">
        {{ $t('filter.noRules') }}
      </div>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  name: 'FilterGroupNode'
}
</script>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FilterGroup, FilterCondition } from '../utils/filterTypes'
const { primaryColor: color } = useSysVars();

interface Column {
  key: string
  title: string
  type?: string
}

const props = defineProps<{
  group: FilterGroup,
  columns: Column[],
  isRoot?: boolean
}>()

const emit = defineEmits(['update', 'remove'])

const { t } = useI18n()

const getFieldType = (fieldKey: string) => {
  const col = props.columns.find(c => c.key === fieldKey)
  return col?.type || 'string'
}

const operators = computed(() => [
  { title: t('filter.opEquals'), value: 'equals' },
  { title: t('filter.opNotEquals'), value: 'notEquals' },
  { title: t('filter.opContains'), value: 'contains' },
  { title: t('filter.opNotContains'), value: 'notContains' },
  { title: t('filter.opStartsWith'), value: 'startsWith' },
  { title: t('filter.opEndsWith'), value: 'endsWith' },
  { title: t('filter.opGt'), value: 'gt' },
  { title: t('filter.opLt'), value: 'lt' },
  { title: t('filter.opBetween'), value: 'between' },
  { title: t('filter.opIsEmpty'), value: 'isEmpty' },
  { title: t('filter.opIsNotEmpty'), value: 'isNotEmpty' }
])

const booleanOptions = computed(() => [
  { title: t('filter.true'), value: true },
  { title: t('filter.false'), value: false }
])

const localGroup = ref<FilterGroup>(JSON.parse(JSON.stringify(props.group)))

// Ensure isFilterGroup is defined for the sanitize loop
function isFilterGroup(obj: any): obj is FilterGroup {
  return obj && typeof obj === 'object' && ('logic' in obj) && Array.isArray(obj.conditions)
}

const sanitizeGroup = (group: FilterGroup) => {
  group.conditions.forEach((cond: any) => {
    if (isFilterGroup(cond)) {
      sanitizeGroup(cond)
    } else {
      const type = getFieldType(cond.field)
      
      // Auto-correct invalid legacy operators
      if (type === 'number' || type === 'date' || type === 'datetime') {
        if (!['equals', 'notEquals', 'gt', 'lt', 'between', 'isEmpty', 'isNotEmpty'].includes(cond.operator)) {
            cond.operator = 'equals'
        }
      } else if (type === 'boolean') {
        if (!['equals', 'notEquals', 'isEmpty', 'isNotEmpty'].includes(cond.operator)) {
            cond.operator = 'equals'
        }
      }

      if (type === 'number') {
        if (typeof cond.value === 'string' && cond.value !== '') {
          cond.value = Number(cond.value)
        }
        if (typeof cond.value2 === 'string' && cond.value2 !== '') {
          cond.value2 = Number(cond.value2)
        }
      } else if (type === 'boolean') {
        if (cond.value === 'true') cond.value = true
        if (cond.value === 'false') cond.value = false
      }
    }
  })
}

sanitizeGroup(localGroup.value)

watch(() => props.group, (newVal) => {
  const cloned = JSON.parse(JSON.stringify(newVal))
  sanitizeGroup(cloned)
  localGroup.value = cloned
}, { deep: true })

const getOperatorsForField = (fieldKey: string) => {
  const type = getFieldType(fieldKey)
  const ops = operators.value
  if (type === 'number' || type === 'date' || type === 'datetime') {
    return ops.filter(op => ['equals', 'notEquals', 'gt', 'lt', 'between', 'isEmpty', 'isNotEmpty'].includes(op.value))
  } else if (type === 'boolean') {
    return ops.filter(op => ['equals', 'notEquals', 'isEmpty', 'isNotEmpty'].includes(op.value))
  }
  // string or default
  return ops.filter(op => ['equals', 'notEquals', 'contains', 'notContains', 'startsWith', 'endsWith', 'isEmpty', 'isNotEmpty'].includes(op.value))
}

const getFieldInputType = (fieldKey: string) => {
  const type = getFieldType(fieldKey)
  if (type === 'number') return 'number'
  if (type === 'date') return 'date'
  if (type === 'datetime') return 'datetime-local'
  return 'text'
}

const emitUpdate = () => {
  emit('update', localGroup.value)
}

const addRule = () => {
  const field = props.columns[0]?.key || ''
  const ops = getOperatorsForField(field)
  localGroup.value.conditions.push({
    field: field,
    operator: ops[0]?.value || 'equals',
    value: ''
  } as FilterCondition)
  emitUpdate()
}

const addGroup = () => {
  localGroup.value.conditions.push({
    logic: 'AND',
    conditions: []
  } as FilterGroup)
  emitUpdate()
}

const updateCondition = (index: number, updatedCondition: FilterGroup | FilterCondition) => {
  localGroup.value.conditions[index] = updatedCondition
  emitUpdate()
}

const removeCondition = (index: number) => {
  localGroup.value.conditions.splice(index, 1)
  emitUpdate()
}

const onFieldChange = (condition: FilterCondition) => {
  // Check if current operator is still valid for new field type
  const validOps = getOperatorsForField(condition.field)
  if (!validOps.find(op => op.value === condition.operator)) {
    condition.operator = validOps[0]?.value as any || 'equals'
  }
  
  // Reset value if switching to boolean
  if (getFieldType(condition.field) === 'boolean') {
    condition.value = true;
    condition.value2 = undefined;
  }
  emitUpdate()
}

const onOperatorChange = (condition: FilterCondition) => {
  if (['isEmpty', 'isNotEmpty'].includes(condition.operator)) {
    condition.value = undefined
    condition.value2 = undefined
  }
  emitUpdate()
}
</script>

<style scoped>
.filter-group {
  padding: 8px 0;
}
.filter-group:not(.is-root) {
  background: rgba(var(--v-theme-surface-variant), 0.3);
  padding: 12px;
  border-radius: 8px;
}
.gap-2 {
  gap: 8px;
}
.field-select {
  max-width: 180px;
}
.op-select {
  max-width: 140px;
}
</style>
