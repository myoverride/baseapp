<template>
  <div class="er-entity-card" :class="{ 'er-entity-card--selected': selected }" :data-entity-id="entity.id"
    ref="cardRef">
    <!-- Header -->
    <div class="er-entity-header" :style="headerStyle" @dblclick.stop="$emit('editEntity', entity)">
      <div class="er-entity-header-content">
        <v-icon size="14" color="white" class="mr-1">mdi-table</v-icon>
        <span class="er-entity-title">{{ $localize(entity.name) }}</span>
      </div>
      <div class="er-entity-header-actions">
        <v-icon size="13" color="white" class="er-header-btn" @click.stop="$emit('editEntity', entity)"
          :title="$t('common.edit')">mdi-pencil</v-icon>
        <v-icon size="13" color="white" class="er-header-btn er-header-btn--danger"
          @click.stop="$emit('deleteEntity', entity)" :title="$t('common.delete')">mdi-delete</v-icon>
      </div>
    </div>

    <!-- Slug subtitle -->
    <div class="er-entity-slug">
      <v-icon size="10" color="grey" class="mr-1">mdi-link</v-icon>
      {{ entity.slug }}
    </div>

    <!-- Fields -->
    <div class="er-entity-fields" v-if="fields.length > 0">
      <ErFieldRow v-for="(field, idx) in fields" :key="field.name + '-' + idx" :field="field" :index="idx"
        :entity-id="entity.id" @edit="(f, i) => $emit('editField', entity, f, i)" />
    </div>
    <div v-else class="er-entity-empty">
      <span class="text-grey text-caption">{{ $t('common.noData') || 'Alan yok' }}</span>
    </div>

    <!-- Footer: field count -->
    <div class="er-entity-footer">
      <span class="er-entity-count">{{ fields.length }} alan</span>
    </div>
  </div>
</template>

<script setup lang="ts">
interface ErEntity {
  id: string | number
  name: string
  slug: string
  schema?: Record<string, any>
}

const { primaryColor: color } = useGlobals();
const props = defineProps<{
  entity: ErEntity
  selected?: boolean
  colorIndex?: number
}>()

defineEmits<{
  editEntity: [entity: ErEntity]
  deleteEntity: [entity: ErEntity]
  editField: [entity: ErEntity, field: any, index: number]
}>()

const cardRef = ref<HTMLElement | null>(null)

// Entity color palette
const entityColors = [
  '#1565C0', '#2E7D32', '#6A1B9A', '#C62828',
  '#00695C', '#E65100', '#283593', '#4E342E',
  '#00838F', '#AD1457', '#33691E', '#4527A0'
]

const headerColor = computed(() => {
  const idx = props.colorIndex ?? (Number(props.entity.id) || 0) % entityColors.length
  return entityColors[idx]
})

const headerStyle = computed(() => ({
  background: `linear-gradient(135deg, ${headerColor.value}, ${headerColor.value}dd)`
}))

// Parse schema into field array
const fields = computed(() => {
  const schema = props.entity.schema || {}
  return Object.entries(schema)
    .map(([name, def]: [string, any]) => ({
      name,
      label: def.label || '',
      type: def.type || 'string',
      required: def.rules?.required || false,
      unique: def.rules?.unique || false,
      isPrimary: def.isPrimary || false,
      showInTable: def.showInTable !== false,
      targetEntityId: def.targetEntityId,
      onDelete: def.onDelete || 'restrict',
      options: def.options || [],
      rulesList: def.rules?.custom || [],
      hashAlgorithm: def.hashAlgorithm || 'plain',
      _order: def._order || 0
    }))
    .sort((a, b) => a._order - b._order)
})

defineExpose({ cardRef, fields })
</script>

<style scoped>
.er-entity-card {
  background: #ffffff;
  border-radius: 8px;
  border: 1.5px solid #e0e0e0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
}

.er-entity-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.06);
  border-color: #bdbdbd;
}

.er-entity-card--selected {
  border-color: #1565C0;
  box-shadow: 0 0 0 2px rgba(21, 101, 192, 0.2), 0 4px 16px rgba(0, 0, 0, 0.12);
}

/* Header */
.er-entity-header {
  padding: 6px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: grab;
  min-height: 32px;
  border-radius: 6px 6px 0 0;
}

.er-entity-header-content {
  display: flex;
  align-items: center;
  flex: 1;
  overflow: hidden;
}

.er-entity-title {
  color: white;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.er-entity-header-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.er-entity-card:hover .er-entity-header-actions {
  opacity: 1;
}

.er-header-btn {
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.15s, transform 0.15s;
}

.er-header-btn:hover {
  opacity: 1;
  transform: scale(1.15);
}

.er-header-btn--danger:hover {
  color: #FFCDD2 !important;
}

/* Slug */
.er-entity-slug {
  padding: 2px 10px 4px;
  font-size: 9px;
  color: #9e9e9e;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #f0f0f0;
  letter-spacing: 0.3px;
}

/* Fields */
.er-entity-fields {
  flex: 1;
}

.er-entity-fields::-webkit-scrollbar {
  width: 3px;
}

.er-entity-fields::-webkit-scrollbar-thumb {
  background: #e0e0e0;
  border-radius: 3px;
}

.er-entity-empty {
  padding: 12px;
  text-align: center;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Footer */
.er-entity-footer {
  padding: 3px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid #f0f0f0;
  background: #fafafa;
  border-radius: 0 0 6px 6px;
}

.er-entity-count {
  font-size: 9px;
  color: #9e9e9e;
  font-weight: 500;
}


</style>
